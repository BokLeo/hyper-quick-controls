'use strict';

const {test, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const plugin = require('../index');
const favorites = require('../favorites');

class Component {
  constructor(props) { this.props = props; }
  setState(update) { Object.assign(this.state, typeof update === 'function' ? update(this.state) : update); }
}
const UpstreamReact = {
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
    localStorage: {
      getItem: (key) => (saved.has(key) ? saved.get(key) : null),
      setItem: (key, value) => saved.set(key, value),
      removeItem: (key) => saved.delete(key),
    },
    store: {getState: () => state},
    focusActiveTerm: () => {},
  };
  const Panel = plugin.decorateHyper('Hyper', {React: UpstreamReact});
  return {sent, saved, state, Panel};
}
afterEach(() => {
  delete global.window;
  delete global.document;
});

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
  for (const [position, space] of [['left', 120], ['right', 120], ['top', 38], ['bottom', 64]]) {
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
  const group = rendered.props.customChildren.children[2].children[0].children[0];
  const toggle = group.children.find((child) => child.props.role === 'switch');
  assert.equal(toggle.props['aria-checked'], true);
  assert.match(toggle.props.title, /Broadcast input on · 1 pane/);
  assert.equal(toggle.children[1].children[0], 'Ctrl Alt P');
});

test('English is the default and the settings selector updates all UI labels immediately', () => {
  const f = setup();
  const panel = new f.Panel({quickControlsTargetCount: 2});
  const toolbar = () => panel.render().props.customChildren.children[2];
  const buttons = () => toolbar().children[0].children[0].children;
  const newTab = () => buttons().find((b) => b.props['data-order-id'] === 'newTab');
  const broadcast = () => buttons().find((b) => b.props['data-order-id'] === 'broadcastToggle');
  assert.equal(panel.state.language, 'en');
  assert.equal(newTab().props.title, 'New tab\nCtrl+Shift+T');
  assert.match(broadcast().props.title, /2 panes/);
  panel.state.settingsOpen = true;
  const languageSelect = panel.settings().children[1].children[2].children[1];
  assert.equal(languageSelect.props['aria-label'], 'Language');
  languageSelect.props.onChange({target: {value: 'ko'}});
  assert.equal(newTab().props.title, '새 탭\nCtrl+Shift+T');
  assert.match(broadcast().props.title, /2개 Pane/);
  assert.equal(toolbar().props.lang, 'ko');
  assert.equal(panel.settings().children[0].props['aria-label'], '툴바 설정');
  assert.equal(panel.state.settingsOpen, true);
  assert.deepEqual(f.sent, []);
  panel.setLanguage('en');
  assert.equal(newTab().props.title, 'New tab\nCtrl+Shift+T');
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

function createSeamlessLike(obj) {
  const clone = Object.assign({}, obj);
  Object.defineProperty(clone, 'set', {
    enumerable: false,
    value(key, val) {
      return createSeamlessLike(Object.assign({}, clone, {[key]: val}));
    },
  });
  Object.defineProperty(clone, 'without', {
    enumerable: false,
    value(key) {
      const next = Object.assign({}, clone);
      delete next[key];
      return createSeamlessLike(next);
    },
  });
  return clone;
}

function createMockReact() {
  const Fragment = Symbol('Fragment');
  class Component {
    constructor(props) {
      this.props = props || {};
      this.state = {};
    }
    setState(updater) {
      const patch = typeof updater === 'function' ? updater(this.state, this.props) : updater;
      this.state = Object.assign({}, this.state, patch);
    }
  }
  function createElement(type, props, ...children) {
    const flat = [];
    for (const child of children) {
      if (Array.isArray(child)) flat.push(...child);
      else if (child !== null && child !== undefined && child !== false) flat.push(child);
    }
    return {type, props: props || {}, children: flat};
  }
  return {Component, Fragment, createElement};
}

function findNodes(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (predicate(node)) out.push(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) findNodes(child, predicate, out);
  }
  if (node.props && node.props.customChildren) {
    findNodes(node.props.customChildren, predicate, out);
  }
  return out;
}

function getText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  return (node.children || []).map(getText).join('');
}

function createKeyEvent(props = {}) {
  let defaultPrevented = false;
  let propagationStopped = false;
  let immediateStopped = false;
  return Object.assign({
    key: '',
    code: '',
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    target: {tagName: 'TEXTAREA'},
    preventDefault() { defaultPrevented = true; },
    stopPropagation() { propagationStopped = true; },
    stopImmediatePropagation() { immediateStopped = true; },
    get defaultPrevented() { return defaultPrevented; },
    get propagationStopped() { return propagationStopped; },
    get immediateStopped() { return immediateStopped; },
  }, props);
}

function createPointerEvent(props = {}) {
  let defaultPrevented = false;
  let propagationStopped = false;
  return Object.assign({
    clientX: 0,
    clientY: 0,
    target: {tagName: 'DIV'},
    preventDefault() { defaultPrevented = true; },
    stopPropagation() { propagationStopped = true; },
    get defaultPrevented() { return defaultPrevented; },
    get propagationStopped() { return propagationStopped; },
  }, props);
}

function createBaseState(overrides = {}) {
  const sessions = Object.assign({
    activeUid: 's1',
    sessions: {
      s1: {uid: 's1', title: 'pwsh'},
      s2: {uid: 's2', title: 'bash'},
      s3: {uid: 's3', title: 'node'},
    },
    broadcast: [],
  }, overrides.sessions || {});

  const termGroups = overrides.termGroups || {
    activeRootGroup: 'gRoot1',
    termGroups: {
      gRoot1: {uid: 'gRoot1', parentUid: null, sessionUid: null, children: ['g1', 'g2', 'g3']},
      g1: {uid: 'g1', parentUid: 'gRoot1', sessionUid: 's1', children: []},
      g2: {uid: 'g2', parentUid: 'gRoot1', sessionUid: 's2', children: []},
      g3: {uid: 'g3', parentUid: 'gRoot1', sessionUid: 's3', children: []},
    },
  };

  const ui = createSeamlessLike(Object.assign({
    backgroundColor: '#111111',
    foregroundColor: '#eeeeee',
    borderColor: '#333333',
    uiFontFamily: 'sans-serif',
    quickControlsConfig: null,
  }, overrides.ui || {}));

  return {sessions, termGroups, ui};
}

function setupBrowserEnv(options = {}) {
  const docListeners = new Map();
  const winListeners = new Map();
  const storage = new Map(Object.entries(options.initialStorage || {}));
  const rpc = new EventEmitter();
  const rpcEmits = [];
  const origEmit = rpc.emit.bind(rpc);
  rpc.emit = (ev, ...args) => {
    rpcEmits.push({ev, args});
    return origEmit(ev, ...args);
  };

  let state = options.state || createBaseState();
  const dispatched = [];
  let termFocusCalls = 0;

  const terminalElement = {
    tagName: 'TEXTAREA',
    className: 'xterm-helper-textarea',
    isConnected: true,
    focusCount: 0,
    focus() {
      this.focusCount += 1;
      global.document.activeElement = this;
    },
  };

  function addListener(map, type, fn) {
    if (!map.has(type)) map.set(type, []);
    map.get(type).push(fn);
  }
  function removeListener(map, type, fn) {
    const list = map.get(type);
    if (!list) return;
    const idx = list.indexOf(fn);
    if (idx >= 0) list.splice(idx, 1);
  }

  // Simulated hyper-broadcast middleware on store.dispatch to verify SESSION_USER_DATA is not misused.
  const store = {
    getState: () => state,
    setState(next) { state = next; },
    dispatched,
    dispatch(action) {
      dispatched.push(action);
      if (action.type === 'SESSION_USER_DATA') {
        const targets = (state.sessions.broadcast || []).filter(
          (uid) => uid !== state.sessions.activeUid && !!state.sessions.sessions[uid]
        );
        for (const uid of targets) {
          rpc.emit('data', {uid, data: action.data});
        }
      }
      if (action.type === 'CONFIG_LOAD' || action.type === 'CONFIG_RELOAD') {
        state = Object.assign({}, state, {
          ui: plugin.reduceUI(state.ui, action),
        });
      }
      return action;
    },
  };

  global.document = {
    activeElement: terminalElement,
    addEventListener(type, fn) { addListener(docListeners, type, fn); },
    removeEventListener(type, fn) { removeListener(docListeners, type, fn); },
    dispatch(type, event) {
      for (const fn of (docListeners.get(type) || []).slice()) fn(event);
    },
    listenerTypes: () => Array.from(docListeners.keys()),
  };

  global.window = {
    innerWidth: 1280,
    innerHeight: 800,
    rpc,
    store,
    config: options.hyperConfig ? {getConfig: () => options.hyperConfig} : undefined,
    focusActiveTerm() {
      termFocusCalls += 1;
      if (options.focusActiveTermRestoresElement !== false) {
        terminalElement.focus();
      }
    },
    addEventListener(type, fn) { addListener(winListeners, type, fn); },
    removeEventListener(type, fn) { removeListener(winListeners, type, fn); },
    dispatch(type, event) {
      for (const fn of (winListeners.get(type) || []).slice()) fn(event);
    },
    listenerTypes: () => Array.from(winListeners.keys()),
    localStorage: options.throwingStorage
      ? {
          getItem() { throw new Error('storage blocked'); },
          setItem() { throw new Error('storage blocked'); },
        }
      : {
          getItem(key) { return storage.has(key) ? storage.get(key) : null; },
          setItem(key, value) { storage.set(key, String(value)); },
          removeItem(key) { storage.delete(key); },
        },
  };

  return {
    rpc,
    rpcEmits,
    storage,
    store,
    terminalElement,
    getTermFocusCalls: () => termFocusCalls,
  };
}

test('onWindow replaces prior listener and forwards broadcast IPC; baseline commands and broadcastToggle work', () => {
  const rpc = new EventEmitter();
  const seen = [];
  rpc.on('broadcast selectCurrentTabPanes', () => seen.push('tab'));
  rpc.on('broadcast reset', () => seen.push('reset'));

  const win = {rpc};
  plugin.onWindow(win);
  plugin.onWindow(win);

  rpc.emit('quick-controls:action', 'broadcastTab');
  rpc.emit('quick-controls:action', 'broadcastOff');
  rpc.emit('quick-controls:action', 'ignored');

  assert.deepEqual(seen, ['tab', 'reset']);
  assert.equal(rpc.listenerCount('quick-controls:action'), 1);

  // Verify toolbar native command and existing broadcastToggle routing.
  const React = createMockReact();
  const env = setupBrowserEnv();
  const QuickControls = plugin.decorateHyper(() => null, {React});
  const instance = new QuickControls(plugin.mapHyperState(env.store.getState(), {isMac: false}));
  const tree = instance.render();

  const newTabBtn = findNodes(tree, (n) => n.type === 'button' && String(n.props.title).startsWith('New tab'))[0];
  newTabBtn.props.onClick();
  assert.deepEqual(env.rpcEmits.find((e) => e.ev === 'command'), {ev: 'command', args: ['tab:new']});

  const broadcastBtn = findNodes(tree, (n) => n.props && n.props.role === 'switch')[0];
  broadcastBtn.props.onClick();
  assert.deepEqual(env.rpcEmits.find((e) => e.ev === 'quick-controls:action'), {
    ev: 'quick-controls:action',
    args: ['broadcastTab'],
  });
});

test('favorites shortcut is unset by default: no key opens palette or gets intercepted', () => {
  const React = createMockReact();
  const env = setupBrowserEnv({
    state: createBaseState({
      ui: {
        quickControlsConfig: {
          favorites: ['git status', 'npm test'],
        },
      },
    }),
  });

  const QuickControls = plugin.decorateHyper(() => null, {React});
  const instance = new QuickControls(plugin.mapHyperState(env.store.getState(), {isMac: false}));
  instance.componentDidMount();

  const probeEvents = [
    createKeyEvent({key: 'k', code: 'KeyK', ctrlKey: true, altKey: true}),
    createKeyEvent({key: 'p', code: 'KeyP', ctrlKey: true, shiftKey: true}),
    createKeyEvent({key: 'ArrowDown'}),
    createKeyEvent({key: 'ArrowUp'}),
    createKeyEvent({key: 'Enter'}),
    createKeyEvent({key: 'Escape'}),
  ];

  for (const ev of probeEvents) {
    global.window.dispatch('keydown', ev);
    assert.equal(instance.state.favoritesOpen, false);
    assert.equal(ev.defaultPrevented, false);
    assert.equal(ev.propagationStopped, false);
  }

  const tree = instance.render();
  assert.equal(findNodes(tree, (n) => n.props && n.props.className === 'hqt-favorites').length, 0);
  instance.componentWillUnmount();
});

test('configured shortcut opens/closes palette, Esc closes, Up/Down navigates, and Enter inserts without executing while restoring focus', () => {
  const React = createMockReact();
  const env = setupBrowserEnv({focusActiveTermRestoresElement: false});

  // Load config via reduceUI (Hyper CONFIG_LOAD convention).
  env.store.dispatch({
    type: 'CONFIG_LOAD',
    config: {
      quickControls: {
        favoritesShortcut: 'Ctrl+Alt+K',
        favorites: [
          {label: 'Git status', command: 'git status'},
          {label: 'Run tests', command: 'npm test'},
          'ls -la',
        ],
      },
    },
  });

  const QuickControls = plugin.decorateHyper(() => null, {React});
  const instance = new QuickControls(plugin.mapHyperState(env.store.getState(), {isMac: false}));
  instance.componentDidMount();

  // When closed, ArrowDown/Enter/Escape pass through untouched.
  const closedEnter = createKeyEvent({key: 'Enter'});
  global.window.dispatch('keydown', closedEnter);
  assert.equal(closedEnter.defaultPrevented, false);

  // Open via configured shortcut Ctrl+Alt+K.
  global.document.activeElement = env.terminalElement;
  const openEv = createKeyEvent({key: 'k', code: 'KeyK', ctrlKey: true, altKey: true});
  global.window.dispatch('keydown', openEv);
  assert.equal(openEv.defaultPrevented, true);
  assert.equal(openEv.propagationStopped, true);
  assert.equal(openEv.immediateStopped, true);
  assert.equal(instance.state.favoritesOpen, true);
  assert.equal(instance.state.selectedIndex, 0);

  // Close with same shortcut -> restores original terminal focus.
  global.document.activeElement = {tagName: 'DIV'};
  const closeSameKeyEv = createKeyEvent({key: 'k', code: 'KeyK', ctrlKey: true, altKey: true});
  global.window.dispatch('keydown', closeSameKeyEv);
  assert.equal(closeSameKeyEv.defaultPrevented, true);
  assert.equal(instance.state.favoritesOpen, false);
  assert.equal(env.getTermFocusCalls(), 1);
  assert.equal(env.terminalElement.focusCount, 1);
  assert.equal(global.document.activeElement, env.terminalElement);

  // Re-open and close with Escape -> restores original terminal focus.
  global.window.dispatch('keydown', createKeyEvent({key: 'k', code: 'KeyK', ctrlKey: true, altKey: true}));
  assert.equal(instance.state.favoritesOpen, true);
  global.document.activeElement = {tagName: 'DIV'};
  const escEv = createKeyEvent({key: 'Escape'});
  global.window.dispatch('keydown', escEv);
  assert.equal(escEv.defaultPrevented, true);
  assert.equal(escEv.immediateStopped, true);
  assert.equal(instance.state.favoritesOpen, false);
  assert.equal(env.getTermFocusCalls(), 2);
  assert.equal(env.terminalElement.focusCount, 2);

  // Re-open, navigate Down -> Down -> Up (lands on index 1: 'npm test'), press Enter.
  global.window.dispatch('keydown', createKeyEvent({key: 'k', code: 'KeyK', ctrlKey: true, altKey: true}));
  const down1 = createKeyEvent({key: 'ArrowDown'});
  const down2 = createKeyEvent({key: 'ArrowDown'});
  const up1 = createKeyEvent({key: 'ArrowUp'});
  global.window.dispatch('keydown', down1);
  global.window.dispatch('keydown', down2);
  global.window.dispatch('keydown', up1);
  assert.equal(down1.defaultPrevented, true);
  assert.equal(down2.defaultPrevented, true);
  assert.equal(up1.defaultPrevented, true);
  assert.equal(instance.state.selectedIndex, 1);

  // Verify target indicator in palette shows Active pane · 1 when broadcast is off.
  const openTree = instance.render();
  const targetBadge = findNodes(openTree, (n) => n.props && n.props.className === 'hqt-favorites-target')[0];
  assert.equal(targetBadge.props['data-target-mode'], 'active');
  assert.equal(targetBadge.props['data-target-count'], 1);
  assert.equal(getText(targetBadge), 'Active pane · 1');

  global.document.activeElement = {tagName: 'DIV'};
  const enterEv = createKeyEvent({key: 'Enter'});
  global.window.dispatch('keydown', enterEv);
  // Enter itself is completely intercepted so it cannot reach xterm/terminal.
  assert.equal(enterEv.defaultPrevented, true);
  assert.equal(enterEv.propagationStopped, true);
  assert.equal(enterEv.immediateStopped, true);
  assert.equal(instance.state.favoritesOpen, false);
  assert.equal(env.getTermFocusCalls(), 3);
  assert.equal(env.terminalElement.focusCount, 3);

  // Broadcast off -> sent ONLY to active pane s1, exact text without newline/execution, no SESSION_USER_DATA.
  const dataEmits = env.rpcEmits.filter((e) => e.ev === 'data').map((e) => e.args[0]);
  assert.deepEqual(dataEmits, [{uid: 's1', data: 'npm test'}]);
  assert.equal(env.store.dispatched.some((a) => a.type === 'SESSION_USER_DATA'), false);

  instance.componentWillUnmount();
});

test('recent commands use the newest complete single-line PowerShell entries', () => {
  const {parseHistoryTail} = require('../favorites');
  const history = ['echo oldest', 'echo same', 'Get-ChildItem `', '  -File',
    'echo second', 'echo same', 'echo incomplete'].join('\r\n');
  assert.deepEqual(parseHistoryTail(history), ['echo same', 'echo second', 'echo same']);
  assert.deepEqual(parseHistoryTail('partial command\necho whole\n', true), ['echo whole']);
  const longHistory = Array.from({length: 60}, (_, index) => `echo ${index}\n`).join('');
  const expanded = parseHistoryTail(longHistory, false, true);
  assert.equal(expanded.length, 50);
  assert.equal(expanded[0], 'echo 59');
  assert.equal(expanded.at(-1), 'echo 10');
});

test('recent PowerShell commands can be added without sending terminal input', () => {
  const React = createMockReact();
  const env = setupBrowserEnv({state: createBaseState()});
  const config = {favorites: ['echo first', 'echo second', 'echo third', 'echo fourth']};
  const QuickControls = plugin.decorateHyper(() => null, {React});
  const instance = new QuickControls({...plugin.mapHyperState(env.store.getState(), {isMac: false}), quickControlsConfig: config});
  const readRecent = () => instance.getFavoritesSettings().recent.map(item => item.command);
  const readFavorites = () => instance.getFavoritesSettings().favorites;
  let receiveRecent;
  global.window.rpc.on = (_channel, listener) => { receiveRecent = listener; };
  instance.componentDidMount();
  instance.openFavorites();
  assert.ok(env.rpcEmits.some(event => event.ev === 'quick-controls:request-history'));
  receiveRecent(['echo second', 'echo fourth', 'echo third', 'echo older']);
  assert.deepEqual(readRecent(), ['echo second', 'echo fourth', 'echo third']);
  const findButton = label => findNodes(instance.render(), node => node.type === 'button' && getText(node) === label)[0];
  const more = findButton('More');
  assert.equal(more.props['aria-expanded'], false);
  more.props.onClick();
  assert.deepEqual(env.rpcEmits.at(-1), {ev: 'quick-controls:request-history', args: [true]});
  assert.deepEqual(readRecent(), ['echo second', 'echo fourth', 'echo third', 'echo older']);
  const less = findButton('Show less');
  assert.equal(less.props['aria-expanded'], true);
  less.props.onClick();
  assert.deepEqual(readRecent(), ['echo second', 'echo fourth', 'echo third']);

  instance.changeFavorites(readFavorites()[1], true);
  assert.equal(readFavorites().some(item => item.command === 'echo second'), false);
  assert.equal(readRecent()[0], 'echo second');
  instance.openFavorites();
  const addRecent = findNodes(instance.render(), node => node.type === 'button' && getText(node) === 'Add to favorites')[0];
  assert.equal(addRecent.props.disabled, false);
  addRecent.props.onClick();
  assert.equal(readFavorites().at(-1).command, 'echo second');

  instance.changeFavorites({...readFavorites()[0], label: 'Renamed', command: 'echo edited'});
  instance.changeFavorites({label: 'New', command: 'echo new'});
  instance.changeFavorites({command: 'echo new'});
  assert.equal(instance.state.favoriteError, 'favoriteDuplicate');
  instance.changeFavorites({command: 'echo invalid\nexit'});
  assert.equal(instance.state.favoriteError, 'favoriteInvalid');
  const reopened = new QuickControls(instance.props);
  assert.equal(reopened.getFavoritesSettings().favorites[0].label, 'Renamed');
  assert.equal(reopened.getFavoritesSettings().favorites.at(-1).command, 'echo new');
  assert.equal(env.rpcEmits.filter(event => event.ev === 'data').length, 0);
  instance.componentWillUnmount();
});

test('broadcast on: palette displays live broadcast mode & count and sends exactly once per live pane without duplicate broadcast', () => {
  const React = createMockReact();
  const env = setupBrowserEnv({
    state: createBaseState({
      sessions: {
        activeUid: 's3', // Active pane is s3, while broadcast targets live [s1, s2] + dead 'sDead' + dup 's1'.
        sessions: {
          s1: {uid: 's1', title: 'pane1'},
          s2: {uid: 's2', title: 'pane2'},
          s3: {uid: 's3', title: 'pane3'},
        },
        broadcast: ['s1', 'sDead', 's2', 's1'],
      },
      ui: {
        quickControlsConfig: {
          favoritesShortcut: 'Alt+F',
          favorites: ['echo hello'],
        },
      },
    }),
  });

  const QuickControls = plugin.decorateHyper(() => null, {React});
  const instance = new QuickControls(plugin.mapHyperState(env.store.getState(), {isMac: false}));
  instance.componentDidMount();

  global.window.dispatch('keydown', createKeyEvent({key: 'f', code: 'KeyF', altKey: true}));
  const tree = instance.render();
  const targetBadge = findNodes(tree, (n) => n.props && n.props.className === 'hqt-favorites-target')[0];
  assert.equal(targetBadge.props['data-target-mode'], 'broadcast');
  assert.equal(targetBadge.props['data-target-count'], 2);
  assert.equal(getText(targetBadge), 'Broadcast · 2 panes');

  // Press Enter -> sends 'echo hello' once to s1 and once to s2 (never sDead, never s3, never duplicated).
  global.window.dispatch('keydown', createKeyEvent({key: 'Enter'}));

  const dataEmits = env.rpcEmits.filter((e) => e.ev === 'data').map((e) => e.args[0]);
  assert.deepEqual(dataEmits, [
    {uid: 's1', data: 'echo hello'},
    {uid: 's2', data: 'echo hello'},
  ]);
  // Confirm SESSION_USER_DATA was NOT dispatched (which would trigger hyper-broadcast double-broadcast).
  assert.equal(env.store.dispatched.some((a) => a.type === 'SESSION_USER_DATA'), false);

  instance.componentWillUnmount();
});

test('blocks newlines and executable control characters and prevents Enter from leaking to terminal', () => {
  const React = createMockReact();
  const unsafeSamples = [
    'git status\n',
    'git status\r',
    'echo 1\r\necho 2',
    'ls\x03',
    'cat\x04',
    'echo \x1b[31mred',
    'echo \x9b31m',
    'ls\t-la',
    'echo\x7f',
    'echo\u2028whoami',
    'echo\u2029whoami',
  ];

  const sessions = createBaseState().sessions;
  const emits = [];
  const mockRpc = {emit: (ev, payload) => emits.push({ev, payload})};

  for (const sample of unsafeSamples) {
    const res = favorites.insertFavoriteCommand(sample, sessions, mockRpc);
    assert.equal(res.ok, false, `Expected unsafe sample to be blocked: ${JSON.stringify(sample)}`);
    assert.equal(res.reason, 'unsafe-control-char');
    assert.equal(res.sentCount, 0);
  }
  assert.equal(emits.length, 0);

  // Also test pressing Enter on an unsafe favorite in the UI palette.
  const env = setupBrowserEnv({
    state: createBaseState({
      ui: {
        quickControlsConfig: {
          favoritesShortcut: 'Ctrl+Alt+K',
          favorites: ['git status\nrm -rf /'],
        },
      },
    }),
  });
  const QuickControls = plugin.decorateHyper(() => null, {React});
  const instance = new QuickControls(plugin.mapHyperState(env.store.getState(), {isMac: false}));
  instance.componentDidMount();

  global.window.dispatch('keydown', createKeyEvent({key: 'k', code: 'KeyK', ctrlKey: true, altKey: true}));
  const enterEv = createKeyEvent({key: 'Enter'});
  global.window.dispatch('keydown', enterEv);
  assert.equal(enterEv.defaultPrevented, true);
  assert.equal(enterEv.immediateStopped, true);
  assert.equal(env.rpcEmits.filter((e) => e.ev === 'data').length, 0);
  assert.equal(instance.state.blockedNotice, true);

  const tree = instance.render();
  const alertNode = findNodes(tree, (n) => n.props && n.props.role === 'alert')[0];
  assert.ok(alertNode);
  assert.match(getText(alertNode), /Blocked/);

  instance.componentWillUnmount();
});

test('regression: no right-edge mouse hover trigger opens any panel and terminal drag selection & copy remain intact', () => {
  const React = createMockReact();
  const env = setupBrowserEnv({
    state: createBaseState({
      ui: {
        quickControlsConfig: {
          favoritesShortcut: 'Ctrl+Alt+K',
          favorites: ['git status'],
        },
      },
    }),
  });

  const QuickControls = plugin.decorateHyper(() => null, {React});
  const instance = new QuickControls(plugin.mapHyperState(env.store.getState(), {isMac: false}));
  instance.componentDidMount();

  // 1) No hover/mousemove/mouseenter/pointermove listeners are attached to document or window.
  const forbiddenHoverEvents = ['mousemove', 'mouseenter', 'mouseover', 'pointermove', 'pointerenter'];
  for (const evType of forbiddenHoverEvents) {
    assert.equal(global.document.listenerTypes().includes(evType), false);
    assert.equal(global.window.listenerTypes().includes(evType), false);
  }

  // Simulate moving pointer/mouse to the far right edge of the window (x = 1279 of 1280).
  for (const evType of forbiddenHoverEvents) {
    const moveEv = createPointerEvent({clientX: 1279, clientY: 200});
    global.document.dispatch(evType, moveEv);
    global.window.dispatch(evType, moveEv);
    assert.equal(instance.state.favoritesOpen, false);
    assert.equal(instance.state.settingsOpen, false);
  }

  // 2) Before using favorites: drag selection (pointerdown/mousedown/mousemove/mouseup) and copy are untouched.
  const termNode = {tagName: 'DIV', className: 'xterm-screen'};
  const dragDownBefore = createPointerEvent({clientX: 100, clientY: 120, target: termNode});
  global.document.dispatch('pointerdown', dragDownBefore);
  assert.equal(dragDownBefore.defaultPrevented, false);
  assert.equal(dragDownBefore.propagationStopped, false);

  const copyBefore = createKeyEvent({key: 'c', code: 'KeyC', ctrlKey: true, shiftKey: true, target: termNode});
  global.window.dispatch('keydown', copyBefore);
  assert.equal(copyBefore.defaultPrevented, false);
  assert.equal(copyBefore.propagationStopped, false);

  // 3) Open favorites and use it (Enter), then verify drag selection and copy STILL work untouched.
  global.window.dispatch('keydown', createKeyEvent({key: 'k', code: 'KeyK', ctrlKey: true, altKey: true}));
  global.window.dispatch('keydown', createKeyEvent({key: 'Enter'}));
  assert.equal(instance.state.favoritesOpen, false);

  // Also test dismissing via outside click (pointerdown on terminal) does NOT block drag start.
  global.window.dispatch('keydown', createKeyEvent({key: 'k', code: 'KeyK', ctrlKey: true, altKey: true}));
  instance.favoritesElement = {contains: () => false};
  const dragDownDismiss = createPointerEvent({clientX: 150, clientY: 140, target: termNode});
  global.document.dispatch('pointerdown', dragDownDismiss);
  assert.equal(instance.state.favoritesOpen, false);
  assert.equal(dragDownDismiss.defaultPrevented, false);
  assert.equal(dragDownDismiss.propagationStopped, false);

  const copyAfter = createKeyEvent({key: 'c', code: 'KeyC', ctrlKey: true, shiftKey: true, target: termNode});
  global.window.dispatch('keydown', copyAfter);
  assert.equal(copyAfter.defaultPrevented, false);
  assert.equal(copyAfter.propagationStopped, false);

  // CSS does not disable user-select on terminal containers.
  const tree = instance.render();
  const css = getText(findNodes(tree, (n) => n.type === 'style')[0]);
  assert.doesNotMatch(css, /user-select\s*:\s*none/i);

  instance.componentWillUnmount();
});

test('i18n (en/ko), settings shortcut persistence, 4-edge docking, invalid storage fallback, and customChildren preservation', () => {
  const React = createMockReact();
  const env = setupBrowserEnv({
    initialStorage: {
      'hyper-quick-controls.position.v1': 'invalid',
      'hyper-quick-controls.language.v1': 'ja',
    },
    state: createBaseState({
      sessions: {
        activeUid: 's1',
        sessions: {s1: {uid: 's1'}, s2: {uid: 's2'}},
        broadcast: ['s1', 's2'],
      },
      ui: {
        quickControlsConfig: {
          favorites: ['git status'],
        },
      },
    }),
  });

  const QuickControls = plugin.decorateHyper(() => null, {React});
  const mapped = plugin.mapHyperState(env.store.getState(), {
    isMac: false,
    customChildren: React.createElement('div', {id: 'other-plugin-child'}),
  });
  const instance = new QuickControls(mapped);
  instance.componentDidMount();

  assert.equal(instance.state.position, 'top');
  assert.equal(instance.state.language, 'en');

  // Set shortcut via Settings helper (persists to localStorage) and switch to Korean.
  instance.setFavoritesShortcut('Ctrl+Alt+J');
  assert.equal(env.storage.get(favorites.SHORTCUT_STORAGE_KEY), 'Ctrl+Alt+J');
  instance.setLanguage('ko');
  assert.equal(env.storage.get('hyper-quick-controls.language.v1'), 'ko');

  // Open with newly configured shortcut.
  global.window.dispatch('keydown', createKeyEvent({key: 'j', code: 'KeyJ', ctrlKey: true, altKey: true}));
  assert.equal(instance.state.favoritesOpen, true);

  let tree = instance.render();
  const dialogKo = findNodes(tree, (n) => n.props && n.props.className === 'hqt-favorites')[0];
  assert.equal(dialogKo.props['aria-label'], '명령 즐겨찾기');
  const targetBadgeKo = findNodes(dialogKo, (n) => n.props && n.props.className === 'hqt-favorites-target')[0];
  assert.equal(getText(targetBadgeKo), '다중 입력 · 2개 Pane');

  // Clearing shortcut disables keyboard trigger again.
  instance.closeFavorites(false);
  instance.setFavoritesShortcut('');
  assert.equal(env.storage.get(favorites.SHORTCUT_STORAGE_KEY), '');
  global.window.dispatch('keydown', createKeyEvent({key: 'j', code: 'KeyJ', ctrlKey: true, altKey: true}));
  assert.equal(instance.state.favoritesOpen, false);

  // Verify 4-edge docking persistence and CSS + customChildren preservation.
  for (const pos of ['top', 'bottom', 'left', 'right']) {
    instance.setPosition(pos);
    assert.equal(env.storage.get('hyper-quick-controls.position.v1'), pos);
    tree = instance.render();
    assert.ok(findNodes(tree, (n) => n.props && n.props.id === 'other-plugin-child')[0]);
    const css = getText(findNodes(tree, (n) => n.type === 'style')[0]);
    assert.match(css, /\.hqt-favorites/);
  }

  // Throwing localStorage falls back safely.
  setupBrowserEnv({throwingStorage: true});
  const throwingInstance = new QuickControls(mapped);
  assert.equal(throwingInstance.state.position, 'top');
  assert.equal(throwingInstance.state.language, 'en');
  assert.equal(throwingInstance.getFavoritesSettings().parsedShortcut, null);

  instance.componentWillUnmount();
});

test('regression: held Enter repeats after closing palette are blocked until keyup, and blur/missed keyup do not leave Enter stuck', () => {
  const React = createMockReact();
  const env = setupBrowserEnv({
    state: createBaseState({
      ui: {
        quickControlsConfig: {
          favoritesShortcut: 'Ctrl+Alt+K',
          favorites: ['git status', 'npm test'],
        },
      },
    }),
  });

  const QuickControls = plugin.decorateHyper(() => null, {React});
  const instance = new QuickControls(plugin.mapHyperState(env.store.getState(), {isMac: false}));
  instance.componentDidMount();

  // Case 1: Hold Enter during selection -> repeat keydowns after close are blocked until Enter keyup.
  global.window.dispatch('keydown', createKeyEvent({key: 'k', code: 'KeyK', ctrlKey: true, altKey: true}));
  assert.equal(instance.state.favoritesOpen, true);

  const selectEnter = createKeyEvent({key: 'Enter', repeat: false});
  global.window.dispatch('keydown', selectEnter);
  assert.equal(selectEnter.defaultPrevented, true);
  assert.equal(selectEnter.immediateStopped, true);
  assert.equal(instance.state.favoritesOpen, false);

  const repeatEnter1 = createKeyEvent({key: 'Enter', repeat: true});
  const repeatEnter2 = createKeyEvent({key: 'Enter', repeat: true});
  global.window.dispatch('keydown', repeatEnter1);
  global.window.dispatch('keydown', repeatEnter2);
  assert.equal(repeatEnter1.defaultPrevented, true);
  assert.equal(repeatEnter1.propagationStopped, true);
  assert.equal(repeatEnter1.immediateStopped, true);
  assert.equal(repeatEnter2.defaultPrevented, true);
  assert.equal(repeatEnter2.immediateStopped, true);

  // Releasing Enter clears suppression (and blocks the orphan selection keyup).
  const releaseEnter = createKeyEvent({key: 'Enter'});
  global.window.dispatch('keyup', releaseEnter);
  assert.equal(releaseEnter.defaultPrevented, true);

  // Fresh Enter after release passes through normally to the terminal.
  const freshEnterAfterKeyup = createKeyEvent({key: 'Enter', repeat: false});
  global.window.dispatch('keydown', freshEnterAfterKeyup);
  assert.equal(freshEnterAfterKeyup.defaultPrevented, false);
  assert.equal(freshEnterAfterKeyup.propagationStopped, false);

  const normalKeyup = createKeyEvent({key: 'Enter'});
  global.window.dispatch('keyup', normalKeyup);
  assert.equal(normalKeyup.defaultPrevented, false);

  // Case 2: Window blur while Enter is held clears suppression even if keyup is missed.
  global.window.dispatch('keydown', createKeyEvent({key: 'k', code: 'KeyK', ctrlKey: true, altKey: true}));
  global.window.dispatch('keydown', createKeyEvent({key: 'Enter', repeat: false}));
  assert.equal(instance.state.favoritesOpen, false);

  const repeatBeforeBlur = createKeyEvent({key: 'Enter', repeat: true});
  global.window.dispatch('keydown', repeatBeforeBlur);
  assert.equal(repeatBeforeBlur.defaultPrevented, true);

  global.window.dispatch('blur', {});

  const enterAfterBlur = createKeyEvent({key: 'Enter', repeat: false});
  global.window.dispatch('keydown', enterAfterBlur);
  assert.equal(enterAfterBlur.defaultPrevented, false);

  const repeatAfterBlur = createKeyEvent({key: 'Enter', repeat: true});
  global.window.dispatch('keydown', repeatAfterBlur);
  assert.equal(repeatAfterBlur.defaultPrevented, false);

  // Case 3: Document becomes hidden (visibilitychange) while Enter is held -> clears suppression.
  global.window.dispatch('keydown', createKeyEvent({key: 'k', code: 'KeyK', ctrlKey: true, altKey: true}));
  global.window.dispatch('keydown', createKeyEvent({key: 'Enter', repeat: false}));
  global.document.hidden = true;
  global.document.dispatch('visibilitychange', {});
  global.document.hidden = false;

  const repeatAfterHidden = createKeyEvent({key: 'Enter', repeat: true});
  global.window.dispatch('keydown', repeatAfterHidden);
  assert.equal(repeatAfterHidden.defaultPrevented, false);

  // Case 4: Missed keyup without blur -> a fresh non-repeat Enter still passes through normally.
  global.window.dispatch('keydown', createKeyEvent({key: 'k', code: 'KeyK', ctrlKey: true, altKey: true}));
  global.window.dispatch('keydown', createKeyEvent({key: 'Enter', repeat: false}));
  const freshWithoutKeyup = createKeyEvent({key: 'Enter', repeat: false});
  global.window.dispatch('keydown', freshWithoutKeyup);
  assert.equal(freshWithoutKeyup.defaultPrevented, false);

  // Verify the inserted text never contained execution newlines across all 4 selections.
  const dataEmits = env.rpcEmits.filter((e) => e.ev === 'data').map((e) => e.args[0]);
  assert.equal(dataEmits.length, 4);
  for (const payload of dataEmits) {
    assert.equal(payload.data, 'git status');
  }

  instance.componentWillUnmount();
});

test('toolbar favorites button exposes configured shortcut near top bar, stays unset by default, and toggles palette preserving focus/keyboard/drag', () => {
  const React = createMockReact();
  const env = setupBrowserEnv({
    focusActiveTermRestoresElement: false,
    state: createBaseState({
      ui: {
        quickControlsConfig: {
          favorites: [
            {label: 'Git status', command: 'git status'},
            {label: 'Run tests', command: 'npm test'},
          ],
        },
      },
    }),
  });

  const QuickControls = plugin.decorateHyper(() => null, {React});
  const instance = new QuickControls(plugin.mapHyperState(env.store.getState(), {isMac: false}));
  instance.componentDidMount();

  // Default: shortcut is unset -> button shows 'Favorites' and empty data-favorites-shortcut.
  let tree = instance.render();
  let favBtn = findNodes(tree, (n) => n.props && String(n.props.className).includes('hqt-favorites-button'))[0];
  assert.ok(favBtn);
  assert.equal(favBtn.props['data-favorites-shortcut'], '');
  assert.equal(favBtn.props['aria-expanded'], false);
  assert.equal(getText(favBtn), 'Favorites');

  // When user sets Ctrl+Alt+K (e.g., via Settings or .hyper.js), toolbar button displays Ctrl Alt K immediately.
  instance.setFavoritesShortcut('Ctrl+Alt+K');
  tree = instance.render();
  favBtn = findNodes(tree, (n) => n.props && String(n.props.className).includes('hqt-favorites-button'))[0];
  assert.equal(favBtn.props['data-favorites-shortcut'], 'Ctrl+Alt+K');
  assert.equal(getText(favBtn), 'Ctrl Alt K');
  assert.match(favBtn.props.title, /Ctrl\+Alt\+K/);

  // Attach mock DOM refs for button/toolbar/palette containment checks.
  const mockFavBtnEl = {contains: (t) => t === mockFavBtnEl};
  const mockToolbarEl = {contains: (t) => t === mockFavBtnEl || t === mockToolbarEl};
  favBtn.props.ref(mockFavBtnEl);
  const asideNode = findNodes(tree, (n) => n.type === 'aside')[0];
  asideNode.props.ref(mockToolbarEl);

  // Mouse down on draggable toolbar button captures terminal element without preventDefault (so HTML5 drag works).
  global.document.activeElement = env.terminalElement;
  const mouseDownEv = createPointerEvent({target: mockFavBtnEl});
  favBtn.props.onMouseDown(mouseDownEv);
  assert.equal(mouseDownEv.defaultPrevented, false);
  assert.equal(instance.lastTerminalElement, env.terminalElement);

  // Even if browser moves focus to button before click, click opens palette and preserves original terminal element.
  global.document.activeElement = mockFavBtnEl;
  favBtn.props.onClick();
  assert.equal(instance.state.favoritesOpen, true);

  tree = instance.render();
  favBtn = findNodes(tree, (n) => n.props && String(n.props.className).includes('hqt-favorites-button'))[0];
  assert.equal(favBtn.props['aria-expanded'], true);
  const dialogNode = findNodes(tree, (n) => n.props && n.props.className === 'hqt-favorites')[0];
  assert.ok(dialogNode);
  const mockDialogEl = {contains: (t) => t === mockDialogEl};
  dialogNode.props.ref(mockDialogEl);

  // Clicking the toolbar button again while open: pointerdown on button does NOT prematurely close, click toggles closed + restores focus.
  global.document.activeElement = {tagName: 'DIV'};
  global.document.dispatch('pointerdown', createPointerEvent({target: mockFavBtnEl}));
  assert.equal(instance.state.favoritesOpen, true);
  favBtn.props.onClick();
  assert.equal(instance.state.favoritesOpen, false);
  assert.equal(env.getTermFocusCalls(), 1);
  assert.equal(env.terminalElement.focusCount, 1);

  // Open via button -> keyboard ArrowDown + Enter inserts second command without executing and restores focus.
  global.document.activeElement = env.terminalElement;
  favBtn.props.onClick();
  assert.equal(instance.state.favoritesOpen, true);
  global.window.dispatch('keydown', createKeyEvent({key: 'ArrowDown'}));
  assert.equal(instance.state.selectedIndex, 1);

  global.document.activeElement = {tagName: 'DIV'};
  const enterEv = createKeyEvent({key: 'Enter', repeat: false});
  global.window.dispatch('keydown', enterEv);
  assert.equal(enterEv.defaultPrevented, true);
  assert.equal(instance.state.favoritesOpen, false);
  assert.equal(env.getTermFocusCalls(), 2);
  assert.equal(env.terminalElement.focusCount, 2);

  const dataEmits = env.rpcEmits.filter((e) => e.ev === 'data').map((e) => e.args[0]);
  assert.deepEqual(dataEmits, [{uid: 's1', data: 'npm test'}]);

  // After button-driven usage, terminal drag selection pointerdown is still never prevented.
  const termDragEv = createPointerEvent({target: {tagName: 'DIV', className: 'xterm-screen'}});
  global.document.dispatch('pointerdown', termDragEv);
  assert.equal(termDragEv.defaultPrevented, false);
  assert.equal(termDragEv.propagationStopped, false);

  // Clearing shortcut reverts toolbar badge back to localized label ('즐겨찾기' in ko).
  instance.setLanguage('ko');
  instance.setFavoritesShortcut('');
  tree = instance.render();
  favBtn = findNodes(tree, (n) => n.props && String(n.props.className).includes('hqt-favorites-button'))[0];
  assert.equal(favBtn.props['data-favorites-shortcut'], '');
  assert.equal(getText(favBtn), '즐겨찾기');

  instance.componentWillUnmount();
});

test('toolbar shortcut text uses default #3AEED9 without parent opacity dimming, excluding unset plain label', () => {
  const React = createMockReact();
  const env = setupBrowserEnv({
    state: createBaseState({
      ui: {
        backgroundColor: '#000000',
        foregroundColor: '#ffffff',
        borderColor: '#333333',
        quickControlsConfig: {
          favorites: ['git status'],
        },
      },
    }),
  });

  const QuickControls = plugin.decorateHyper(() => null, {React});
  const instance = new QuickControls(plugin.mapHyperState(env.store.getState(), {isMac: false}));

  // 1) Default shortcut color is #3aeed9 (#3AEED9); unset favorites button uses .hqt-label (not .hqt-shortcut).
  let tree = instance.render();
  let css = getText(findNodes(tree, (n) => n.type === 'style')[0]);
  assert.match(css, /--hqt-shortcut:\s*#3aeed9;/);
  assert.match(css, /\.hqt-shortcut\s*\{[^}]*color:\s*var\(--hqt-shortcut\);[^}]*opacity:\s*1;/);

  // Parent .hqt-button and .hqt-favorites-footer must NOT apply dimming opacity to descendants.
  const buttonRule = css.match(/\.hqt-button\s*\{([^}]*)\}/);
  assert.ok(buttonRule);
  assert.doesNotMatch(buttonRule[1], /opacity\s*:/);
  const footerRule = css.match(/\.hqt-favorites-footer[^{]*\{([^}]*)\}/);
  assert.ok(footerRule);
  assert.doesNotMatch(footerRule[1], /opacity\s*:/);

  // Icons and plain unset labels still use subtle opacity: 0.65.
  assert.match(css, /\.hqt-button svg\s*\{[^}]*opacity:\s*0\.65;/);
  assert.match(css, /\.hqt-label\s*\{[^}]*opacity:\s*0\.65;/);

  let favBtn = findNodes(tree, (n) => n.props && String(n.props.className).includes('hqt-favorites-button'))[0];
  assert.equal(findNodes(favBtn, (n) => n.type === 'kbd' && n.props.className === 'hqt-shortcut').length, 0);
  const unsetLabel = findNodes(favBtn, (n) => n.type === 'span' && n.props.className === 'hqt-label')[0];
  assert.ok(unsetLabel);
  assert.equal(getText(unsetLabel), 'Favorites');

  // 2) Setting a favorites shortcut switches the favorites button badge to <kbd class="hqt-shortcut">.
  instance.setFavoritesShortcut('Ctrl+Alt+K');
  tree = instance.render();
  favBtn = findNodes(tree, (n) => n.props && String(n.props.className).includes('hqt-favorites-button'))[0];
  assert.equal(findNodes(favBtn, (n) => n.props && n.props.className === 'hqt-label').length, 0);
  const favShortcutKbd = findNodes(favBtn, (n) => n.type === 'kbd' && n.props.className === 'hqt-shortcut')[0];
  assert.ok(favShortcutKbd);
  assert.equal(getText(favShortcutKbd), 'Ctrl Alt K');

  // Standard toolbar buttons also render their shortcuts with <kbd class="hqt-shortcut">.
  const allToolbarShortcuts = findNodes(tree, (n) => n.type === 'kbd' && n.props.className === 'hqt-shortcut');
  assert.equal(allToolbarShortcuts.length, 9);

  // 3) Light background also uses the default #3aeed9 color when unset.
  const lightState = createBaseState({
    ui: {
      backgroundColor: '#ffffff',
      foregroundColor: '#111111',
      borderColor: '#cccccc',
    },
  });
  const lightInstance = new QuickControls(plugin.mapHyperState(lightState, {isMac: false}));
  const lightCss = getText(findNodes(lightInstance.render(), (n) => n.type === 'style')[0]);
  assert.match(lightCss, /--hqt-shortcut:\s*#3aeed9;/);
});

test('settings popover supports custom shortcut text color, immediate apply, reload persistence, default #3AEED9 reset, and invalid storage fallback', () => {
  const React = createMockReact();
  const env = setupBrowserEnv({
    initialStorage: {
      'hyper-quick-controls.shortcutColor.v1': 'invalid; } body { display:none }',
    },
    state: createBaseState({
      ui: {
        backgroundColor: '#000000',
        foregroundColor: '#ffffff',
        borderColor: '#333333',
      },
    }),
  });

  const QuickControls = plugin.decorateHyper(() => null, {React});
  const mapped = plugin.mapHyperState(env.store.getState(), {isMac: false});
  const instance = new QuickControls(mapped);

  // Corrupted storage value safely falls back to Default (#3AEED9).
  assert.equal(instance.state.shortcutColor, '');
  instance.setState({settingsOpen: true});
  let tree = instance.render();
  let css = getText(findNodes(tree, (n) => n.type === 'style')[0]);
  assert.match(css, /--hqt-shortcut:\s*#3aeed9;/);

  let colorInput = findNodes(tree, (n) => n.type === 'input' && n.props.type === 'color')[0];
  let colorValue = findNodes(tree, (n) => n.props && n.props.className === 'hqt-color-value')[0];
  let resetBtn = findNodes(tree, (n) => n.props && n.props.className === 'hqt-color-reset')[0];
  assert.ok(colorInput);
  assert.equal(colorInput.props.value, '#3aeed9');
  assert.equal(colorValue.props['data-color-mode'], 'default');
  assert.equal(getText(colorValue), 'Default (#3AEED9)');
  assert.equal(getText(resetBtn), 'Reset');
  assert.equal(resetBtn.props.disabled, true);

  // Select a custom color -> applies immediately and persists to localStorage.
  colorInput.props.onChange({target: {value: '#FF6600'}});
  assert.equal(instance.state.shortcutColor, '#ff6600');
  assert.equal(env.storage.get('hyper-quick-controls.shortcutColor.v1'), '#ff6600');

  tree = instance.render();
  css = getText(findNodes(tree, (n) => n.type === 'style')[0]);
  assert.match(css, /--hqt-shortcut:\s*#ff6600;/);
  colorValue = findNodes(tree, (n) => n.props && n.props.className === 'hqt-color-value')[0];
  resetBtn = findNodes(tree, (n) => n.props && n.props.className === 'hqt-color-reset')[0];
  assert.equal(colorValue.props['data-color-mode'], 'custom');
  assert.equal(getText(colorValue), '#FF6600');
  assert.equal(resetBtn.props.disabled, false);

  // Simulate reload/restart: a new QuickControls instance restores the persisted custom color.
  const reloaded = new QuickControls(mapped);
  assert.equal(reloaded.state.shortcutColor, '#ff6600');
  const reloadedCss = getText(findNodes(reloaded.render(), (n) => n.type === 'style')[0]);
  assert.match(reloadedCss, /--hqt-shortcut:\s*#ff6600;/);

  // Switch to Korean and verify localized labels + Default reset restores #3AEED9.
  reloaded.setLanguage('ko');
  reloaded.setState({settingsOpen: true});
  tree = reloaded.render();
  const koLabel = findNodes(tree, (n) => n.props && n.props.className === 'hqt-color-label')[0];
  resetBtn = findNodes(tree, (n) => n.props && n.props.className === 'hqt-color-reset')[0];
  assert.equal(getText(koLabel), '단축키 글자색');
  assert.equal(getText(resetBtn), '기본값 복원');

  resetBtn.props.onClick();
  assert.equal(reloaded.state.shortcutColor, '');
  assert.equal(env.storage.get('hyper-quick-controls.shortcutColor.v1'), '');

  tree = reloaded.render();
  css = getText(findNodes(tree, (n) => n.type === 'style')[0]);
  assert.match(css, /--hqt-shortcut:\s*#3aeed9;/);
  colorValue = findNodes(tree, (n) => n.props && n.props.className === 'hqt-color-value')[0];
  assert.equal(colorValue.props['data-color-mode'], 'default');
  assert.equal(getText(colorValue), '기본 (#3AEED9)');

  // Reloading after reset keeps default #3AEED9 on any background.
  const lightMapped = plugin.mapHyperState(createBaseState({
    ui: {backgroundColor: '#ffffff', foregroundColor: '#111111', borderColor: '#cccccc'},
  }), {isMac: false});
  const lightReloaded = new QuickControls(lightMapped);
  assert.equal(lightReloaded.state.shortcutColor, '');
  const lightReloadedCss = getText(findNodes(lightReloaded.render(), (n) => n.type === 'style')[0]);
  assert.match(lightReloadedCss, /--hqt-shortcut:\s*#3aeed9;/);
});

test('settings popover uses − / + stepper buttons for shortcut text size (default 12px, 10-16px bounds), persists, and adapts docking layout without affecting terminal font', () => {
  const React = createMockReact();
  const env = setupBrowserEnv({
    initialStorage: {
      'hyper-quick-controls.shortcutFontSize.v1': '999',
    },
    state: createBaseState(),
  });

  const QuickControls = plugin.decorateHyper(() => null, {React});
  const mapped = plugin.mapHyperState(env.store.getState(), {isMac: false});
  const instance = new QuickControls(mapped);

  // Out-of-range storage falls back cleanly to default 12px.
  assert.equal(instance.state.shortcutFontSize, null);
  instance.setState({settingsOpen: true});
  let tree = instance.render();
  let css = getText(findNodes(tree, (n) => n.type === 'style')[0]);
  assert.match(css, /--hqt-shortcut-size:\s*12px;/);
  assert.match(css, /\.hqt-shortcut\s*\{[^}]*font:\s*var\(--hqt-shortcut-size\)\/1\.2/);
  // Never overrides terminal body font rules.
  assert.doesNotMatch(css, /\.terms_terms\s*\{[^}]*font-size/i);
  assert.doesNotMatch(css, /\.xterm/i);

  // Old size reset button and range input are replaced by − / + buttons.
  assert.equal(findNodes(tree, (n) => n.props && n.props.className === 'hqt-size-reset').length, 0);
  let decBtn = findNodes(tree, (n) => n.props && n.props['data-step'] === 'decrease')[0];
  let incBtn = findNodes(tree, (n) => n.props && n.props['data-step'] === 'increase')[0];
  let sizeValue = findNodes(tree, (n) => n.props && n.props.className === 'hqt-size-value')[0];
  assert.ok(decBtn);
  assert.ok(incBtn);
  assert.equal(decBtn.props.disabled, false);
  assert.equal(incBtn.props.disabled, false);
  assert.equal(sizeValue.props['data-size-mode'], 'default');
  assert.equal(getText(sizeValue), '12px');

  // Step down 2x to 10px -> 1px per click, decrease button becomes disabled at lower bound.
  decBtn.props.onClick();
  assert.equal(instance.state.shortcutFontSize, 11);
  assert.equal(env.storage.get('hyper-quick-controls.shortcutFontSize.v1'), '11');
  decBtn.props.onClick();
  assert.equal(instance.state.shortcutFontSize, 10);
  // Extra click at 10px stays clamped at 10px.
  decBtn.props.onClick();
  assert.equal(instance.state.shortcutFontSize, 10);

  instance.setPosition('right');
  instance.setState({settingsOpen: true});
  tree = instance.render();
  decBtn = findNodes(tree, (n) => n.props && n.props['data-step'] === 'decrease')[0];
  incBtn = findNodes(tree, (n) => n.props && n.props['data-step'] === 'increase')[0];
  sizeValue = findNodes(tree, (n) => n.props && n.props.className === 'hqt-size-value')[0];
  assert.equal(decBtn.props.disabled, true);
  assert.equal(incBtn.props.disabled, false);
  assert.equal(getText(sizeValue), '10px');
  css = getText(findNodes(tree, (n) => n.type === 'style')[0]);
  assert.match(css, /right:\s*104px\s*!important;/);

  // Step up 6x from 10px to 16px -> increase button becomes disabled at upper bound and vertical layout expands.
  for (let i = 0; i < 6; i += 1) incBtn.props.onClick();
  assert.equal(instance.state.shortcutFontSize, 16);
  assert.equal(env.storage.get('hyper-quick-controls.shortcutFontSize.v1'), '16');

  instance.setPosition('left');
  instance.setState({settingsOpen: true});
  tree = instance.render();
  decBtn = findNodes(tree, (n) => n.props && n.props['data-step'] === 'decrease')[0];
  incBtn = findNodes(tree, (n) => n.props && n.props['data-step'] === 'increase')[0];
  sizeValue = findNodes(tree, (n) => n.props && n.props.className === 'hqt-size-value')[0];
  assert.equal(decBtn.props.disabled, false);
  assert.equal(incBtn.props.disabled, true);
  assert.equal(getText(sizeValue), '16px');
  css = getText(findNodes(tree, (n) => n.type === 'style')[0]);
  assert.match(css, /--hqt-shortcut-size:\s*16px;/);
  assert.match(css, /left:\s*154px\s*!important;/);
  assert.match(css, /width:\s*154px;/);
  assert.match(css, /min-height:\s*52px;\s*height:\s*auto;/);
  assert.match(css, /text-overflow:\s*ellipsis;/);

  // Reloading restores persisted 16px size; stepping back to 12px returns to default mode.
  const reloaded = new QuickControls(mapped);
  assert.equal(reloaded.state.shortcutFontSize, 16);
  for (let i = 0; i < 4; i += 1) reloaded.stepShortcutFontSize(-1);
  assert.equal(reloaded.state.shortcutFontSize, null);
  assert.equal(env.storage.get('hyper-quick-controls.shortcutFontSize.v1'), '');
});

test('shortcut settings modal customizes all actions, migrates legacy favoritesShortcut, blocks conflicts & key leaks, and avoids duplicate default execution', () => {
  const React = createMockReact();
  const env = setupBrowserEnv({
    initialStorage: {
      // Legacy storage key from earlier version -> should auto-migrate into shortcuts.v1.
      'hyper-quick-controls.favoritesShortcut.v1': 'Ctrl+Alt+K',
    },
    state: createBaseState({
      ui: {
        quickControlsConfig: {
          favoritesShortcut: 'Ctrl+Alt+K',
          favorites: ['git status'],
        },
      },
    }),
  });

  const QuickControls = plugin.decorateHyper(() => null, {React});
  const mapped = plugin.mapHyperState(env.store.getState(), {isMac: false});
  const instance = new QuickControls(mapped);
  instance.componentDidMount();

  // 1) Legacy favoritesShortcut.v1 migrated to shortcuts.v1 automatically.
  const migratedRaw = env.storage.get('hyper-quick-controls.shortcuts.v1');
  assert.ok(migratedRaw);
  assert.deepEqual(JSON.parse(migratedRaw), {favoritesToggle: 'Ctrl+Alt+K'});

  // 2) Settings popover replaces favorites shortcut text input with Shortcut settings button.
  instance.setState({settingsOpen: true});
  let tree = instance.render();
  assert.equal(findNodes(tree, (n) => n.props && n.props.className === 'hqt-shortcut-input').length, 0);
  const openModalBtn = findNodes(tree, (n) => n.props && n.props.className === 'hqt-open-shortcuts-button')[0];
  assert.ok(openModalBtn);
  assert.equal(getText(openModalBtn), 'Shortcut settings…');

  // Attach mock settingsButton ref to verify focus restoration on Esc.
  let settingsBtnFocused = 0;
  const mockSettingsBtn = {
    isConnected: true,
    focus() { settingsBtnFocused += 1; },
  };
  const settingsBtnNode = findNodes(tree, (n) => n.type === 'button' && n.props['aria-label'] === 'Toolbar settings')[0];
  settingsBtnNode.props.ref(mockSettingsBtn);

  // 3) Default native shortcuts (e.g., Ctrl+Shift+T for newTab, Ctrl+Alt+T for broadcastTab) are NOT intercepted by renderer (no duplicate execution!).
  const defaultNewTabEv = createKeyEvent({key: 'T', code: 'KeyT', ctrlKey: true, shiftKey: true});
  global.window.dispatch('keydown', defaultNewTabEv);
  assert.equal(defaultNewTabEv.defaultPrevented, false);
  assert.equal(env.rpcEmits.length, 0);

  const defaultBroadcastEv = createKeyEvent({key: 't', code: 'KeyT', ctrlKey: true, altKey: true});
  global.window.dispatch('keydown', defaultBroadcastEv);
  assert.equal(defaultBroadcastEv.defaultPrevented, false);
  assert.equal(env.rpcEmits.length, 0);

  // 4) Open accessible Shortcut Settings modal: lists all 10 actions and scope note.
  openModalBtn.props.onClick();
  assert.equal(instance.state.shortcutsModalOpen, true);
  assert.equal(instance.state.settingsOpen, false);

  tree = instance.render();
  const modal = findNodes(tree, (n) => n.props && n.props.className === 'hqt-shortcuts-modal')[0];
  assert.ok(modal);
  assert.equal(modal.props.role, 'dialog');
  assert.equal(modal.props['aria-modal'], true);
  const mockModalEl = {contains: (t) => t === mockModalEl};
  modal.props.ref(mockModalEl);

  // 9 orderable toolbar items (with broadcastToggle grouped) containing all 10 configurable actions.
  const orderCards = findNodes(modal, (n) => n.props && n.props.role === 'listitem');
  assert.equal(orderCards.length, 9);
  const actionRows = findNodes(modal, (n) => n.props && typeof n.props['data-action-id'] === 'string');
  assert.equal(actionRows.length, 10);
  const noteNode = findNodes(modal, (n) => n.props && n.props.className === 'hqt-shortcuts-note')[0];
  assert.match(getText(noteNode), /built-in Hyper \/ hyper-broadcast defaults remain active/i);

  // 5) Stray keys aimed outside the modal (e.g. terminal textarea) are blocked from leaking to terminal.
  const strayKey = createKeyEvent({key: 'a', code: 'KeyA', target: env.terminalElement});
  global.window.dispatch('keydown', strayKey);
  assert.equal(strayKey.defaultPrevented, true);
  assert.equal(strayKey.immediateStopped, true);

  // 6) Record custom shortcuts for newTab (Alt+N) and broadcastTab (Ctrl+Alt+G); test conflict blocking first.
  const recordNewTabBtn = findNodes(modal, (n) => n.props && n.props['data-record-action'] === 'newTab')[0];
  recordNewTabBtn.props.onClick();
  assert.equal(instance.state.recordingActionId, 'newTab');

  // Bare key without modifier is blocked and does NOT leak to terminal.
  const bareKey = createKeyEvent({key: 'a', code: 'KeyA'});
  global.window.dispatch('keydown', bareKey);
  assert.equal(bareKey.defaultPrevented, true);
  assert.equal(bareKey.immediateStopped, true);
  assert.match(instance.state.shortcutError, /Ctrl, Alt, Meta/);
  assert.equal(instance.state.recordingActionId, 'newTab');

  // Reserved Hyper shortcut (Ctrl+Shift+K clearBuffer) is blocked as conflict.
  const conflictReserved = createKeyEvent({key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true});
  global.window.dispatch('keydown', conflictReserved);
  assert.equal(conflictReserved.defaultPrevented, true);
  assert.match(instance.state.shortcutError, /editor:clearBuffer/);

  // Another action's shortcut (Ctrl+Alt+K used by favoritesToggle) is blocked as conflict.
  const conflictOtherAction = createKeyEvent({key: 'k', code: 'KeyK', ctrlKey: true, altKey: true});
  global.window.dispatch('keydown', conflictOtherAction);
  assert.equal(conflictOtherAction.defaultPrevented, true);
  assert.match(instance.state.shortcutError, /Command favorites/);

  // Valid non-conflicting shortcut Alt+N succeeds and exits recording.
  const validNewTab = createKeyEvent({key: 'n', code: 'KeyN', altKey: true});
  global.window.dispatch('keydown', validNewTab);
  assert.equal(validNewTab.defaultPrevented, true);
  assert.equal(instance.state.recordingActionId, null);
  assert.equal(instance.state.shortcutError, null);
  assert.equal(instance.state.shortcutOverrides.newTab, 'Alt+N');

  // Assigning newTab's custom Alt+N to splitRight is blocked as action conflict.
  const conflictRes = instance.setActionShortcut('splitRight', 'Alt+N');
  assert.equal(conflictRes.ok, false);
  assert.equal(conflictRes.reason, 'action-conflict');

  // Assigning newTab's native default Ctrl+Shift+T to splitRight is ALSO blocked (still active in Hyper!).
  const conflictNativeDefault = instance.setActionShortcut('splitRight', 'Ctrl+Shift+T');
  assert.equal(conflictNativeDefault.ok, false);
  assert.equal(conflictNativeDefault.reason, 'action-conflict');

  // Customize broadcastTab -> Ctrl+Alt+G.
  const bcastRes = instance.setActionShortcut('broadcastTab', 'Ctrl+Alt+G');
  assert.equal(bcastRes.ok, true);

  // Start recording on splitDown, then press Esc -> cancels recording WITHOUT closing modal.
  instance.setState({recordingActionId: 'splitDown'});
  const escCancelRec = createKeyEvent({key: 'Escape'});
  global.window.dispatch('keydown', escCancelRec);
  assert.equal(escCancelRec.defaultPrevented, true);
  assert.equal(instance.state.recordingActionId, null);
  assert.equal(instance.state.shortcutsModalOpen, true);

  // Press Esc again (not recording) -> closes modal and restores focus to settingsButton.
  const escCloseModal = createKeyEvent({key: 'Escape'});
  global.window.dispatch('keydown', escCloseModal);
  assert.equal(escCloseModal.defaultPrevented, true);
  assert.equal(instance.state.shortcutsModalOpen, false);
  assert.equal(settingsBtnFocused, 1);

  // 7) Toolbar labels AND live execution reflect the custom shortcuts!
  tree = instance.render();
  const newTabToolbarBtn = findNodes(tree, (n) => n.type === 'button' && String(n.props.title).startsWith('New tab'))[0];
  assert.equal(getText(newTabToolbarBtn), 'Alt N');
  const bcastToolbarBtn = findNodes(tree, (n) => n.props && n.props.role === 'switch')[0];
  assert.equal(getText(bcastToolbarBtn), 'Ctrl Alt G');

  // Pressing Alt+N dispatches tab:new once.
  const runNewTabEv = createKeyEvent({key: 'n', code: 'KeyN', altKey: true});
  global.window.dispatch('keydown', runNewTabEv);
  assert.equal(runNewTabEv.defaultPrevented, true);
  assert.deepEqual(env.rpcEmits.filter((e) => e.ev === 'command'), [{ev: 'command', args: ['tab:new']}]);

  // Pressing Ctrl+Alt+G dispatches broadcastTab once.
  const runBcastEv = createKeyEvent({key: 'g', code: 'KeyG', ctrlKey: true, altKey: true});
  global.window.dispatch('keydown', runBcastEv);
  assert.equal(runBcastEv.defaultPrevented, true);
  assert.deepEqual(env.rpcEmits.filter((e) => e.ev === 'quick-controls:action'), [
    {ev: 'quick-controls:action', args: ['broadcastTab']},
  ]);

  // 8) Persistence across reload, unset favoritesToggle, and resetAll.
  const reloaded = new QuickControls(mapped);
  assert.equal(reloaded.state.shortcutOverrides.newTab, 'Alt+N');
  assert.equal(reloaded.state.shortcutOverrides.broadcastTab, 'Ctrl+Alt+G');
  assert.equal(reloaded.state.shortcutOverrides.favoritesToggle, 'Ctrl+Alt+K');

  // Unset favoritesToggle explicitly -> overrides .hyper.js Ctrl+Alt+K to empty.
  reloaded.setActionShortcut('favoritesToggle', '');
  assert.equal(reloaded.getResolvedShortcuts().favoritesToggle.shortcut, '');

  // Reset all clears overrides and restores .hyper.js trial config (Ctrl+Alt+K) + Hyper defaults without zombie legacy key.
  reloaded.resetAllShortcuts();
  assert.deepEqual(reloaded.state.shortcutOverrides, {});
  assert.equal(reloaded.getResolvedShortcuts().newTab.shortcut, 'Ctrl+Shift+T');
  assert.equal(reloaded.getResolvedShortcuts().favoritesToggle.shortcut, 'Ctrl+Alt+K');

  const reloadedAfterReset = new QuickControls(mapped);
  assert.deepEqual(reloadedAfterReset.state.shortcutOverrides, {});

  instance.componentWillUnmount();
});

test('toolbar and shortcut modal support drag-and-drop and keyboard reordering with grouped broadcast, persistence, no accidental click, and preserved terminal drag/copy', () => {
  const React = createMockReact();
  const env = setupBrowserEnv({
    initialStorage: {
      // Partial / corrupted order with duplicates and unknown IDs -> normalized safely to all 9 items.
      'hyper-quick-controls.order.v1': JSON.stringify(['splitRight', 'unknownId', 'splitRight']),
    },
    state: createBaseState(),
  });

  const QuickControls = plugin.decorateHyper(() => null, {React});
  const mapped = plugin.mapHyperState(env.store.getState(), {isMac: false});
  const instance = new QuickControls(mapped);
  instance.componentDidMount();

  // Partial/corrupted order normalized: splitRight first, remaining 8 default items appended in order.
  assert.equal(instance.state.toolbarOrder.length, 9);
  assert.equal(instance.state.toolbarOrder[0], 'splitRight');
  assert.equal(instance.state.toolbarOrder[1], 'newTab');

  // Reset to clean default order for drag tests.
  instance.resetToolbarOrder();
  assert.deepEqual(instance.state.toolbarOrder, [
    'newTab', 'previousTab', 'nextTab',
    'splitRight', 'splitDown', 'previousPane', 'nextPane',
    'broadcastToggle', 'favoritesToggle',
  ]);

  // 1) Horizontal toolbar drag-and-drop: drag favoritesToggle onto newTab (index 0).
  let tree = instance.render();
  let toolbarButtons = findNodes(tree, (n) => n.type === 'button' && n.props['data-order-id']);
  assert.deepEqual(toolbarButtons.map((b) => b.props['data-order-id']), instance.state.toolbarOrder);

  const favToolbarBtn = toolbarButtons.find((b) => b.props['data-order-id'] === 'favoritesToggle');
  const newTabToolbarBtn = toolbarButtons.find((b) => b.props['data-order-id'] === 'newTab');
  assert.equal(favToolbarBtn.props.draggable, true);

  let dragPayload = '';
  const dt = {
    effectAllowed: '',
    dropEffect: '',
    setData(_t, v) { dragPayload = v; },
    getData() { return dragPayload; },
  };
  favToolbarBtn.props.onMouseDown();
  favToolbarBtn.props.onDragStart({dataTransfer: dt});
  const dragOverEv = createPointerEvent({dataTransfer: dt});
  newTabToolbarBtn.props.onDragOver(dragOverEv);
  assert.equal(dragOverEv.defaultPrevented, true);
  assert.equal(dt.dropEffect, 'move');
  const dropEv = createPointerEvent({dataTransfer: dt});
  newTabToolbarBtn.props.onDrop(dropEv);
  assert.equal(dropEv.defaultPrevented, true);
  favToolbarBtn.props.onDragEnd();

  // Order updated immediately & persisted.
  assert.equal(instance.state.toolbarOrder[0], 'favoritesToggle');
  assert.equal(instance.state.toolbarOrder[1], 'newTab');
  assert.deepEqual(JSON.parse(env.storage.get('hyper-quick-controls.order.v1')), instance.state.toolbarOrder);

  // Trailing click right after drag MUST NOT accidentally open favorites or emit commands!
  favToolbarBtn.props.onClick();
  assert.equal(instance.state.favoritesOpen, false);
  assert.equal(env.rpcEmits.length, 0);

  // Subsequent normal click (mouseDown -> click) works normally.
  favToolbarBtn.props.onMouseDown();
  favToolbarBtn.props.onClick();
  assert.equal(instance.state.favoritesOpen, true);
  instance.closeFavorites(false);

  // 2) Vertical docking (left) drag-and-drop: drag grouped broadcastToggle onto newTab.
  instance.setPosition('left');
  tree = instance.render();
  toolbarButtons = findNodes(tree, (n) => n.type === 'button' && n.props['data-order-id']);
  const bcastToolbarBtn = toolbarButtons.find((b) => b.props['data-order-id'] === 'broadcastToggle');
  const newTabVertBtn = toolbarButtons.find((b) => b.props['data-order-id'] === 'newTab');
  bcastToolbarBtn.props.onMouseDown();
  bcastToolbarBtn.props.onDragStart({dataTransfer: dt});
  newTabVertBtn.props.onDragOver(createPointerEvent({dataTransfer: dt}));
  newTabVertBtn.props.onDrop(createPointerEvent({dataTransfer: dt}));
  bcastToolbarBtn.props.onDragEnd();

  // Accidental trailing click on broadcastToggle after drag does NOT toggle broadcast!
  bcastToolbarBtn.props.onClick();
  assert.equal(env.rpcEmits.filter(event => event.ev !== 'quick-controls:request-history').length, 0);

  assert.equal(instance.state.toolbarOrder[0], 'favoritesToggle');
  assert.equal(instance.state.toolbarOrder[1], 'broadcastToggle');
  assert.equal(instance.state.toolbarOrder[2], 'newTab');

  // 3) Shortcut Settings modal reflects exact same order, keeps broadcastTab & broadcastOff grouped, and supports ↑/↓ keyboard move + modal drag.
  instance.openShortcutsModal();
  tree = instance.render();
  let modal = findNodes(tree, (n) => n.props && n.props.className === 'hqt-shortcuts-modal')[0];
  let modalCards = findNodes(modal, (n) => n.props && n.props.role === 'listitem');
  assert.deepEqual(modalCards.map((c) => c.props['data-order-id']), instance.state.toolbarOrder);

  const bcastCard = modalCards[1];
  assert.equal(bcastCard.props['data-order-id'], 'broadcastToggle');
  assert.deepEqual(
    findNodes(bcastCard, (n) => n.props && typeof n.props['data-action-id'] === 'string').map((n) => n.props['data-action-id']),
    ['broadcastTab', 'broadcastOff']
  );

  // Move broadcastToggle UP via accessible ↑ button -> becomes index 0 in BOTH modal and toolbar!
  const moveUpBcast = findNodes(bcastCard, (n) => n.props && n.props['data-move-up'] === 'broadcastToggle')[0];
  assert.equal(moveUpBcast.props.disabled, false);
  moveUpBcast.props.onClick();

  assert.equal(instance.state.toolbarOrder[0], 'broadcastToggle');
  assert.equal(instance.state.toolbarOrder[1], 'favoritesToggle');

  tree = instance.render();
  toolbarButtons = findNodes(tree, (n) => n.type === 'button' && n.props['data-order-id']);
  assert.equal(toolbarButtons[0].props['data-order-id'], 'broadcastToggle');
  modal = findNodes(tree, (n) => n.props && n.props.className === 'hqt-shortcuts-modal')[0];
  modalCards = findNodes(modal, (n) => n.props && n.props.role === 'listitem');
  assert.equal(modalCards[0].props['data-order-id'], 'broadcastToggle');
  // Boundary: move-up on index 0 is disabled; move-down on last item is disabled.
  assert.equal(findNodes(modalCards[0], (n) => n.props && n.props['data-move-up'] === 'broadcastToggle')[0].props.disabled, true);
  const lastId = instance.state.toolbarOrder[instance.state.toolbarOrder.length - 1];
  assert.equal(findNodes(modalCards[modalCards.length - 1], (n) => n.props && n.props['data-move-down'] === lastId)[0].props.disabled, true);

  // 4) Reload restores custom order; Reset order restores default order without erasing custom shortcuts.
  instance.setActionShortcut('newTab', 'Alt+N');
  const reloaded = new QuickControls(mapped);
  assert.equal(reloaded.state.toolbarOrder[0], 'broadcastToggle');
  assert.equal(reloaded.state.toolbarOrder[1], 'favoritesToggle');

  reloaded.openShortcutsModal();
  const reloadedModal = findNodes(reloaded.render(), (n) => n.props && n.props.className === 'hqt-shortcuts-modal')[0];
  const resetOrderBtn = findNodes(reloadedModal, (n) => n.props && n.props['data-reset-order'] === 'true')[0];
  assert.equal(resetOrderBtn.props.disabled, false);
  resetOrderBtn.props.onClick();

  assert.deepEqual(reloaded.state.toolbarOrder, [
    'newTab', 'previousTab', 'nextTab',
    'splitRight', 'splitDown', 'previousPane', 'nextPane',
    'broadcastToggle', 'favoritesToggle',
  ]);
  // Custom shortcut Alt+N is preserved when resetting order!
  assert.equal(reloaded.state.shortcutOverrides.newTab, 'Alt+N');

  // 5) Terminal drag selection & copy remain completely untouched.
  instance.closeShortcutsModal(false);
  const termDrag = createPointerEvent({target: {tagName: 'DIV', className: 'xterm-screen'}});
  global.document.dispatch('pointerdown', termDrag);
  assert.equal(termDrag.defaultPrevented, false);
  const termCopy = createKeyEvent({key: 'c', code: 'KeyC', ctrlKey: true, shiftKey: true, target: env.terminalElement});
  global.window.dispatch('keydown', termCopy);
  assert.equal(termCopy.defaultPrevented, false);

  instance.componentWillUnmount();
});
