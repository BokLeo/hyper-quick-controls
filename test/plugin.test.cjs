'use strict';

const {test, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const plugin = require('../index');

class Component {
  constructor(props) { this.props = props; }
  setState(update) { Object.assign(this.state, typeof update === 'function' ? update(this.state) : update); }
}
const React = {
  Component, Fragment: 'fragment',
  createElement: (type, props, ...children) => ({type, props: props || {}, children}),
};

function setup() {
  const sent = [];
  const saved = new Map();
  const state = {
    ui: {backgroundColor: '#000', foregroundColor: '#fff', borderColor: '#333'},
    sessions: {sessions: {a: {}, b: {}}, broadcast: []},
    termGroups: {termGroups: {root: {}, leaf: {parentUid: 'root'}}},
  };
  global.window = {
    rpc: {emit: (...args) => sent.push(args)},
    localStorage: {getItem: (key) => saved.get(key), setItem: (key, value) => saved.set(key, value)},
    store: {getState: () => state},
    focusActiveTerm: () => {},
  };
  const Panel = plugin.decorateHyper('Hyper', {React});
  return {sent, saved, state, Panel};
}
afterEach(() => { delete global.window; });

test('native buttons work without a plugin relay', () => {
  const f = setup();
  const panel = new f.Panel({});
  for (const action of ['newTab', 'previousTab', 'nextTab', 'splitRight', 'splitDown', 'previousPane', 'nextPane']) {
    panel.run(action);
  }
  assert.deepEqual(f.sent, ['tab:new', 'tab:prev', 'tab:next', 'pane:splitRight', 'pane:splitDown', 'pane:prev', 'pane:next']
    .map((command) => ['command', command]));
});

test('broadcast toggle reads live state even when component props are stale', () => {
  const f = setup();
  const panel = new f.Panel({});
  panel.run('broadcastToggle');
  f.state.sessions.broadcast = ['b'];
  panel.run('broadcastToggle');
  f.state.sessions.broadcast = ['closed-pane'];
  panel.run('broadcastToggle');
  assert.deepEqual(f.sent.map((entry) => entry[1]), ['broadcastTab', 'broadcastOff', 'broadcastTab']);
});

test('main-process relay rejects unknown actions and survives plugin reloads', () => {
  setup();
  const rpc = new EventEmitter();
  const sent = [];
  const win = {rpc: {
    on: rpc.on.bind(rpc), removeListener: rpc.removeListener.bind(rpc),
    emit: (...args) => sent.push(args),
  }};
  plugin.onWindow(win);
  plugin.onWindow(win);
  rpc.emit('quick-controls:action', 'constructor');
  rpc.emit('quick-controls:action', 'arbitrary shell command');
  rpc.emit('quick-controls:action', 'broadcastTab');
  rpc.emit('quick-controls:action', 'broadcastOff');
  assert.deepEqual(sent, [['broadcast selectCurrentTabPanes'], ['broadcast reset']]);
});

test('each docking edge persists and reserves space for the terminal', () => {
  const f = setup();
  for (const [position, space] of [['left', 104], ['right', 104], ['top', 38], ['bottom', 64]]) {
    new f.Panel({}).setPosition(position);
    const restored = new f.Panel({});
    assert.equal(restored.state.position, position);
    const rendered = restored.render().props.customChildren.children;
    assert.ok(rendered[1].children[0].includes(`${position}: ${space}px !important`));
    assert.equal(rendered[2].props['data-position'], position);
  }
});

test('invalid or unavailable storage keeps the toolbar usable', () => {
  const f = setup();
  f.saved.set('hyper-quick-controls.position.v1', 'invalid');
  f.saved.set('hyper-quick-controls.language.v1', 'invalid');
  assert.equal(new f.Panel({}).state.position, 'top');
  assert.equal(new f.Panel({}).state.language, 'en');
  window.localStorage = {getItem() { throw Error('unavailable'); }, setItem() { throw Error('unavailable'); }};
  const panel = new f.Panel({});
  panel.setPosition('right');
  panel.setLanguage('ko');
  assert.equal(panel.state.position, 'right');
  assert.equal(panel.state.language, 'ko');
  panel.setPosition('invalid');
  assert.equal(panel.state.position, 'right');
});

test('toolbar preserves existing plugin content and exposes live broadcast state', () => {
  const f = setup();
  f.state.sessions.broadcast = ['b', 'closed-pane'];
  const existing = {type: 'other-plugin'};
  const props = plugin.mapHyperState(f.state, {customChildren: existing, customInnerChildren: existing});
  const rendered = new f.Panel(props).render();
  assert.equal(rendered.props.customInnerChildren, existing);
  assert.equal(rendered.props.customChildren.children[0], existing);
  const groups = rendered.props.customChildren.children[2].children[0].children;
  assert.deepEqual(groups.map((group) => group.props['aria-label']), ['hyper', 'hyper-controll']);
  const toggle = groups[1].children.find((child) => child.props.role === 'switch');
  assert.equal(toggle.props['aria-checked'], true);
  assert.match(toggle.props.title, /Broadcast input on · 1 pane/);
  assert.equal(toggle.children[1].children[0], 'Ctrl Alt P');
});

test('English is the default and the settings selector updates all UI labels immediately', () => {
  const f = setup();
  const panel = new f.Panel({quickControlsTargetCount: 2});
  const toolbar = () => panel.render().props.customChildren.children[2];
  const newTab = () => toolbar().children[0].children[0].children[0];
  const broadcast = () => toolbar().children[0].children[1].children[4];
  assert.equal(panel.state.language, 'en');
  assert.equal(newTab().props.title, 'New tab\nCtrl + Shift + T');
  assert.match(broadcast().props.title, /2 panes/);
  panel.state.settingsOpen = true;
  const languageSelect = panel.settings().children[1].children[2].children[1];
  assert.equal(languageSelect.props['aria-label'], 'Language');
  languageSelect.props.onChange({target: {value: 'ko'}});
  assert.equal(newTab().props.title, '새 탭\nCtrl + Shift + T');
  assert.match(broadcast().props.title, /2개 Pane/);
  assert.equal(toolbar().props.lang, 'ko');
  assert.equal(panel.settings().children[0].props['aria-label'], '툴바 설정');
  assert.equal(panel.state.settingsOpen, true);
  assert.deepEqual(f.sent, []);
  panel.setLanguage('en');
  assert.equal(newTab().props.title, 'New tab\nCtrl + Shift + T');
});

test('language preference persists separately from docking and rejects unsupported values', () => {
  const f = setup();
  const panel = new f.Panel({});
  panel.setPosition('right');
  panel.setLanguage('ko');
  const restored = new f.Panel({});
  assert.equal(restored.state.language, 'ko');
  assert.equal(restored.state.position, 'right');
  restored.setLanguage('unsupported');
  assert.equal(restored.state.language, 'ko');
  assert.equal(f.saved.get('hyper-quick-controls.language.v1'), 'ko');
});
