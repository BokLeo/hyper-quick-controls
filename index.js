'use strict';

const CHANNEL = 'quick-controls:action';
const HANDLER = Symbol.for('hyper-quick-controls.handler');
const HISTORY_REQUEST = 'quick-controls:request-history';
const HISTORY_RESPONSE = 'quick-controls:recent-history';
const HISTORY_HANDLER = Symbol.for('hyper-quick-controls.history-handler');
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
  if (win[HISTORY_HANDLER]) win.rpc.removeListener(HISTORY_REQUEST, win[HISTORY_HANDLER]);
  let historyRequest = 0;
  win[HISTORY_HANDLER] = async (expanded) => {
    const request = ++historyRequest;
    const commands = process.platform === 'win32' && process.env.APPDATA
      ? await favorites.readPowerShellHistory(require('path').join(process.env.APPDATA,
        'Microsoft', 'Windows', 'PowerShell', 'PSReadLine', 'ConsoleHost_history.txt'), expanded === true)
      : [];
    if (request === historyRequest && !(typeof win.isDestroyed === 'function' && win.isDestroyed())) {
      win.rpc.emit(HISTORY_RESPONSE, commands);
    }
  };
  win.rpc.on(HISTORY_REQUEST, win[HISTORY_HANDLER]);
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

const favorites = require('./favorites');

function insertFavorite(command) {
  const sessions = typeof window !== 'undefined' && window.store && typeof window.store.getState === 'function'
    ? (window.store.getState().sessions || {})
    : {};
  const rpc = typeof window !== 'undefined' ? window.rpc : null;
  return favorites.insertFavoriteCommand(command, sessions, rpc);
}

// Keep renderer styles in the renderer so UI changes don't depend on main-process reloads.
const toolbar = require('./toolbar');
exports.reduceUI = favorites.reduceUI;
exports.mapHyperState = toolbar.mapHyperState;
const history = {
  subscribe(listener) {
    window.rpc.on?.(HISTORY_RESPONSE, listener);
    return () => window.rpc.removeListener?.(HISTORY_RESPONSE, listener);
  },
  refresh(expanded = false) {
    window.rpc.emit(HISTORY_REQUEST, expanded);
  },
};
exports.decorateHyper = (Hyper, context) => toolbar.decorateHyper(Hyper, context, runAction, insertFavorite, history);
