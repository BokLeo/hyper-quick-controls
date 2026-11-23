'use strict';

const {
  resolveFavoritesSettings,
  resolveBroadcastTargets,
} = require('./favorites');

const {
  TOOLBAR_ITEM_MAP,
  DEFAULT_TOOLBAR_ORDER,
  formatShortcutFromEvent,
  readStoredShortcutOverrides,
  saveShortcutOverrides,
  resolveAllShortcuts,
  checkShortcutConflict,
  findMatchingRendererAction,
  isDefaultToolbarOrder,
  reorderToolbarItems,
  stepToolbarItem,
  readStoredToolbarOrder,
  saveToolbarOrder,
} = require('./shortcuts');

const STORAGE_KEY = 'hyper-quick-controls.position.v1';
const LANGUAGE_KEY = 'hyper-quick-controls.language.v1';
const SHORTCUT_COLOR_KEY = 'hyper-quick-controls.shortcutColor.v1';
const SHORTCUT_SIZE_KEY = 'hyper-quick-controls.shortcutFontSize.v1';
const DEFAULT_SHORTCUT_COLOR = '#3aeed9';
const DEFAULT_SHORTCUT_FONT_SIZE = 12;
const MIN_SHORTCUT_FONT_SIZE = 10;
const MAX_SHORTCUT_FONT_SIZE = 16;
const LANGUAGES = Object.freeze(['en', 'ko']);
const POSITIONS = Object.freeze(['top', 'bottom', 'left', 'right']);
const MESSAGES = {
  en: {
    toolbar: 'Hyper quick controls', settings: 'Toolbar settings',
    settingsTitle: 'Toolbar settings · Position and language',
    position: 'Toolbar position', language: 'Language',
    top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right',
    newTab: 'New tab', previousTab: 'Previous tab', nextTab: 'Next tab',
    splitRight: 'Split right', splitDown: 'Split down',
    previousPane: 'Previous pane', nextPane: 'Next pane',
    broadcastTab: 'Broadcast on (current tab)',
    broadcastOffAction: 'Broadcast off',
    broadcastGroup: 'Broadcast input',
    broadcastOff: 'Broadcast input off',
    broadcastOn: (count) => `Broadcast input on · ${count} ${count === 1 ? 'pane' : 'panes'}`,
    broadcastShortcut: (onKey, offKey) => `${onKey}: Enable for current tab\n${offKey}: Disable`,
    favoritesButton: 'Command favorites',
    favoritesShortLabel: 'Favorites',
    favoritesUnsetHint: 'Shortcut unset (configure in Shortcut settings or .hyper.js)',
    shortcutColorLabel: 'Shortcut text color',
    shortcutColorDefault: 'Default',
    shortcutColorReset: 'Reset',
    shortcutSizeLabel: 'Shortcut text size',
    shortcutSizeDecrease: 'Decrease shortcut text size',
    shortcutSizeIncrease: 'Increase shortcut text size',
    shortcutsOpenButton: 'Shortcut settings…',
    shortcutsModalTitle: 'Keyboard shortcuts',
    shortcutsModalClose: 'Close',
    shortcutsModalDone: 'Done',
    shortcutsModalResetAll: 'Reset shortcuts',
    shortcutsModalResetOrder: 'Reset order',
    shortcutsModalNote: 'Drag items (or use ↑/↓) to reorder both the toolbar and this list. Custom bindings work immediately; built-in Hyper / hyper-broadcast defaults remain active in Hyper unless changed in .hyper.js.',
    shortcutsMoveUp: (label) => `Move ${label} up`,
    shortcutsMoveDown: (label) => `Move ${label} down`,
    shortcutsModalHint: 'Press Esc to cancel recording or close',
    shortcutsChange: 'Change',
    shortcutsRecording: 'Press keys…',
    shortcutsReset: 'Reset',
    shortcutsUnset: 'Unset',
    shortcutsNone: 'Unset',
    shortcutsCustomTag: 'Custom',
    shortcutsErrorModifier: 'Include Ctrl, Alt, Meta, or use a function key (F1–F12).',
    shortcutsErrorInvalid: 'Unsupported key combination.',
    shortcutsErrorActionConflict: (shortcut, actionLabel) => `${shortcut} is already used by "${actionLabel}".`,
    shortcutsErrorReservedConflict: (shortcut, target) => `${shortcut} conflicts with ${target}.`,
    favoritesTitle: 'Command favorites',
    favoritesList: 'Favorite commands',
    favoritesEmpty: 'No favorite commands configured.',
    favoritesTargetActive: () => 'Active pane · 1',
    favoritesTargetBroadcast: (count) => `Broadcast · ${count} ${count === 1 ? 'pane' : 'panes'}`,
    favoritesTargetNone: 'No active pane · 0',
    favoritesBlockedItem: 'Blocked (unsafe control character)',
    favoritesBlockedNotice: 'Blocked: newlines and executable control characters are not allowed.',
    favoritesHint: '↑/↓ Navigate · Enter Insert (no execute) · Esc Close',
  },
  ko: {
    toolbar: 'Hyper 빠른 조작', settings: '툴바 설정',
    settingsTitle: '툴바 설정 · 위치 및 언어 변경',
    position: '툴바 위치', language: '언어',
    top: '상단', bottom: '하단', left: '왼쪽', right: '오른쪽',
    newTab: '새 탭', previousTab: '이전 탭', nextTab: '다음 탭',
    splitRight: '좌우 분할', splitDown: '상하 분할',
    previousPane: '이전 Pane', nextPane: '다음 Pane',
    broadcastTab: '다중 입력 켜기 (현재 탭)',
    broadcastOffAction: '다중 입력 끄기',
    broadcastGroup: '다중 입력',
    broadcastOff: '다중 입력 꺼짐',
    broadcastOn: (count) => `다중 입력 켜짐 · ${count}개 Pane`,
    broadcastShortcut: (onKey, offKey) => `${onKey}: 현재 탭에서 켜기\n${offKey}: 끄기`,
    favoritesButton: '명령 즐겨찾기',
    favoritesShortLabel: '즐겨찾기',
    favoritesUnsetHint: '단축키 미지정 (단축키 설정 또는 .hyper.js에서 지정)',
    shortcutColorLabel: '단축키 글자색',
    shortcutColorDefault: '기본',
    shortcutColorReset: '기본값 복원',
    shortcutSizeLabel: '단축키 글자 크기',
    shortcutSizeDecrease: '단축키 글자 크기 줄이기',
    shortcutSizeIncrease: '단축키 글자 크기 키우기',
    shortcutsOpenButton: '단축키 설정…',
    shortcutsModalTitle: '단축키 설정',
    shortcutsModalClose: '닫기',
    shortcutsModalDone: '완료',
    shortcutsModalResetAll: '단축키 초기화',
    shortcutsModalResetOrder: '순서 초기화',
    shortcutsModalNote: '항목을 드래그하거나 ↑/↓ 버튼으로 툴바와 목록 순서를 함께 바꿀 수 있습니다. 사용자 지정 단축키는 즉시 동작하며 Hyper 및 hyper-broadcast 기본 키맵은 .hyper.js에서 변경하지 않는 한 기존대로 유지됩니다.',
    shortcutsMoveUp: (label) => `${label} 위로 이동`,
    shortcutsMoveDown: (label) => `${label} 아래로 이동`,
    shortcutsModalHint: 'Esc로 입력 취소 또는 닫기',
    shortcutsChange: '변경',
    shortcutsRecording: '키 입력…',
    shortcutsReset: '기본값',
    shortcutsUnset: '해제',
    shortcutsNone: '미지정',
    shortcutsCustomTag: '사용자',
    shortcutsErrorModifier: 'Ctrl, Alt, Meta 조합 또는 기능키(F1–F12)를 사용해 주세요.',
    shortcutsErrorInvalid: '지원하지 않는 키 조합입니다.',
    shortcutsErrorActionConflict: (shortcut, actionLabel) => `${shortcut}은(는) 이미 "${actionLabel}"에 할당되어 있습니다.`,
    shortcutsErrorReservedConflict: (shortcut, target) => `${shortcut}은(는) ${target}과(와) 충돌합니다.`,
    favoritesTitle: '명령 즐겨찾기',
    favoritesList: '즐겨찾기 명령 목록',
    favoritesEmpty: '등록된 즐겨찾기 명령이 없습니다.',
    favoritesTargetActive: () => '활성 Pane · 1개',
    favoritesTargetBroadcast: (count) => `다중 입력 · ${count}개 Pane`,
    favoritesTargetNone: '활성 Pane 없음 · 0개',
    favoritesBlockedItem: '차단됨 (제어문자 포함)',
    favoritesBlockedNotice: '차단됨: 줄바꿈 및 실행 가능한 제어문자는 입력할 수 없습니다.',
    favoritesHint: '↑/↓ 탐색 · Enter 입력줄 삽입(실행 안 함) · Esc 닫기',
  },
};
const SIZE = 38;
const SIDE_WIDTH = 104;
const icons = {
  newTab: ['M4 4h16v16H4z', 'M12 8v8M8 12h8'],
  previousTab: ['M4 4h16v16H4z', 'm13 8-4 4 4 4'],
  nextTab: ['M4 4h16v16H4z', 'm11 8 4 4-4 4'],
  splitRight: ['M3 4h18v16H3z', 'M12 4v16'],
  splitDown: ['M3 4h18v16H3z', 'M3 12h18'],
  previousPane: ['M4 5v14', 'M20 12H8m5-5-5 5 5 5'],
  nextPane: ['M20 5v14', 'M4 12h12m-5-5 5 5-5 5'],
  broadcastToggle: ['M4 8v8m4-6v4m4-9v14m4-9v4m4-6v8'],
  favoritesToggle: ['m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z'],
  settings: ['M10 3h4l1 3 3 1 3 3v4l-3 1-1 3-3 3h-4l-1-3-3-1-3-3v-4l3-1 1-3z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  top: ['M3 4h18v16H3z', 'M3 8h18'],
  bottom: ['M3 4h18v16H3z', 'M3 16h18'],
  left: ['M3 4h18v16H3z', 'M8 4v16'],
  right: ['M3 4h18v16H3z', 'M16 4v16'],
};

function readPreference(key, choices, fallback) {
  try {
    const saved = window.localStorage.getItem(key);
    return choices.includes(saved) ? saved : fallback;
  } catch (_) {
    return fallback;
  }
}

function isEditableElement(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
}

function stopKeyboardEvent(event) {
  if (typeof event.preventDefault === 'function') event.preventDefault();
  if (typeof event.stopPropagation === 'function') event.stopPropagation();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
}

function normalizeHexColor(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return '';
}

function readStoredShortcutColor() {
  try {
    return normalizeHexColor(window.localStorage.getItem(SHORTCUT_COLOR_KEY));
  } catch (_) {
    return '';
  }
}

function resolveShortcutColor(customColor) {
  return normalizeHexColor(customColor) || DEFAULT_SHORTCUT_COLOR;
}

function normalizeShortcutFontSize(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < MIN_SHORTCUT_FONT_SIZE || num > MAX_SHORTCUT_FONT_SIZE) {
    return null;
  }
  return num;
}

function readStoredShortcutFontSize() {
  try {
    return normalizeShortcutFontSize(window.localStorage.getItem(SHORTCUT_SIZE_KEY));
  } catch (_) {
    return null;
  }
}

function resolveShortcutFontSize(customSize) {
  const normalized = normalizeShortcutFontSize(customSize);
  return normalized === null ? DEFAULT_SHORTCUT_FONT_SIZE : normalized;
}

function computeSideWidth(shortcutFontSize) {
  return Math.max(SIDE_WIDTH, Math.ceil(shortcutFontSize * 8.5) + 18);
}

function styles(theme, position, headerHeight, customShortcutColor, customShortcutSize) {
  const horizontal = position === 'top' || position === 'bottom';
  const favoritesTop = headerHeight + (position === 'top' ? SIZE : 0) + 12;
  const shortcutColor = resolveShortcutColor(customShortcutColor);
  const shortcutFontSize = resolveShortcutFontSize(customShortcutSize);
  const sideWidth = computeSideWidth(shortcutFontSize);
  const verticalButtonMinHeight = Math.max(46, Math.ceil(shortcutFontSize * 1.2) + 32);
  return `
    #hyper .hyper_main .terms_terms {
      left: ${position === 'left' ? sideWidth : 0}px !important;
      right: ${position === 'right' ? sideWidth : 0}px !important;
      top: ${position === 'top' ? SIZE : 0}px !important;
      bottom: ${position === 'bottom' ? SIZE + 26 : 0}px !important;
    }
    /* hyper-scripts fixes its selector at y=40; keep it clear of the docked toolbar. */
    #hyper .commands {
      top: ${headerHeight + (position === 'top' ? SIZE : 0)}px !important;
      margin-top: 0 !important;
      right: ${position === 'right' ? sideWidth : 0}px !important;
      bottom: ${position === 'bottom' ? SIZE + 26 : 26}px !important;
    }
    #hyper .commands select {
      display: block; box-sizing: border-box; min-height: 28px;
      background: ${theme.backgroundColor || '#000'};
      color: ${theme.foregroundColor || '#fff'};
      border: 1px solid ${theme.borderColor || '#333'};
      border-radius: 3px; padding: 3px 6px; cursor: pointer;
    }
    #hyper .commands option {
      background: ${theme.backgroundColor || '#000'};
      color: ${theme.foregroundColor || '#fff'};
    }
    .hqt-toolbar {
      --hqt-bg: ${theme.backgroundColor || '#000'};
      --hqt-fg: ${theme.foregroundColor || '#fff'};
      --hqt-border: ${theme.borderColor || '#333'};
      --hqt-shortcut: ${shortcutColor};
      --hqt-shortcut-size: ${shortcutFontSize}px;
      position: fixed; z-index: 30; box-sizing: border-box;
      display: flex; flex-direction: ${horizontal ? 'row' : 'column'};
      background: var(--hqt-bg); color: var(--hqt-fg);
      font: 11px/1.5 ${theme.uiFontFamily || '"Segoe UI", "Malgun Gothic", sans-serif'};
      -webkit-app-region: no-drag;
      ${horizontal ? `height: ${SIZE}px; left: 0; right: 0;` : `width: ${sideWidth}px; top: ${headerHeight}px; bottom: 26px;`}
      ${position === 'top' ? `top: ${headerHeight}px; border-bottom: 1px solid var(--hqt-border);` : ''}
      ${position === 'bottom' ? 'bottom: 26px; border-top: 1px solid var(--hqt-border);' : ''}
      ${position === 'left' ? 'left: 0; border-right: 1px solid var(--hqt-border);' : ''}
      ${position === 'right' ? 'right: 0; border-left: 1px solid var(--hqt-border);' : ''}
    }
    .hqt-track { display: flex; flex: 1; min-width: 0; min-height: 0; flex-direction: inherit; overflow: auto; scrollbar-width: thin; padding: 3px; gap: 4px; }
    .hqt-group { display: flex; flex: 0 0 auto; flex-direction: inherit; gap: 1px; align-items: center; }
    .hqt-group + .hqt-group {
      ${horizontal ? 'border-left' : 'border-top'}: 1px solid var(--hqt-border);
      ${horizontal ? 'padding-left' : 'padding-top'}: 5px;
    }
    .hqt-button {
      position: relative; display: inline-flex; align-items: center; justify-content: center;
      box-sizing: border-box; flex: 0 0 auto; width: auto; height: 30px; padding: 0 8px; gap: 7px;
      border: 0; border-radius: 3px; color: inherit; background: transparent;
      cursor: pointer; -webkit-app-region: no-drag;
    }
    .hqt-button:hover { background: rgba(127,127,127,0.16); }
    .hqt-button:active { background: rgba(127,127,127,0.25); }
    .hqt-button:focus-visible, .hqt-placement:focus-visible { outline: 1px solid currentColor; outline-offset: -1px; }
    .hqt-button svg, .hqt-placement svg { width: 16px; height: 16px; pointer-events: none; }
    .hqt-button svg { flex: 0 0 16px; opacity: 0.65; }
    .hqt-label { font: 12px/1.2 Consolas, "Malgun Gothic", monospace; white-space: nowrap; opacity: 0.65; }
    .hqt-button:hover svg, .hqt-button:focus-visible svg, .hqt-button[aria-checked="true"] svg, .hqt-favorites-button[aria-expanded="true"] svg,
    .hqt-button:hover .hqt-label, .hqt-button:focus-visible .hqt-label, .hqt-favorites-button[aria-expanded="true"] .hqt-label { opacity: 1; }
    .hqt-shortcut { font: var(--hqt-shortcut-size)/1.2 Consolas, "Malgun Gothic", monospace; white-space: nowrap; color: var(--hqt-shortcut); opacity: 1; }
    ${horizontal ? '' : `
      .hqt-track .hqt-button { flex-direction: column; width: ${sideWidth - 8}px; min-height: ${verticalButtonMinHeight}px; height: auto; padding: 4px; gap: 4px; }
      .hqt-track .hqt-shortcut, .hqt-track .hqt-label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
    `}
    .hqt-button[aria-checked="true"], .hqt-favorites-button[aria-expanded="true"] { background: rgba(127,127,127,0.2); }
    .hqt-button[aria-checked="true"]::after {
      content: ''; position: absolute; right: 3px; top: 3px; width: 4px; height: 4px;
      border-radius: 50%; background: currentColor;
    }
    .hqt-settings { position: relative; display: flex; align-items: center; justify-content: center; flex: 0 0 37px; }
    .hqt-settings > .hqt-button { width: 30px; height: 30px; padding: 0; }
    .hqt-popover {
      position: absolute; z-index: 40; width: 224px; max-height: calc(100vh - 96px); overflow-y: auto; padding: 10px;
      box-sizing: border-box; border: 1px solid var(--hqt-border); border-radius: 5px;
      background: var(--hqt-bg); color: var(--hqt-fg); box-shadow: 0 6px 20px rgba(0,0,0,0.3);
      ${position === 'top' ? 'top: 40px; right: 4px;' : ''}
      ${position === 'bottom' ? 'bottom: 40px; right: 4px;' : ''}
      ${position === 'left' ? `left: ${sideWidth + 2}px; bottom: 4px;` : ''}
      ${position === 'right' ? `right: ${sideWidth + 2}px; bottom: 4px;` : ''}
    }
    .hqt-popover-title { margin: 0 0 8px; font-size: 11px; font-weight: 400; opacity: 0.6; }
    .hqt-language, .hqt-color-setting, .hqt-size-setting, .hqt-shortcuts-setting { display: block; margin-top: 12px; }
    .hqt-language-label, .hqt-color-label, .hqt-size-label { display: block; margin-bottom: 6px; opacity: 0.6; }
    .hqt-language select {
      width: 100%; padding: 6px; box-sizing: border-box; font: inherit;
      background: var(--hqt-bg); color: var(--hqt-fg); border: 1px solid var(--hqt-border);
      border-radius: 3px; cursor: pointer;
    }
    .hqt-color-row, .hqt-size-row { display: flex; gap: 4px; align-items: center; }
    .hqt-color-input {
      flex: 0 0 28px; width: 28px; height: 26px; padding: 1px; box-sizing: border-box;
      background: var(--hqt-bg); border: 1px solid var(--hqt-border); border-radius: 3px; cursor: pointer;
    }
    .hqt-color-value {
      flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font: 10px/1.2 Consolas, "Malgun Gothic", monospace; opacity: 0.8;
    }
    .hqt-size-step {
      flex: 0 0 32px; width: 32px; height: 26px; padding: 0; font: 14px/1 Consolas, sans-serif;
      color: inherit; background: transparent; border: 1px solid var(--hqt-border);
      border-radius: 3px; cursor: pointer;
    }
    .hqt-size-value {
      flex: 1; text-align: center;
      font: 11px/1.2 Consolas, "Malgun Gothic", monospace; opacity: 0.9;
    }
    .hqt-color-reset, .hqt-open-shortcuts-button, .hqt-modal-btn {
      padding: 6px 8px; font: inherit; color: inherit; background: transparent;
      border: 1px solid var(--hqt-border); border-radius: 3px; cursor: pointer;
    }
    .hqt-color-reset { flex: 0 0 auto; }
    .hqt-open-shortcuts-button { width: 100%; box-sizing: border-box; text-align: center; }
    .hqt-color-reset:hover:not(:disabled), .hqt-size-step:hover:not(:disabled),
    .hqt-open-shortcuts-button:hover, .hqt-modal-btn:hover:not(:disabled) { background: rgba(127,127,127,0.2); }
    .hqt-color-reset:disabled, .hqt-size-step:disabled, .hqt-modal-btn:disabled { opacity: 0.4; cursor: default; }
    .hqt-language select:focus-visible, .hqt-color-input:focus-visible, .hqt-color-reset:focus-visible,
    .hqt-size-step:focus-visible, .hqt-open-shortcuts-button:focus-visible, .hqt-modal-btn:focus-visible {
      outline: 1px solid currentColor; outline-offset: 1px;
    }
    .hqt-placements { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .hqt-placement {
      display: flex; align-items: center; justify-content: center; gap: 7px; padding: 7px 4px;
      font: inherit; color: inherit; background: transparent; border: 1px solid var(--hqt-border);
      border-radius: 3px; cursor: pointer;
    }
    .hqt-placement:hover, .hqt-placement[aria-pressed="true"] { background: rgba(127,127,127,0.2); }
    .hqt-placement[aria-pressed="true"] { border-color: currentColor; }
    .hqt-favorites, .hqt-shortcuts-modal {
      --hqt-bg: ${theme.backgroundColor || '#000'};
      --hqt-fg: ${theme.foregroundColor || '#fff'};
      --hqt-border: ${theme.borderColor || '#333'};
      --hqt-shortcut: ${shortcutColor};
      --hqt-shortcut-size: ${shortcutFontSize}px;
      position: fixed; left: 50%; transform: translateX(-50%);
      display: flex; flex-direction: column; box-sizing: border-box;
      padding: 12px; border: 1px solid var(--hqt-border); border-radius: 6px;
      background: var(--hqt-bg); color: var(--hqt-fg);
      font: 12px/1.45 ${theme.uiFontFamily || '"Segoe UI", "Malgun Gothic", sans-serif'};
      box-shadow: 0 10px 28px rgba(0,0,0,0.45);
      -webkit-app-region: no-drag;
    }
    .hqt-favorites { z-index: 50; top: ${favoritesTop}px; width: min(440px, calc(100vw - 32px)); max-height: 360px; }
    .hqt-shortcuts-modal { z-index: 60; top: ${favoritesTop}px; width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - ${favoritesTop + 36}px); }
    .hqt-favorites-header, .hqt-shortcuts-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .hqt-favorites-title, .hqt-shortcuts-title { font-size: 12px; font-weight: 600; }
    .hqt-favorites-target {
      font: 11px/1.2 Consolas, "Malgun Gothic", monospace;
      padding: 2px 6px; border: 1px solid var(--hqt-border); border-radius: 3px; opacity: 0.9;
    }
    .hqt-favorites-target[data-target-mode="broadcast"] { background: rgba(127,127,127,0.22); border-color: currentColor; }
    .hqt-favorites-list {
      display: flex; flex-direction: column; gap: 3px; overflow-y: auto; max-height: 240px;
      margin: 0; padding: 0; list-style: none;
    }
    .hqt-favorite-item {
      display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
      width: 100%; padding: 7px 9px; box-sizing: border-box; text-align: left;
      font: inherit; color: inherit; background: transparent;
      border: 1px solid transparent; border-radius: 4px; cursor: pointer;
    }
    .hqt-favorite-item[aria-selected="true"] { background: rgba(127,127,127,0.22); border-color: currentColor; }
    .hqt-favorite-item[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; }
    .hqt-favorite-label { font-size: 11px; opacity: 0.72; }
    .hqt-favorite-command { font: 12px/1.35 Consolas, "Malgun Gothic", monospace; word-break: break-all; }
    .hqt-favorites-empty { margin: 8px 0; opacity: 0.65; font-size: 11px; }
    .hqt-favorites-notice, .hqt-shortcuts-error { margin: 6px 0 0; font-size: 11px; color: #ff6b6b; }
    .hqt-shortcuts-note { margin: 0 0 8px; font-size: 10px; line-height: 1.4; opacity: 0.7; }
    .hqt-shortcuts-list { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; min-height: 0; flex: 1; }
    .hqt-shortcut-item {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 6px 8px; border: 1px solid var(--hqt-border); border-radius: 4px;
    }
    .hqt-shortcut-item-group { flex-direction: column; align-items: stretch; gap: 6px; }
    .hqt-shortcut-group-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .hqt-shortcut-group-title { font-size: 11px; font-weight: 600; flex: 1; }
    .hqt-shortcut-sublist { display: flex; flex-direction: column; gap: 4px; padding-left: 16px; }
    .hqt-shortcut-subitem { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 4px; border-top: 1px solid rgba(127,127,127,0.2); }
    .hqt-shortcut-item[data-recording="true"], .hqt-shortcut-subitem[data-recording="true"] { border-color: var(--hqt-shortcut); background: rgba(127,127,127,0.16); }
    .hqt-button[data-dragging="true"], .hqt-shortcut-item[data-dragging="true"] { opacity: 0.45; cursor: grabbing; }
    .hqt-toolbar[data-position="top"] .hqt-button[data-drag-over="true"],
    .hqt-toolbar[data-position="bottom"] .hqt-button[data-drag-over="true"] { box-shadow: inset 2px 0 0 var(--hqt-shortcut); }
    .hqt-toolbar[data-position="left"] .hqt-button[data-drag-over="true"],
    .hqt-toolbar[data-position="right"] .hqt-button[data-drag-over="true"] { box-shadow: inset 0 2px 0 var(--hqt-shortcut); }
    .hqt-shortcut-item[data-drag-over="true"] { box-shadow: inset 0 2px 0 var(--hqt-shortcut); border-color: var(--hqt-shortcut); }
    .hqt-order-controls { display: inline-flex; align-items: center; gap: 3px; flex: 0 0 auto; }
    .hqt-drag-handle { font-size: 11px; opacity: 0.45; cursor: grab; padding: 0 2px; }
    .hqt-move-btn {
      width: 22px; height: 22px; padding: 0; font: 11px/1 Consolas, sans-serif;
      color: inherit; background: transparent; border: 1px solid var(--hqt-border);
      border-radius: 3px; cursor: pointer;
    }
    .hqt-move-btn:hover:not(:disabled) { background: rgba(127,127,127,0.2); }
    .hqt-move-btn:disabled { opacity: 0.35; cursor: default; }
    .hqt-move-btn:focus-visible { outline: 1px solid currentColor; outline-offset: 1px; }
    .hqt-shortcut-item-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .hqt-shortcut-item-name { font-size: 11px; display: flex; align-items: center; gap: 5px; }
    .hqt-shortcut-tag { font-size: 9px; padding: 1px 4px; border: 1px solid var(--hqt-border); border-radius: 2px; opacity: 0.75; }
    .hqt-shortcut-item-binding { font-size: 11px; }
    .hqt-shortcut-item-actions { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
    .hqt-modal-btn-active { border-color: var(--hqt-shortcut); background: rgba(127,127,127,0.22); }
    .hqt-favorites-footer, .hqt-shortcuts-footer {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--hqt-border);
      font-size: 10px;
    }
    .hqt-shortcuts-footer-actions { display: flex; gap: 6px; }
    .hqt-favorites-hint, .hqt-shortcuts-hint { opacity: 0.65; }
  `;
}

exports.mapHyperState = (state, map) => {
  const {sessions, termGroups, ui} = state;
  const targetInfo = resolveBroadcastTargets(sessions);
  const rootCount = Object.values((termGroups && termGroups.termGroups) || {}).filter((group) => !group.parentUid).length;
  return Object.assign({}, map, {
    quickControlsTargetCount: targetInfo.mode === 'broadcast' ? targetInfo.count : 0,
    quickControlsFavoritesTargetMode: targetInfo.mode,
    quickControlsFavoritesTargetCount: targetInfo.count,
    quickControlsConfig: (ui && ui.quickControlsConfig) || null,
    quickControlsIsMac: !!map.isMac,
    quickControlsHeaderHeight: !map.isMac && rootCount > 1 ? 68 : 34,
    quickControlsTheme: {
      backgroundColor: ui.backgroundColor,
      foregroundColor: ui.foregroundColor,
      borderColor: ui.borderColor,
      uiFontFamily: ui.uiFontFamily,
    },
  });
};

exports.decorateHyper = (Hyper, {React}, runAction, insertFavorite) => {
  const h = React.createElement;
  const icon = (name) => h('svg', {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
    strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false,
  }, ...icons[name].map((d, i) => h('path', {d, key: i})));

  return class QuickControls extends React.Component {
    constructor(props) {
      super(props);
      const isMac = !!props.quickControlsIsMac;
      this.state = {
        position: readPreference(STORAGE_KEY, POSITIONS, 'top'),
        language: readPreference(LANGUAGE_KEY, LANGUAGES, 'en'),
        shortcutColor: readStoredShortcutColor(),
        shortcutFontSize: readStoredShortcutFontSize(),
        shortcutOverrides: readStoredShortcutOverrides(isMac),
        toolbarOrder: readStoredToolbarOrder(),
        dragItemId: null,
        dragOverItemId: null,
        settingsOpen: false,
        shortcutsModalOpen: false,
        recordingActionId: null,
        shortcutError: null,
        favoritesOpen: false,
        selectedIndex: 0,
        blockedNotice: false,
      };
      this.previousActiveElement = null;
      this.lastTerminalElement = null;
      this.shortcutsReturnElement = null;
      this.suppressEnterUntilRelease = false;
      this.suppressNextClick = false;
      this.onOutside = (event) => {
        if (this.state.settingsOpen && this.settingsElement && !this.settingsElement.contains(event.target)) {
          this.setState({settingsOpen: false});
        }
        if (
          this.state.shortcutsModalOpen &&
          (!this.shortcutsModalElement || !this.shortcutsModalElement.contains(event.target))
        ) {
          this.closeShortcutsModal(false);
        }
        if (
          this.state.favoritesOpen &&
          (!this.favoritesElement || !this.favoritesElement.contains(event.target)) &&
          (!this.favoritesButton || !this.favoritesButton.contains(event.target))
        ) {
          this.closeFavorites(false);
        }
      };
      this.onKeyUp = (event) => {
        if (this.suppressEnterUntilRelease && event && event.key === 'Enter') {
          this.suppressEnterUntilRelease = false;
          stopKeyboardEvent(event);
        }
      };
      this.onWindowBlur = () => {
        this.suppressEnterUntilRelease = false;
      };
      this.onVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.hidden) {
          this.suppressEnterUntilRelease = false;
        }
      };
      this.onKeyDown = (event) => {
        if (!event || event.isComposing) return;

        // 1) Shortcut Settings modal has highest keyboard priority and prevents terminal key leakage.
        if (this.state.shortcutsModalOpen) {
          if (this.state.recordingActionId) {
            stopKeyboardEvent(event);
            if (event.repeat) return;
            if (event.key === 'Escape') {
              this.setState({recordingActionId: null, shortcutError: null});
              return;
            }
            const captured = formatShortcutFromEvent(event, !!this.props.quickControlsIsMac);
            if (!captured.ok) {
              if (captured.reason === 'modifier-only') return;
              this.setState({
                shortcutError: captured.reason === 'requires-modifier'
                  ? this.t('shortcutsErrorModifier')
                  : this.t('shortcutsErrorInvalid'),
              });
              return;
            }
            this.applyRecordedShortcut(this.state.recordingActionId, captured.shortcut);
            return;
          }

          if (event.key === 'Escape') {
            stopKeyboardEvent(event);
            this.closeShortcutsModal(true);
            return;
          }

          // Block stray keys aimed outside the modal (e.g. terminal textarea) from leaking to the terminal.
          const insideModal = !!(
            this.shortcutsModalElement &&
            typeof this.shortcutsModalElement.contains === 'function' &&
            this.shortcutsModalElement.contains(event.target)
          );
          if (!insideModal) {
            stopKeyboardEvent(event);
          }
          return;
        }

        const resolvedShortcuts = this.getResolvedShortcuts();
        const resolvedFavorites = this.getFavoritesSettings(resolvedShortcuts);

        // Allow typing normally inside settings controls without triggering toolbar shortcuts.
        const insideSettings = !!(
          this.settingsElement &&
          typeof this.settingsElement.contains === 'function' &&
          this.settingsElement.contains(event.target) &&
          isEditableElement(event.target)
        );

        // 2) Favorites toggle shortcut works whether palette is open or closed.
        const favBinding = resolvedShortcuts.favoritesToggle;
        if (!insideSettings && favBinding && favBinding.rendererActive) {
          const matchedFav = findMatchingRendererAction(event, {favoritesToggle: favBinding});
          if (matchedFav) {
            stopKeyboardEvent(event);
            if (event.repeat) return;
            if (this.state.favoritesOpen) {
              this.closeFavorites(true);
            } else {
              this.openFavorites();
            }
            return;
          }
        }

        // 3) When Favorites palette is closed, handle held-Enter suppression & custom toolbar shortcuts.
        if (!this.state.favoritesOpen) {
          if (this.suppressEnterUntilRelease && event.key === 'Enter') {
            if (event.repeat) {
              stopKeyboardEvent(event);
              return;
            }
            // Fresh non-repeat Enter after a missed keyup should pass through normally.
            this.suppressEnterUntilRelease = false;
          }

          if (!insideSettings) {
            const matched = findMatchingRendererAction(event, resolvedShortcuts);
            if (matched && matched.id !== 'favoritesToggle') {
              stopKeyboardEvent(event);
              if (event.repeat) return;
              this.run(matched.id);
            }
          }
          return;
        }

        // 4) Favorites palette keyboard navigation (only when open).
        if (event.key === 'Escape') {
          stopKeyboardEvent(event);
          this.closeFavorites(true);
          return;
        }

        if (event.key === 'ArrowDown') {
          stopKeyboardEvent(event);
          const count = resolvedFavorites.favorites.length;
          if (count > 0) {
            this.setState((state) => ({
              selectedIndex: (state.selectedIndex + 1) % count,
              blockedNotice: false,
            }));
          }
          return;
        }

        if (event.key === 'ArrowUp') {
          stopKeyboardEvent(event);
          const count = resolvedFavorites.favorites.length;
          if (count > 0) {
            this.setState((state) => ({
              selectedIndex: (state.selectedIndex - 1 + count) % count,
              blockedNotice: false,
            }));
          }
          return;
        }

        if (event.key === 'Enter') {
          // Always block Enter (and held auto-repeats until keyup) so Enter itself never executes the inserted command.
          stopKeyboardEvent(event);
          if (event.repeat) return;
          this.suppressEnterUntilRelease = true;
          const items = resolvedFavorites.favorites;
          if (items.length === 0) return;
          const index = Math.min(this.state.selectedIndex, items.length - 1);
          this.selectFavorite(items[index]);
        }
      };
    }

    componentDidMount() {
      document.addEventListener('pointerdown', this.onOutside, true);
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      window.addEventListener('keydown', this.onKeyDown, true);
      window.addEventListener('keyup', this.onKeyUp, true);
      window.addEventListener('blur', this.onWindowBlur);
    }

    componentWillUnmount() {
      document.removeEventListener('pointerdown', this.onOutside, true);
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      window.removeEventListener('keydown', this.onKeyDown, true);
      window.removeEventListener('keyup', this.onKeyUp, true);
      window.removeEventListener('blur', this.onWindowBlur);
      this.suppressEnterUntilRelease = false;
    }

    getResolvedShortcuts() {
      return resolveAllShortcuts(
        this.state.shortcutOverrides,
        this.props.quickControlsConfig,
        !!this.props.quickControlsIsMac
      );
    }

    getFavoritesSettings(resolvedShortcuts) {
      const bindings = resolvedShortcuts || this.getResolvedShortcuts();
      const favBinding = bindings.favoritesToggle;
      const base = resolveFavoritesSettings(
        this.props.quickControlsConfig,
        favBinding ? favBinding.shortcut : '',
        !!this.props.quickControlsIsMac
      );
      return Object.assign({}, base, {
        shortcut: favBinding ? favBinding.shortcut : '',
        parsedShortcut: favBinding ? favBinding.parsed : null,
      });
    }

    getActionLabel(actionId) {
      if (actionId === 'broadcastOff') return this.t('broadcastOffAction');
      if (actionId === 'favoritesToggle') return this.t('favoritesButton');
      return this.t(actionId);
    }

    openFavorites() {
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      const insideToolbar = !!(
        active &&
        this.toolbarElement &&
        typeof this.toolbarElement.contains === 'function' &&
        this.toolbarElement.contains(active)
      );
      this.previousActiveElement = insideToolbar ? this.lastTerminalElement : (active || this.lastTerminalElement);
      this.setState({
        favoritesOpen: true,
        settingsOpen: false,
        shortcutsModalOpen: false,
        recordingActionId: null,
        shortcutError: null,
        selectedIndex: 0,
        blockedNotice: false,
      });
    }

    restoreTerminalFocus() {
      const previous = this.previousActiveElement;
      this.previousActiveElement = null;
      if (typeof window !== 'undefined' && typeof window.focusActiveTerm === 'function') {
        window.focusActiveTerm();
      }
      if (
        previous &&
        typeof previous.focus === 'function' &&
        previous.isConnected !== false &&
        (typeof document === 'undefined' || document.activeElement !== previous)
      ) {
        previous.focus();
      }
    }

    closeFavorites(restoreFocus) {
      this.setState({favoritesOpen: false, blockedNotice: false});
      if (restoreFocus) {
        this.restoreTerminalFocus();
      } else {
        this.previousActiveElement = null;
      }
    }

    openShortcutsModal() {
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      const insideToolbar = !!(
        active &&
        this.toolbarElement &&
        typeof this.toolbarElement.contains === 'function' &&
        this.toolbarElement.contains(active)
      );
      this.shortcutsReturnElement = this.settingsButton || (insideToolbar ? null : active);
      this.previousActiveElement = insideToolbar ? null : active;
      this.setState({
        shortcutsModalOpen: true,
        settingsOpen: false,
        favoritesOpen: false,
        recordingActionId: null,
        shortcutError: null,
      });
    }

    closeShortcutsModal(restoreFocus) {
      const returnTarget = this.shortcutsReturnElement;
      this.shortcutsReturnElement = null;
      this.setState({
        shortcutsModalOpen: false,
        recordingActionId: null,
        shortcutError: null,
      });
      if (restoreFocus) {
        if (returnTarget && typeof returnTarget.focus === 'function' && returnTarget.isConnected !== false) {
          returnTarget.focus();
        } else {
          this.restoreTerminalFocus();
        }
      } else {
        this.previousActiveElement = null;
      }
    }

    applyRecordedShortcut(actionId, shortcutString) {
      const result = this.setActionShortcut(actionId, shortcutString);
      if (result.ok) {
        this.setState({recordingActionId: null, shortcutError: null});
      } else {
        this.setState({shortcutError: result.message});
      }
      return result;
    }

    setActionShortcut(actionId, shortcutString) {
      const isMac = !!this.props.quickControlsIsMac;
      const trimmed = typeof shortcutString === 'string' ? shortcutString.trim() : '';

      if (trimmed === '') {
        if (actionId === 'favoritesToggle') {
          const next = Object.assign({}, this.state.shortcutOverrides, {favoritesToggle: ''});
          const saved = saveShortcutOverrides(next, isMac);
          this.setState({shortcutOverrides: saved, shortcutError: null});
          return {ok: true, shortcut: ''};
        }
        return this.resetActionShortcut(actionId);
      }

      const resolved = this.getResolvedShortcuts();
      const check = checkShortcutConflict(actionId, trimmed, resolved, isMac);
      if (check.conflict) {
        let message = this.t('shortcutsErrorInvalid');
        if (check.reason === 'requires-modifier') {
          message = this.t('shortcutsErrorModifier');
        } else if (check.reason === 'action-conflict') {
          message = this.t('shortcutsErrorActionConflict')(check.shortcut, this.getActionLabel(check.conflictActionId));
        } else if (check.reason === 'reserved-conflict') {
          message = this.t('shortcutsErrorReservedConflict')(check.shortcut, check.conflictLabel);
        }
        return {ok: false, reason: check.reason, message};
      }

      const next = Object.assign({}, this.state.shortcutOverrides);
      if (check.isOwnDefault) {
        delete next[actionId];
      } else {
        next[actionId] = check.shortcut;
      }
      const saved = saveShortcutOverrides(next, isMac);
      this.setState({shortcutOverrides: saved, shortcutError: null});
      return {ok: true, shortcut: check.shortcut};
    }

    resetActionShortcut(actionId) {
      const isMac = !!this.props.quickControlsIsMac;
      const next = Object.assign({}, this.state.shortcutOverrides);
      delete next[actionId];
      const saved = saveShortcutOverrides(next, isMac);
      this.setState({shortcutOverrides: saved, recordingActionId: null, shortcutError: null});
      return {ok: true};
    }

    resetAllShortcuts() {
      const isMac = !!this.props.quickControlsIsMac;
      const saved = saveShortcutOverrides({}, isMac);
      this.setState({shortcutOverrides: saved, recordingActionId: null, shortcutError: null});
      return {ok: true};
    }

    reorderToolbarItem(fromId, toId) {
      const next = reorderToolbarItems(this.state.toolbarOrder, fromId, toId);
      const saved = saveToolbarOrder(next);
      this.setState({toolbarOrder: saved});
      return saved;
    }

    moveToolbarItem(itemId, delta) {
      const next = stepToolbarItem(this.state.toolbarOrder, itemId, delta);
      const saved = saveToolbarOrder(next);
      this.setState({toolbarOrder: saved});
      return saved;
    }

    resetToolbarOrder() {
      const saved = saveToolbarOrder(DEFAULT_TOOLBAR_ORDER);
      this.setState({toolbarOrder: saved});
      return saved;
    }

    captureTerminalBeforeButtonInteraction() {
      this.suppressNextClick = false;
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      const insideToolbar = !!(
        active &&
        this.toolbarElement &&
        typeof this.toolbarElement.contains === 'function' &&
        this.toolbarElement.contains(active)
      );
      if (active && !insideToolbar) {
        this.lastTerminalElement = active;
      }
    }

    dragProps(itemId) {
      return {
        draggable: true,
        'data-order-id': itemId,
        'data-dragging': this.state.dragItemId === itemId,
        'data-drag-over': this.state.dragItemId !== null && this.state.dragItemId !== itemId && this.state.dragOverItemId === itemId,
        onDragStart: (event) => {
          this.suppressNextClick = true;
          this.setState({dragItemId: itemId, dragOverItemId: itemId});
          if (event && event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            if (typeof event.dataTransfer.setData === 'function') {
              event.dataTransfer.setData('text/plain', itemId);
            }
          }
        },
        onDragOver: (event) => {
          if (!this.state.dragItemId) return;
          if (event && typeof event.preventDefault === 'function') event.preventDefault();
          if (event && event.dataTransfer) event.dataTransfer.dropEffect = 'move';
          if (this.state.dragOverItemId !== itemId) {
            this.setState({dragOverItemId: itemId});
          }
        },
        onDrop: (event) => {
          if (event && typeof event.preventDefault === 'function') event.preventDefault();
          const sourceId = this.state.dragItemId || (
            event && event.dataTransfer && typeof event.dataTransfer.getData === 'function'
              ? event.dataTransfer.getData('text/plain')
              : ''
          );
          if (sourceId && sourceId !== itemId) {
            this.reorderToolbarItem(sourceId, itemId);
          }
          this.suppressNextClick = true;
          this.setState({dragItemId: null, dragOverItemId: null});
        },
        onDragEnd: () => {
          this.setState({dragItemId: null, dragOverItemId: null});
          if (typeof setTimeout === 'function') {
            setTimeout(() => { this.suppressNextClick = false; }, 0);
          }
        },
      };
    }

    selectFavorite(item) {
      if (!item || item.unsafe) {
        this.setState({blockedNotice: true});
        return;
      }
      const result = typeof insertFavorite === 'function' ? insertFavorite(item.command) : {ok: false};
      if (result && result.reason === 'unsafe-control-char') {
        this.setState({blockedNotice: true});
        return;
      }
      this.closeFavorites(true);
    }

    run(action) { runAction(action); }

    t(key) { return MESSAGES[this.state.language][key]; }

    setLanguage(language) {
      if (!LANGUAGES.includes(language)) return;
      this.setState({language});
      try { window.localStorage.setItem(LANGUAGE_KEY, language); } catch (_) { /* Keep the setting for this window. */ }
    }

    setPosition(position) {
      if (!POSITIONS.includes(position)) return;
      this.setState({position, settingsOpen: false});
      try { window.localStorage.setItem(STORAGE_KEY, position); } catch (_) { /* Keep the setting for this window. */ }
      if (this.settingsButton) this.settingsButton.focus();
    }

    setFavoritesShortcut(value) {
      return this.setActionShortcut('favoritesToggle', value);
    }

    setShortcutColor(value) {
      const next = normalizeHexColor(value);
      this.setState({shortcutColor: next});
      try { window.localStorage.setItem(SHORTCUT_COLOR_KEY, next); } catch (_) { /* Keep the setting for this window. */ }
    }

    setShortcutFontSize(value) {
      const normalized = normalizeShortcutFontSize(value);
      const next = normalized === DEFAULT_SHORTCUT_FONT_SIZE ? null : normalized;
      this.setState({shortcutFontSize: next});
      try {
        window.localStorage.setItem(SHORTCUT_SIZE_KEY, next === null ? '' : String(next));
      } catch (_) { /* Keep the setting for this window. */ }
    }

    stepShortcutFontSize(delta) {
      const current = resolveShortcutFontSize(this.state.shortcutFontSize);
      const clamped = Math.max(MIN_SHORTCUT_FONT_SIZE, Math.min(MAX_SHORTCUT_FONT_SIZE, current + delta));
      this.setShortcutFontSize(clamped);
    }

    button(action, label, shortcut, compact, checked) {
      const description = shortcut ? `${label}\n${shortcut}` : label;
      return h('button', Object.assign({
        key: action, type: 'button', className: 'hqt-button',
        title: description, 'aria-label': description,
        role: checked === undefined ? undefined : 'switch', 'aria-checked': checked,
        onMouseDown: () => this.captureTerminalBeforeButtonInteraction(),
        onClick: () => {
          if (this.suppressNextClick) {
            this.suppressNextClick = false;
            return;
          }
          this.run(action);
        },
      }, this.dragProps(action)), icon(action), h('kbd', {className: 'hqt-shortcut', 'aria-hidden': true}, compact));
    }

    favoritesToolbarButton(favBinding) {
      const shortcutText = (favBinding && favBinding.shortcut) || '';
      const compactText = (favBinding && favBinding.compact) || shortcutText;
      const label = this.t('favoritesButton');
      const hint = shortcutText || this.t('favoritesUnsetHint');
      const description = `${label}\n${hint}`;
      return h('button', Object.assign({
        key: 'favoritesToggle',
        type: 'button',
        className: 'hqt-button hqt-favorites-button',
        title: description,
        'aria-label': description,
        'aria-haspopup': 'dialog',
        'aria-expanded': this.state.favoritesOpen,
        'data-favorites-shortcut': shortcutText,
        ref: (element) => { this.favoritesButton = element; },
        onMouseDown: () => this.captureTerminalBeforeButtonInteraction(),
        onClick: () => {
          if (this.suppressNextClick) {
            this.suppressNextClick = false;
            return;
          }
          if (this.state.favoritesOpen) {
            this.closeFavorites(true);
          } else {
            this.openFavorites();
          }
        },
      }, this.dragProps('favoritesToggle')),
      icon('favoritesToggle'),
      shortcutText
        ? h('kbd', {className: 'hqt-shortcut', 'aria-hidden': true}, compactText)
        : h('span', {className: 'hqt-label', 'aria-hidden': true}, this.t('favoritesShortLabel')));
    }

    formatTargetBadge(mode, count) {
      if (mode === 'broadcast' && count > 0) return this.t('favoritesTargetBroadcast')(count);
      if (mode === 'active' && count > 0) return this.t('favoritesTargetActive')(count);
      return this.t('favoritesTargetNone');
    }

    favoritesPalette(resolvedFavorites) {
      if (!this.state.favoritesOpen) return null;
      const mode = this.props.quickControlsFavoritesTargetMode || 'none';
      const targetCount = this.props.quickControlsFavoritesTargetCount || 0;
      const items = resolvedFavorites.favorites;
      const selectedIndex = items.length > 0 ? Math.min(this.state.selectedIndex, items.length - 1) : 0;
      const targetBadge = this.formatTargetBadge(mode, targetCount);

      return h('div', {
        className: 'hqt-favorites',
        role: 'dialog',
        'aria-label': this.t('favoritesTitle'),
        lang: this.state.language,
        ref: (element) => { this.favoritesElement = element; },
      },
      h('div', {className: 'hqt-favorites-header'},
        h('span', {className: 'hqt-favorites-title'}, this.t('favoritesTitle')),
        h('span', {
          className: 'hqt-favorites-target',
          'data-target-mode': mode,
          'data-target-count': targetCount,
        }, targetBadge)),
      items.length > 0
        ? h('div', {className: 'hqt-favorites-list', role: 'listbox', 'aria-label': this.t('favoritesList')},
          ...items.map((item, index) => h('button', {
            key: item.id,
            type: 'button',
            className: 'hqt-favorite-item',
            role: 'option',
            'aria-selected': index === selectedIndex,
            'aria-disabled': item.unsafe || undefined,
            'data-index': index,
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => {
              this.setState({selectedIndex: index});
              this.selectFavorite(item);
            },
          },
          item.label ? h('span', {className: 'hqt-favorite-label'}, item.label) : null,
          h('span', {className: 'hqt-favorite-command'}, item.unsafe ? this.t('favoritesBlockedItem') : item.command))))
        : h('p', {className: 'hqt-favorites-empty'}, this.t('favoritesEmpty')),
      this.state.blockedNotice
        ? h('p', {className: 'hqt-favorites-notice', role: 'alert'}, this.t('favoritesBlockedNotice'))
        : null,
      h('div', {className: 'hqt-favorites-footer'},
        h('span', {className: 'hqt-favorites-hint'}, this.t('favoritesHint')),
        resolvedFavorites.shortcut ? h('kbd', {className: 'hqt-shortcut'}, resolvedFavorites.shortcut) : null));
    }

    orderControls(itemId, label, index, total) {
      return h('span', {className: 'hqt-order-controls'},
        h('span', {className: 'hqt-drag-handle', 'aria-hidden': true}, '⋮⋮'),
        h('button', {
          type: 'button',
          className: 'hqt-move-btn',
          'data-move-up': itemId,
          'aria-label': this.t('shortcutsMoveUp')(label),
          disabled: index <= 0,
          onClick: () => this.moveToolbarItem(itemId, -1),
        }, '↑'),
        h('button', {
          type: 'button',
          className: 'hqt-move-btn',
          'data-move-down': itemId,
          'aria-label': this.t('shortcutsMoveDown')(label),
          disabled: index >= total - 1,
          onClick: () => this.moveToolbarItem(itemId, 1),
        }, '↓'));
    }

    actionBindingControls(actionId, binding) {
      const isRecording = this.state.recordingActionId === actionId;
      const isFavorites = actionId === 'favoritesToggle';
      return h('div', {className: 'hqt-shortcut-item-actions'},
        h('button', {
          type: 'button',
          className: isRecording ? 'hqt-modal-btn hqt-modal-btn-active' : 'hqt-modal-btn',
          'data-record-action': actionId,
          'aria-pressed': isRecording,
          onClick: () => this.setState((state) => ({
            recordingActionId: state.recordingActionId === actionId ? null : actionId,
            shortcutError: null,
          })),
        }, isRecording ? this.t('shortcutsRecording') : this.t('shortcutsChange')),
        isFavorites
          ? h('button', {
            type: 'button',
            className: 'hqt-modal-btn',
            'data-unset-action': actionId,
            disabled: !binding.shortcut,
            onClick: () => this.setActionShortcut(actionId, ''),
          }, this.t('shortcutsUnset'))
          : null,
        h('button', {
          type: 'button',
          className: 'hqt-modal-btn',
          'data-reset-action': actionId,
          disabled: !binding.hasOverride,
          onClick: () => this.resetActionShortcut(actionId),
        }, this.t('shortcutsReset')));
    }

    shortcutsModal(resolvedShortcuts) {
      if (!this.state.shortcutsModalOpen) return null;
      const order = this.state.toolbarOrder || DEFAULT_TOOLBAR_ORDER;
      const hasAnyOverrides = Object.keys(this.state.shortcutOverrides || {}).length > 0;
      const defaultOrder = isDefaultToolbarOrder(order);
      return h('div', {
        className: 'hqt-shortcuts-modal',
        role: 'dialog',
        'aria-modal': true,
        'aria-label': this.t('shortcutsModalTitle'),
        lang: this.state.language,
        tabIndex: -1,
        ref: (element) => { this.shortcutsModalElement = element; },
      },
      h('div', {className: 'hqt-shortcuts-header'},
        h('span', {className: 'hqt-shortcuts-title'}, this.t('shortcutsModalTitle')),
        h('button', {
          type: 'button',
          className: 'hqt-modal-btn',
          'aria-label': this.t('shortcutsModalClose'),
          onClick: () => this.closeShortcutsModal(true),
        }, '×')),
      h('p', {className: 'hqt-shortcuts-note'}, this.t('shortcutsModalNote')),
      h('div', {className: 'hqt-shortcuts-list', role: 'list', 'aria-label': this.t('shortcutsModalTitle')},
        ...order.map((itemId, index) => {
          const itemMeta = TOOLBAR_ITEM_MAP[itemId];
          if (!itemMeta) return null;

          if (itemMeta.actions.length > 1) {
            const groupLabel = this.t('broadcastGroup');
            return h('div', Object.assign({
              key: itemId,
              className: 'hqt-shortcut-item hqt-shortcut-item-group',
              role: 'listitem',
            }, this.dragProps(itemId)),
            h('div', {className: 'hqt-shortcut-group-header'},
              this.orderControls(itemId, groupLabel, index, order.length),
              h('span', {className: 'hqt-shortcut-group-title'}, groupLabel)),
            h('div', {className: 'hqt-shortcut-sublist'},
              ...itemMeta.actions.map((actionId) => {
                const binding = resolvedShortcuts[actionId];
                const isRecording = this.state.recordingActionId === actionId;
                return h('div', {
                  key: actionId,
                  className: 'hqt-shortcut-subitem',
                  'data-action-id': actionId,
                  'data-recording': isRecording,
                },
                h('div', {className: 'hqt-shortcut-item-info'},
                  h('span', {className: 'hqt-shortcut-item-name'},
                    this.getActionLabel(actionId),
                    binding.isCustom && binding.shortcut
                      ? h('span', {className: 'hqt-shortcut-tag'}, this.t('shortcutsCustomTag'))
                      : null),
                  h('span', {className: 'hqt-shortcut-item-binding'},
                    h('kbd', {className: 'hqt-shortcut'}, binding.shortcut))),
                this.actionBindingControls(actionId, binding));
              })));
          }

          const actionId = itemMeta.actions[0];
          const binding = resolvedShortcuts[actionId];
          const isRecording = this.state.recordingActionId === actionId;
          const actionLabel = this.getActionLabel(actionId);
          return h('div', Object.assign({
            key: itemId,
            className: 'hqt-shortcut-item',
            role: 'listitem',
            'data-action-id': actionId,
            'data-recording': isRecording,
          }, this.dragProps(itemId)),
          this.orderControls(itemId, actionLabel, index, order.length),
          h('div', {className: 'hqt-shortcut-item-info'},
            h('span', {className: 'hqt-shortcut-item-name'},
              actionLabel,
              binding.isCustom && binding.shortcut
                ? h('span', {className: 'hqt-shortcut-tag'}, this.t('shortcutsCustomTag'))
                : null),
            h('span', {className: 'hqt-shortcut-item-binding'},
              binding.shortcut
                ? h('kbd', {className: 'hqt-shortcut'}, binding.shortcut)
                : h('span', {className: 'hqt-label'}, this.t('shortcutsNone')))),
          this.actionBindingControls(actionId, binding));
        })),
      this.state.shortcutError
        ? h('p', {className: 'hqt-shortcuts-error', role: 'alert'}, this.state.shortcutError)
        : null,
      h('div', {className: 'hqt-shortcuts-footer'},
        h('span', {className: 'hqt-shortcuts-hint'}, this.t('shortcutsModalHint')),
        h('div', {className: 'hqt-shortcuts-footer-actions'},
          h('button', {
            type: 'button',
            className: 'hqt-modal-btn',
            'data-reset-order': 'true',
            disabled: defaultOrder,
            onClick: () => this.resetToolbarOrder(),
          }, this.t('shortcutsModalResetOrder')),
          h('button', {
            type: 'button',
            className: 'hqt-modal-btn',
            'data-reset-all': 'true',
            disabled: !hasAnyOverrides,
            onClick: () => this.resetAllShortcuts(),
          }, this.t('shortcutsModalResetAll')),
          h('button', {
            type: 'button',
            className: 'hqt-modal-btn',
            'data-close-modal': 'true',
            onClick: () => this.closeShortcutsModal(true),
          }, this.t('shortcutsModalDone')))));
    }

    settings() {
      const customColor = this.state.shortcutColor || '';
      const effectiveColor = resolveShortcutColor(customColor);
      const colorDisplay = customColor
        ? customColor.toUpperCase()
        : `${this.t('shortcutColorDefault')} (${effectiveColor.toUpperCase()})`;
      const effectiveSize = resolveShortcutFontSize(this.state.shortcutFontSize);
      const isDefaultSize = effectiveSize === DEFAULT_SHORTCUT_FONT_SIZE;
      return h('div', {
        className: 'hqt-settings', ref: (element) => { this.settingsElement = element; },
        onKeyDown: (event) => {
          if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation();
            this.setState({settingsOpen: false});
            if (this.settingsButton) this.settingsButton.focus();
          }
        },
      },
      h('button', {
        type: 'button', className: 'hqt-button', title: this.t('settingsTitle'),
        'aria-label': this.t('settings'), 'aria-expanded': this.state.settingsOpen,
        ref: (element) => { this.settingsButton = element; },
        onClick: () => this.setState((state) => ({
          settingsOpen: !state.settingsOpen,
          favoritesOpen: false,
          shortcutsModalOpen: false,
          recordingActionId: null,
        })),
      }, icon('settings')),
      this.state.settingsOpen ? h('div', {className: 'hqt-popover'},
        h('div', {className: 'hqt-popover-title'}, this.t('position')),
        h('div', {className: 'hqt-placements', role: 'group', 'aria-label': this.t('position')},
          ...POSITIONS.map((position) => h('button', {
            type: 'button', className: 'hqt-placement', key: position,
            'aria-pressed': position === this.state.position,
            // Use independent toggle buttons: Tab/Enter work without overriding Hyper arrow shortcuts.
            'data-selected': position === this.state.position,
            onClick: () => this.setPosition(position),
          }, icon(position), this.t(position)))),
        h('label', {className: 'hqt-language'},
          h('span', {className: 'hqt-language-label'}, this.t('language')),
          h('select', {
            value: this.state.language, 'aria-label': this.t('language'),
            onChange: (event) => this.setLanguage(event.target.value),
          }, h('option', {value: 'en', lang: 'en'}, 'English'),
          h('option', {value: 'ko', lang: 'ko'}, '한국어'))),
        h('label', {className: 'hqt-color-setting'},
          h('span', {className: 'hqt-color-label'}, this.t('shortcutColorLabel')),
          h('div', {className: 'hqt-color-row'},
            h('input', {
              type: 'color',
              className: 'hqt-color-input',
              value: effectiveColor,
              'aria-label': this.t('shortcutColorLabel'),
              onChange: (event) => this.setShortcutColor(event.target.value),
            }),
            h('span', {
              className: 'hqt-color-value',
              'data-color-mode': customColor ? 'custom' : 'default',
            }, colorDisplay),
            h('button', {
              type: 'button',
              className: 'hqt-color-reset',
              disabled: !customColor,
              onClick: () => this.setShortcutColor(''),
            }, this.t('shortcutColorReset')))),
        h('div', {className: 'hqt-size-setting'},
          h('span', {className: 'hqt-size-label'}, this.t('shortcutSizeLabel')),
          h('div', {className: 'hqt-size-row', role: 'group', 'aria-label': this.t('shortcutSizeLabel')},
            h('button', {
              type: 'button',
              className: 'hqt-size-step',
              'data-step': 'decrease',
              'aria-label': this.t('shortcutSizeDecrease'),
              disabled: effectiveSize <= MIN_SHORTCUT_FONT_SIZE,
              onClick: () => this.stepShortcutFontSize(-1),
            }, '−'),
            h('span', {
              className: 'hqt-size-value',
              'data-size-mode': isDefaultSize ? 'default' : 'custom',
            }, `${effectiveSize}px`),
            h('button', {
              type: 'button',
              className: 'hqt-size-step',
              'data-step': 'increase',
              'aria-label': this.t('shortcutSizeIncrease'),
              disabled: effectiveSize >= MAX_SHORTCUT_FONT_SIZE,
              onClick: () => this.stepShortcutFontSize(1),
            }, '+'))),
        h('div', {className: 'hqt-shortcuts-setting'},
          h('button', {
            type: 'button',
            className: 'hqt-open-shortcuts-button',
            'aria-haspopup': 'dialog',
            onClick: () => this.openShortcutsModal(),
          }, this.t('shortcutsOpenButton')))) : null);
    }

    render() {
      const count = this.props.quickControlsTargetCount || 0;
      const {position} = this.state;
      const resolvedShortcuts = this.getResolvedShortcuts();
      const resolvedFavorites = this.getFavoritesSettings(resolvedShortcuts);
      const broadcastChecked = count > 0;
      const broadcastCompact = broadcastChecked
        ? resolvedShortcuts.broadcastOff.compact
        : resolvedShortcuts.broadcastTab.compact;
      const broadcastTooltip = this.t('broadcastShortcut')(
        resolvedShortcuts.broadcastTab.shortcut,
        resolvedShortcuts.broadcastOff.shortcut
      );

      const order = this.state.toolbarOrder || DEFAULT_TOOLBAR_ORDER;
      const renderToolbarItem = (itemId) => {
        if (itemId === 'broadcastToggle') {
          return this.button(
            'broadcastToggle',
            broadcastChecked ? this.t('broadcastOn')(count) : this.t('broadcastOff'),
            broadcastTooltip,
            broadcastCompact,
            broadcastChecked
          );
        }
        if (itemId === 'favoritesToggle') {
          return this.favoritesToolbarButton(resolvedShortcuts.favoritesToggle);
        }
        const binding = resolvedShortcuts[itemId];
        if (!binding) return null;
        return this.button(itemId, this.t(itemId), binding.shortcut, binding.compact);
      };

      const toolbar = h('aside', {
        className: 'hqt-toolbar', 'data-position': position,
        lang: this.state.language, 'aria-label': this.t('toolbar'),
        ref: (element) => { this.toolbarElement = element; },
      },
      h('div', {className: 'hqt-track'},
        h('section', {className: 'hqt-group', 'aria-label': this.t('toolbar')},
          ...order.map(renderToolbarItem))),
      this.settings());

      return h(Hyper, Object.assign({}, this.props, {
        // Render beside Hyper's main window, so the hyper-scripts overlay cannot cover settings.
        customChildren: h(React.Fragment, null, this.props.customChildren,
          h('style', null, styles(
            this.props.quickControlsTheme || {},
            position,
            this.props.quickControlsHeaderHeight || 34,
            this.state.shortcutColor,
            this.state.shortcutFontSize
          )),
          toolbar,
          this.favoritesPalette(resolvedFavorites),
          this.shortcutsModal(resolvedShortcuts)),
      }));
    }
  };
};
