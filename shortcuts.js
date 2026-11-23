'use strict';

const {
  SHORTCUT_STORAGE_KEY: LEGACY_FAVORITES_SHORTCUT_KEY,
  parseShortcut,
  matchesShortcut,
} = require('./favorites');

const SHORTCUTS_STORAGE_KEY = 'hyper-quick-controls.shortcuts.v1';
const ORDER_STORAGE_KEY = 'hyper-quick-controls.order.v1';

const TOOLBAR_ITEMS = Object.freeze([
  {id: 'newTab', actions: Object.freeze(['newTab'])},
  {id: 'previousTab', actions: Object.freeze(['previousTab'])},
  {id: 'nextTab', actions: Object.freeze(['nextTab'])},
  {id: 'splitRight', actions: Object.freeze(['splitRight'])},
  {id: 'splitDown', actions: Object.freeze(['splitDown'])},
  {id: 'previousPane', actions: Object.freeze(['previousPane'])},
  {id: 'nextPane', actions: Object.freeze(['nextPane'])},
  {id: 'broadcastToggle', actions: Object.freeze(['broadcastTab', 'broadcastOff'])},
  {id: 'favoritesToggle', actions: Object.freeze(['favoritesToggle'])},
]);

const DEFAULT_TOOLBAR_ORDER = Object.freeze(TOOLBAR_ITEMS.map((item) => item.id));
const TOOLBAR_ITEM_MAP = Object.freeze(
  TOOLBAR_ITEMS.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {})
);

const ACTIONS = Object.freeze([
  {id: 'newTab', defaultShortcut: 'Ctrl+Shift+T', defaultCompact: 'Ctrl Shift T', nativeHandled: true},
  {id: 'previousTab', defaultShortcut: 'Ctrl+Shift+Tab', defaultCompact: 'Ctrl Shift Tab', nativeHandled: true},
  {id: 'nextTab', defaultShortcut: 'Ctrl+Tab', defaultCompact: 'Ctrl Tab', nativeHandled: true},
  {id: 'splitRight', defaultShortcut: 'Ctrl+Shift+D', defaultCompact: 'Ctrl Shift D', nativeHandled: true},
  {id: 'splitDown', defaultShortcut: 'Ctrl+Shift+E', defaultCompact: 'Ctrl Shift E', nativeHandled: true},
  {id: 'previousPane', defaultShortcut: 'Ctrl+PageDown', defaultCompact: 'Ctrl Pg↓', nativeHandled: true},
  {id: 'nextPane', defaultShortcut: 'Ctrl+PageUp', defaultCompact: 'Ctrl Pg↑', nativeHandled: true},
  {id: 'broadcastTab', defaultShortcut: 'Ctrl+Alt+T', defaultCompact: 'Ctrl Alt T', nativeHandled: true},
  {id: 'broadcastOff', defaultShortcut: 'Ctrl+Alt+P', defaultCompact: 'Ctrl Alt P', nativeHandled: true},
  {id: 'favoritesToggle', defaultShortcut: '', defaultCompact: '', nativeHandled: false},
]);

const ACTION_MAP = Object.freeze(
  ACTIONS.reduce((acc, action) => {
    acc[action.id] = action;
    return acc;
  }, {})
);

// Built-in Hyper 3.4.1 (win32) and hyper-broadcast shortcuts outside our own actions' defaults.
// Blocking conflicts here prevents duplicate execution and avoids hijacking other Hyper commands.
const RESERVED_SHORTCUTS = Object.freeze({
  'ctrl+shift+i': 'Hyper (window:devtools)',
  'ctrl+shift+r': 'Hyper (window:reload)',
  'ctrl+shift+f5': 'Hyper (window:reloadFull)',
  'ctrl+,': 'Hyper (window:preferences)',
  'alt+f': 'Hyper (window:hamburgerMenu)',
  'ctrl+0': 'Hyper (zoom:reset)',
  'ctrl+=': 'Hyper (zoom:in)',
  'ctrl+-': 'Hyper (zoom:out)',
  'ctrl+shift+n': 'Hyper (window:new)',
  'ctrl+shift+m': 'Hyper (window:minimize)',
  'ctrl+alt+shift+m': 'Hyper (window:zoom)',
  f11: 'Hyper (window:toggleFullScreen)',
  'ctrl+shift+q': 'Hyper (window:close)',
  'alt+f4': 'Hyper (window:close)',
  'ctrl+shift+w': 'Hyper (pane:close)',
  'ctrl+shift+z': 'Hyper (editor:undo)',
  'ctrl+shift+y': 'Hyper (editor:redo)',
  'ctrl+shift+x': 'Hyper (editor:cut)',
  'ctrl+shift+c': 'Hyper (editor:copy)',
  'ctrl+shift+v': 'Hyper (editor:paste)',
  'ctrl+shift+a': 'Hyper (editor:selectAll)',
  'ctrl+shift+f': 'Hyper (editor:search)',
  'ctrl+shift+k': 'Hyper (editor:clearBuffer)',
  'ctrl+c': 'Hyper (editor:break)',
  'ctrl+shift+u': 'Hyper (plugins:update)',
  'ctrl+alt+a': 'hyper-broadcast (selectAllPanes)',
  'ctrl+alt+b': 'hyper-broadcast (toggleCurrentPane)',
});

const MODIFIER_ONLY_KEYS = new Set(['control', 'shift', 'alt', 'meta', 'os']);
const FUNCTION_KEY_RE = /^f([1-9]|1[0-2])$/i;

const DISPLAY_KEY_NAMES = Object.freeze({
  ' ': 'Space',
  tab: 'Tab',
  enter: 'Enter',
  escape: 'Esc',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  home: 'Home',
  end: 'End',
  insert: 'Insert',
  delete: 'Delete',
  backspace: 'Backspace',
});

const COMPACT_KEY_NAMES = Object.freeze({
  ' ': 'Space',
  tab: 'Tab',
  enter: 'Enter',
  escape: 'Esc',
  pageup: 'Pg↑',
  pagedown: 'Pg↓',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  home: 'Home',
  end: 'End',
  insert: 'Ins',
  delete: 'Del',
  backspace: 'Bksp',
});

function canonicalizeParsed(parsed) {
  if (!parsed || !parsed.key) return '';
  const mods = [];
  if (parsed.ctrl) mods.push('ctrl');
  if (parsed.alt) mods.push('alt');
  if (parsed.shift) mods.push('shift');
  if (parsed.meta) mods.push('meta');
  mods.push(parsed.key === ' ' ? 'space' : parsed.key.toLowerCase());
  return mods.join('+');
}

function canonicalizeShortcut(shortcutString, isMac) {
  const parsed = parseShortcut(shortcutString, isMac);
  return parsed ? canonicalizeParsed(parsed) : '';
}

function formatKeyForDisplay(key, compact) {
  const lower = String(key || '').toLowerCase();
  const table = compact ? COMPACT_KEY_NAMES : DISPLAY_KEY_NAMES;
  if (Object.prototype.hasOwnProperty.call(table, lower)) return table[lower];
  if (FUNCTION_KEY_RE.test(lower)) return lower.toUpperCase();
  if (lower.length === 1) return lower.toUpperCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function formatParsedShortcut(parsed, compact) {
  if (!parsed || !parsed.key) return '';
  const parts = [];
  if (parsed.ctrl) parts.push('Ctrl');
  if (parsed.alt) parts.push('Alt');
  if (parsed.shift) parts.push('Shift');
  if (parsed.meta) parts.push('Meta');
  parts.push(formatKeyForDisplay(parsed.key, compact));
  return parts.join(compact ? ' ' : '+');
}

function formatShortcutFromEvent(event, isMac) {
  if (!event) return {ok: false, reason: 'invalid'};
  const rawKey = typeof event.key === 'string' ? event.key : '';
  const lowerRaw = rawKey.toLowerCase();
  if (MODIFIER_ONLY_KEYS.has(lowerRaw)) {
    return {ok: false, reason: 'modifier-only'};
  }

  let keyName = '';
  if (typeof event.code === 'string' && /^Key[A-Z]$/.test(event.code)) {
    keyName = event.code.slice(3).toUpperCase();
  } else if (typeof event.code === 'string' && /^Digit[0-9]$/.test(event.code)) {
    keyName = event.code.slice(5);
  } else if (event.code === 'Space' || rawKey === ' ') {
    keyName = 'Space';
  } else if (rawKey && rawKey !== 'Dead' && rawKey !== 'Process' && rawKey !== 'Unidentified') {
    keyName = formatKeyForDisplay(rawKey, false);
  }

  if (!keyName) return {ok: false, reason: 'invalid'};

  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');
  parts.push(keyName);

  const shortcut = parts.join('+');
  const parsed = parseShortcut(shortcut, isMac);
  if (!parsed) return {ok: false, reason: 'invalid'};
  if (!hasRequiredModifier(parsed)) {
    return {ok: false, reason: 'requires-modifier'};
  }
  return {
    ok: true,
    shortcut: formatParsedShortcut(parsed, false),
    parsed,
    canonical: canonicalizeParsed(parsed),
  };
}

function hasRequiredModifier(parsed) {
  if (!parsed || !parsed.key) return false;
  if (parsed.ctrl || parsed.alt || parsed.meta) return true;
  return FUNCTION_KEY_RE.test(parsed.key);
}

function readRawStorage(key) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch (_) {
    // Ignore storage errors.
  }
  return null;
}

function writeRawStorage(key, value) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch (_) {
    // Keep setting in memory for this window.
  }
}

function sanitizeOverrides(raw, isMac) {
  const result = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;

  for (const action of ACTIONS) {
    if (!Object.prototype.hasOwnProperty.call(raw, action.id)) continue;
    const val = raw[action.id];
    if (typeof val !== 'string') continue;
    const trimmed = val.trim();
    if (trimmed === '') {
      if (action.id === 'favoritesToggle') {
        result.favoritesToggle = '';
      }
      continue;
    }
    const parsed = parseShortcut(trimmed, isMac);
    if (!parsed || !hasRequiredModifier(parsed)) continue;
    result[action.id] = formatParsedShortcut(parsed, false);
  }
  return result;
}

function readStoredShortcutOverrides(isMac) {
  let overrides = {};
  let hasStoredMap = false;
  const rawMap = readRawStorage(SHORTCUTS_STORAGE_KEY);
  if (rawMap !== null) {
    try {
      const parsed = JSON.parse(rawMap);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        overrides = sanitizeOverrides(parsed, isMac);
        hasStoredMap = true;
      }
    } catch (_) {
      overrides = {};
    }
  }

  // Migrate legacy favoritesShortcut.v1 into shortcuts.v1 once, when shortcuts.v1 does not exist yet.
  if (!hasStoredMap) {
    const legacy = readRawStorage(LEGACY_FAVORITES_SHORTCUT_KEY);
    if (legacy !== null) {
      const trimmed = legacy.trim();
      if (trimmed === '') {
        overrides.favoritesToggle = '';
      } else {
        const parsed = parseShortcut(trimmed, isMac);
        if (parsed && hasRequiredModifier(parsed)) {
          overrides.favoritesToggle = formatParsedShortcut(parsed, false);
        }
      }
      writeRawStorage(SHORTCUTS_STORAGE_KEY, JSON.stringify(overrides));
    }
  }

  return overrides;
}

function saveShortcutOverrides(overrides, isMac) {
  const clean = sanitizeOverrides(overrides, isMac);
  writeRawStorage(SHORTCUTS_STORAGE_KEY, JSON.stringify(clean));
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (Object.prototype.hasOwnProperty.call(clean, 'favoritesToggle')) {
        window.localStorage.setItem(LEGACY_FAVORITES_SHORTCUT_KEY, clean.favoritesToggle);
      } else if (typeof window.localStorage.removeItem === 'function') {
        window.localStorage.removeItem(LEGACY_FAVORITES_SHORTCUT_KEY);
      }
    }
  } catch (_) {
    // Keep setting in memory for this window.
  }
  return clean;
}

function readHyperFavoritesShortcut(propsConfig) {
  let cfg = propsConfig && typeof propsConfig === 'object' ? propsConfig : null;
  if (!cfg) {
    try {
      if (typeof window !== 'undefined' && window.config && typeof window.config.getConfig === 'function') {
        const full = window.config.getConfig();
        if (full && typeof full === 'object') cfg = full.quickControls || null;
      }
    } catch (_) {
      cfg = null;
    }
  }
  if (!cfg) return '';
  if (typeof cfg.favoritesShortcut === 'string') return cfg.favoritesShortcut.trim();
  if (typeof cfg.shortcut === 'string') return cfg.shortcut.trim();
  return '';
}

function resolveAllShortcuts(overrides, propsConfig, isMac) {
  const safeOverrides = overrides && typeof overrides === 'object' ? overrides : {};
  const hyperFavShortcut = readHyperFavoritesShortcut(propsConfig);
  const byId = {};

  for (const action of ACTIONS) {
    const hasOverride = Object.prototype.hasOwnProperty.call(safeOverrides, action.id);
    const defaultParsed = action.defaultShortcut ? parseShortcut(action.defaultShortcut, isMac) : null;
    const defaultCanonical = defaultParsed ? canonicalizeParsed(defaultParsed) : '';

    let shortcut = '';
    let parsed = null;
    let isCustom = false;
    let source = 'default';

    if (action.id === 'favoritesToggle') {
      if (hasOverride) {
        shortcut = safeOverrides.favoritesToggle;
        parsed = shortcut ? parseShortcut(shortcut, isMac) : null;
        isCustom = true;
        source = shortcut ? 'custom' : 'unset';
      } else if (hyperFavShortcut) {
        const cfgParsed = parseShortcut(hyperFavShortcut, isMac);
        shortcut = cfgParsed ? formatParsedShortcut(cfgParsed, false) : '';
        parsed = cfgParsed;
        isCustom = false;
        source = parsed ? 'config' : 'default';
      } else {
        shortcut = '';
        parsed = null;
        isCustom = false;
        source = 'default';
      }
    } else if (hasOverride) {
      const ovParsed = parseShortcut(safeOverrides[action.id], isMac);
      const ovCanonical = ovParsed ? canonicalizeParsed(ovParsed) : '';
      if (ovParsed && ovCanonical !== defaultCanonical) {
        shortcut = formatParsedShortcut(ovParsed, false);
        parsed = ovParsed;
        isCustom = true;
        source = 'custom';
      } else {
        shortcut = action.defaultShortcut;
        parsed = defaultParsed;
        isCustom = false;
        source = 'default';
      }
    } else {
      shortcut = action.defaultShortcut;
      parsed = defaultParsed;
      isCustom = false;
      source = 'default';
    }

    const canonical = parsed ? canonicalizeParsed(parsed) : '';
    const compact = parsed
      ? (isCustom || action.id === 'favoritesToggle' ? formatParsedShortcut(parsed, true) : action.defaultCompact)
      : '';

    byId[action.id] = {
      id: action.id,
      shortcut,
      compact,
      parsed,
      canonical,
      defaultShortcut: action.defaultShortcut,
      defaultCanonical,
      isCustom,
      hasOverride,
      source,
      nativeHandled: action.nativeHandled,
      // Renderer intercepts ONLY non-native actions (favoritesToggle) or user-customized bindings.
      // Default Hyper / hyper-broadcast bindings stay handled natively to prevent duplicate execution.
      rendererActive: Boolean(parsed && (!action.nativeHandled || isCustom)),
    };
  }

  return byId;
}

function checkShortcutConflict(actionId, shortcutString, resolvedById, isMac) {
  if (!Object.prototype.hasOwnProperty.call(ACTION_MAP, actionId)) {
    return {conflict: true, reason: 'invalid'};
  }
  const parsed = parseShortcut(shortcutString, isMac);
  if (!parsed) {
    return {conflict: true, reason: 'invalid'};
  }
  if (!hasRequiredModifier(parsed)) {
    return {conflict: true, reason: 'requires-modifier'};
  }
  const canonical = canonicalizeParsed(parsed);
  const formatted = formatParsedShortcut(parsed, false);

  // Assigning an action its own native default simply resets it back to default (not a conflict).
  const targetMeta = ACTION_MAP[actionId];
  const ownDefaultCanonical = targetMeta.defaultShortcut
    ? canonicalizeShortcut(targetMeta.defaultShortcut, isMac)
    : '';
  if (ownDefaultCanonical && canonical === ownDefaultCanonical) {
    return {conflict: false, isOwnDefault: true, shortcut: targetMeta.defaultShortcut, canonical};
  }

  // Check against all other hyper-quick-controls actions (both active binding and native Hyper default).
  for (const action of ACTIONS) {
    if (action.id === actionId) continue;
    const other = resolvedById && resolvedById[action.id];
    if (other && other.canonical && other.canonical === canonical) {
      return {
        conflict: true,
        reason: 'action-conflict',
        conflictActionId: action.id,
        shortcut: formatted,
      };
    }
    const otherDefault = other ? other.defaultCanonical : canonicalizeShortcut(action.defaultShortcut, isMac);
    if (action.nativeHandled && otherDefault && otherDefault === canonical) {
      return {
        conflict: true,
        reason: 'action-conflict',
        conflictActionId: action.id,
        shortcut: formatted,
      };
    }
  }

  // Check against reserved Hyper / hyper-broadcast built-in shortcuts.
  if (Object.prototype.hasOwnProperty.call(RESERVED_SHORTCUTS, canonical)) {
    return {
      conflict: true,
      reason: 'reserved-conflict',
      conflictLabel: RESERVED_SHORTCUTS[canonical],
      shortcut: formatted,
    };
  }

  return {conflict: false, isOwnDefault: false, shortcut: formatted, canonical};
}

function findMatchingRendererAction(event, resolvedById) {
  if (!event || !resolvedById) return null;
  for (const action of ACTIONS) {
    const binding = resolvedById[action.id];
    if (binding && binding.rendererActive && binding.parsed && matchesShortcut(event, binding.parsed)) {
      return binding;
    }
  }
  return null;
}

function normalizeToolbarOrder(raw) {
  const seen = new Set();
  const order = [];
  if (Array.isArray(raw)) {
    for (const id of raw) {
      if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(TOOLBAR_ITEM_MAP, id) && !seen.has(id)) {
        seen.add(id);
        order.push(id);
      }
    }
  }
  for (const id of DEFAULT_TOOLBAR_ORDER) {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  return order;
}

function isDefaultToolbarOrder(order) {
  const normalized = normalizeToolbarOrder(order);
  for (let i = 0; i < DEFAULT_TOOLBAR_ORDER.length; i += 1) {
    if (normalized[i] !== DEFAULT_TOOLBAR_ORDER[i]) return false;
  }
  return true;
}

function reorderToolbarItems(order, fromId, toId) {
  const normalized = normalizeToolbarOrder(order);
  const fromIndex = normalized.indexOf(fromId);
  const toIndex = normalized.indexOf(toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return normalized;
  const next = normalized.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function stepToolbarItem(order, itemId, delta) {
  const normalized = normalizeToolbarOrder(order);
  const index = normalized.indexOf(itemId);
  if (index < 0) return normalized;
  const targetIndex = index + delta;
  if (targetIndex < 0 || targetIndex >= normalized.length) return normalized;
  const next = normalized.slice();
  const [moved] = next.splice(index, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

function readStoredToolbarOrder() {
  const raw = readRawStorage(ORDER_STORAGE_KEY);
  if (raw === null) return DEFAULT_TOOLBAR_ORDER.slice();
  try {
    return normalizeToolbarOrder(JSON.parse(raw));
  } catch (_) {
    return DEFAULT_TOOLBAR_ORDER.slice();
  }
}

function saveToolbarOrder(order) {
  const normalized = normalizeToolbarOrder(order);
  writeRawStorage(ORDER_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

module.exports = {
  SHORTCUTS_STORAGE_KEY,
  LEGACY_FAVORITES_SHORTCUT_KEY,
  ORDER_STORAGE_KEY,
  ACTIONS,
  ACTION_MAP,
  TOOLBAR_ITEMS,
  TOOLBAR_ITEM_MAP,
  DEFAULT_TOOLBAR_ORDER,
  RESERVED_SHORTCUTS,
  canonicalizeShortcut,
  formatParsedShortcut,
  formatShortcutFromEvent,
  hasRequiredModifier,
  readStoredShortcutOverrides,
  saveShortcutOverrides,
  resolveAllShortcuts,
  checkShortcutConflict,
  findMatchingRendererAction,
  normalizeToolbarOrder,
  isDefaultToolbarOrder,
  reorderToolbarItems,
  stepToolbarItem,
  readStoredToolbarOrder,
  saveToolbarOrder,
};
