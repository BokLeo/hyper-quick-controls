'use strict';

const SHORTCUT_STORAGE_KEY = 'hyper-quick-controls.favoritesShortcut.v1';
const FAVORITES_STORAGE_KEY = 'hyper-quick-controls.favorites.v1';

// Block C0 control chars (incl. \r, \n, \t, \x03, \x04, \x1b), DEL, C1 controls (incl. 8-bit CSI \x9b),
// and Unicode line/paragraph separators so favorites can only insert printable single-line text.
const UNSAFE_CONTROL_RE = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;

const MODIFIER_KEYS = new Set(['control', 'ctrl', 'shift', 'alt', 'option', 'meta', 'cmd', 'command', 'super']);

const KEY_ALIASES = Object.freeze({
  space: ' ',
  spacebar: ' ',
  esc: 'escape',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  return: 'enter',
  plus: '+',
});

function normalizeKeyToken(token) {
  const lower = String(token || '').trim().toLowerCase();
  if (!lower) return '';
  if (Object.prototype.hasOwnProperty.call(KEY_ALIASES, lower)) {
    return KEY_ALIASES[lower];
  }
  return lower;
}

function parseShortcut(shortcutString, isMac) {
  if (typeof shortcutString !== 'string') return null;
  const trimmed = shortcutString.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const parsed = {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    key: '',
    display: trimmed,
  };

  for (const rawPart of parts) {
    const token = rawPart.toLowerCase();
    if (token === 'ctrl' || token === 'control') {
      parsed.ctrl = true;
    } else if (token === 'alt' || token === 'option') {
      parsed.alt = true;
    } else if (token === 'shift') {
      parsed.shift = true;
    } else if (token === 'meta' || token === 'cmd' || token === 'command' || token === 'super') {
      parsed.meta = true;
    } else if (token === 'cmdorctrl' || token === 'commandorcontrol') {
      if (isMac) parsed.meta = true;
      else parsed.ctrl = true;
    } else {
      if (parsed.key) return null; // Reject ambiguous multi-key strings.
      const normalized = normalizeKeyToken(rawPart);
      if (!normalized || MODIFIER_KEYS.has(normalized)) return null;
      parsed.key = normalized;
    }
  }

  if (!parsed.key) return null;
  return parsed;
}

function getEventKeyCandidates(event) {
  const candidates = new Set();
  if (typeof event.key === 'string' && event.key.length > 0) {
    candidates.add(normalizeKeyToken(event.key));
  }
  if (typeof event.code === 'string' && event.code.length > 0) {
    if (/^Key[A-Z]$/.test(event.code)) {
      candidates.add(event.code.slice(3).toLowerCase());
    } else if (/^Digit[0-9]$/.test(event.code)) {
      candidates.add(event.code.slice(5));
    } else if (event.code === 'Space') {
      candidates.add(' ');
    } else {
      candidates.add(normalizeKeyToken(event.code));
    }
  }
  return candidates;
}

function matchesShortcut(event, parsedShortcut) {
  if (!event || !parsedShortcut || !parsedShortcut.key) return false;
  if (Boolean(event.ctrlKey) !== parsedShortcut.ctrl) return false;
  if (Boolean(event.altKey) !== parsedShortcut.alt) return false;
  if (Boolean(event.shiftKey) !== parsedShortcut.shift) return false;
  if (Boolean(event.metaKey) !== parsedShortcut.meta) return false;
  const candidates = getEventKeyCandidates(event);
  return candidates.has(parsedShortcut.key);
}

function validateCommand(command) {
  if (typeof command !== 'string' || command.length === 0) {
    return {ok: false, reason: 'empty'};
  }
  if (UNSAFE_CONTROL_RE.test(command)) {
    return {ok: false, reason: 'unsafe-control-char'};
  }
  return {ok: true, command};
}

function normalizeFavorites(rawList) {
  if (!Array.isArray(rawList)) return [];
  const items = [];
  for (let i = 0; i < rawList.length; i += 1) {
    const entry = rawList[i];
    let label = '';
    let command = '';
    if (typeof entry === 'string') {
      command = entry;
    } else if (entry && typeof entry === 'object' && typeof entry.command === 'string') {
      command = entry.command;
      if (typeof entry.label === 'string') label = entry.label.trim();
    } else {
      continue;
    }
    if (command.length === 0) continue;
    const validation = validateCommand(command);
    items.push({
      id: `fav-${i}`,
      label,
      command,
      unsafe: !validation.ok,
      reason: validation.ok ? null : validation.reason,
    });
  }
  return items;
}

function readWindowHyperConfig() {
  try {
    if (typeof window !== 'undefined' && window.config && typeof window.config.getConfig === 'function') {
      const cfg = window.config.getConfig();
      if (cfg && typeof cfg === 'object') return cfg.quickControls || null;
    }
  } catch (_) {
    // Ignore missing/throwing Hyper config bridge.
  }
  return null;
}

function readStoredString(key) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch (_) {
    // Ignore restricted storage.
  }
  return null;
}

function readStoredFavorites() {
  const raw = readStoredString(FAVORITES_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function resolveFavoritesSettings(propsConfig, localShortcutOverride, isMac) {
  const hyperConfig = (propsConfig && typeof propsConfig === 'object')
    ? propsConfig
    : readWindowHyperConfig();

  const configShortcut = hyperConfig && typeof hyperConfig.favoritesShortcut === 'string'
    ? hyperConfig.favoritesShortcut
    : (hyperConfig && typeof hyperConfig.shortcut === 'string' ? hyperConfig.shortcut : '');

  // Default shortcut is explicitly unset ('') unless configured in localStorage or Hyper config.
  let shortcut = '';
  if (typeof localShortcutOverride === 'string') {
    shortcut = localShortcutOverride;
  } else {
    const storedShortcut = readStoredString(SHORTCUT_STORAGE_KEY);
    if (storedShortcut !== null) {
      shortcut = storedShortcut;
    } else if (configShortcut) {
      shortcut = configShortcut;
    }
  }

  const storedFavorites = readStoredFavorites();
  const rawFavorites = storedFavorites !== null
    ? storedFavorites
    : (hyperConfig && Array.isArray(hyperConfig.favorites) ? hyperConfig.favorites : []);

  return {
    shortcut,
    parsedShortcut: parseShortcut(shortcut, isMac),
    favorites: normalizeFavorites(rawFavorites),
  };
}

function resolveBroadcastTargets(sessionsState) {
  const sessionsMap = (sessionsState && sessionsState.sessions) || {};
  const broadcastRaw = Array.isArray(sessionsState && sessionsState.broadcast)
    ? sessionsState.broadcast
    : [];

  const liveBroadcast = [];
  const seen = new Set();
  for (const uid of broadcastRaw) {
    if (typeof uid === 'string' && uid.length > 0 && !seen.has(uid) && sessionsMap[uid]) {
      seen.add(uid);
      liveBroadcast.push(uid);
    }
  }

  if (liveBroadcast.length > 0) {
    return {
      mode: 'broadcast',
      targets: liveBroadcast,
      count: liveBroadcast.length,
    };
  }

  const activeUid = sessionsState && sessionsState.activeUid;
  if (typeof activeUid === 'string' && activeUid.length > 0 && sessionsMap[activeUid]) {
    return {
      mode: 'active',
      targets: [activeUid],
      count: 1,
    };
  }

  return {
    mode: 'none',
    targets: [],
    count: 0,
  };
}

// Send directly via Hyper's PTY RPC 'data' event rather than dispatching SESSION_USER_DATA.
// Why: hyper-broadcast's middleware listens to SESSION_USER_DATA and re-broadcasts to
// sessions.broadcast, which would duplicate input when we iterate over targets (or send to
// an unselected activeUid). Emitting 'data' once per live resolved target guarantees
// exactly-once delivery per target pane with zero double-broadcasting and no execution.
function insertFavoriteCommand(command, sessionsState, rpc) {
  const validation = validateCommand(command);
  const resolved = resolveBroadcastTargets(sessionsState);

  if (!validation.ok) {
    return {
      ok: false,
      reason: validation.reason,
      mode: resolved.mode,
      targets: [],
      sentCount: 0,
    };
  }

  if (resolved.targets.length === 0 || !rpc || typeof rpc.emit !== 'function') {
    return {
      ok: false,
      reason: 'no-target',
      mode: resolved.mode,
      targets: [],
      sentCount: 0,
    };
  }

  for (const uid of resolved.targets) {
    rpc.emit('data', {uid, data: validation.command});
  }

  return {
    ok: true,
    reason: null,
    mode: resolved.mode,
    targets: resolved.targets.slice(),
    sentCount: resolved.targets.length,
    command: validation.command,
  };
}

function setUiProp(state, key, value) {
  if (state && typeof state.set === 'function') return state.set(key, value);
  return Object.assign({}, state, {[key]: value});
}

function reduceUI(state, action) {
  if (!state || !action) return state;
  if (action.type === 'CONFIG_LOAD' || action.type === 'CONFIG_RELOAD') {
    const qc = action.config && typeof action.config === 'object'
      ? (action.config.quickControls || null)
      : null;
    return setUiProp(state, 'quickControlsConfig', qc);
  }
  return state;
}

module.exports = {
  SHORTCUT_STORAGE_KEY,
  FAVORITES_STORAGE_KEY,
  UNSAFE_CONTROL_RE,
  parseShortcut,
  matchesShortcut,
  validateCommand,
  normalizeFavorites,
  resolveFavoritesSettings,
  resolveBroadcastTargets,
  insertFavoriteCommand,
  reduceUI,
};
