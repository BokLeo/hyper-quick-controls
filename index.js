'use strict';

const CHANNEL = 'quick-controls:action';
const HANDLER = Symbol.for('hyper-quick-controls.handler');
const nativeCommands = Object.freeze({
  newTab: 'tab:new',
  previousTab: 'tab:prev',
  nextTab: 'tab:next',
  splitRight: 'pane:splitRight',
  splitDown: 'pane:splitDown',
  nextPane: 'pane:next',
  previousPane: 'pane:prev',
});
const actions = Object.freeze({
  broadcastTab: ['broadcast selectCurrentTabPanes'],
  broadcastOff: ['broadcast reset'],
});

exports.onWindow = (win) => {
  if (win[HANDLER]) win.rpc.removeListener(CHANNEL, win[HANDLER]);
  win[HANDLER] = (action) => {
    if (!Object.prototype.hasOwnProperty.call(actions, action)) return;
    win.rpc.emit(...actions[action]);
  };
  win.rpc.on(CHANNEL, win[HANDLER]);
};

function runAction(action) {
  // Use Hyper's built-in main-process command handler even after a renderer-only reload.
  if (Object.prototype.hasOwnProperty.call(nativeCommands, action)) {
    window.rpc.emit('command', nativeCommands[action]);
    return;
  }
  if (action === 'broadcastToggle') {
    const {sessions} = window.store.getState();
    const enabled = (sessions.broadcast || []).some((uid) => !!sessions.sessions[uid]);
    action = enabled ? 'broadcastOff' : 'broadcastTab';
  }
  window.rpc.emit(CHANNEL, action);
  if (typeof window.focusActiveTerm === 'function') window.focusActiveTerm();
}

// Keep renderer styles in the renderer so UI changes don't depend on main-process reloads.
const toolbar = require('./toolbar');
exports.mapHyperState = toolbar.mapHyperState;
exports.decorateHyper = (Hyper, context) => toolbar.decorateHyper(Hyper, context, runAction);