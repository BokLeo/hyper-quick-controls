'use strict';

const STORAGE_KEY = 'hyper-quick-controls.position.v1';
const LANGUAGE_KEY = 'hyper-quick-controls.language.v1';
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
    broadcastOff: 'Broadcast input off',
    broadcastOn: (count) => `Broadcast input on · ${count} ${count === 1 ? 'pane' : 'panes'}`,
    broadcastShortcut: 'Ctrl + Alt + T: Enable for current tab\nCtrl + Alt + P: Disable',
  },
  ko: {
    toolbar: 'Hyper 빠른 조작', settings: '툴바 설정',
    settingsTitle: '툴바 설정 · 위치 및 언어 변경',
    position: '툴바 위치', language: '언어',
    top: '상단', bottom: '하단', left: '왼쪽', right: '오른쪽',
    newTab: '새 탭', previousTab: '이전 탭', nextTab: '다음 탭',
    splitRight: '좌우 분할', splitDown: '상하 분할',
    previousPane: '이전 Pane', nextPane: '다음 Pane',
    broadcastOff: '다중 입력 꺼짐',
    broadcastOn: (count) => `다중 입력 켜짐 · ${count}개 Pane`,
    broadcastShortcut: 'Ctrl + Alt + T: 현재 탭에서 켜기\nCtrl + Alt + P: 끄기',
  },
};
const SIZE = 38;
const SIDE_WIDTH = 104;
const SHORTCUTS = Object.freeze({
  newTab: 'Ctrl Shift T',
  previousTab: 'Ctrl Shift Tab',
  nextTab: 'Ctrl Tab',
  splitRight: 'Ctrl Shift D',
  splitDown: 'Ctrl Shift E',
  previousPane: 'Ctrl Pg↓',
  nextPane: 'Ctrl Pg↑',
});
const icons = {
  newTab: ['M4 4h16v16H4z', 'M12 8v8M8 12h8'],
  previousTab: ['M4 4h16v16H4z', 'm13 8-4 4 4 4'],
  nextTab: ['M4 4h16v16H4z', 'm11 8 4 4-4 4'],
  splitRight: ['M3 4h18v16H3z', 'M12 4v16'],
  splitDown: ['M3 4h18v16H3z', 'M3 12h18'],
  previousPane: ['M4 5v14', 'M20 12H8m5-5-5 5 5 5'],
  nextPane: ['M20 5v14', 'M4 12h12m-5-5 5 5-5 5'],
  broadcastToggle: ['M4 8v8m4-6v4m4-9v14m4-9v4m4-6v8'],
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

function styles(theme, position, headerHeight) {
  const horizontal = position === 'top' || position === 'bottom';
  return `
    #hyper .hyper_main .terms_terms {
      left: ${position === 'left' ? SIDE_WIDTH : 0}px !important;
      right: ${position === 'right' ? SIDE_WIDTH : 0}px !important;
      top: ${position === 'top' ? SIZE : 0}px !important;
      bottom: ${position === 'bottom' ? SIZE + 26 : 0}px !important;
    }
    /* hyper-scripts fixes its selector at y=40; keep it clear of the docked toolbar. */
    #hyper .commands {
      top: ${headerHeight + (position === 'top' ? SIZE : 0)}px !important;
      margin-top: 0 !important;
      right: ${position === 'right' ? SIDE_WIDTH : 0}px !important;
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
      position: fixed; z-index: 30; box-sizing: border-box;
      display: flex; flex-direction: ${horizontal ? 'row' : 'column'};
      background: var(--hqt-bg); color: var(--hqt-fg);
      font: 11px/1.5 ${theme.uiFontFamily || '"Segoe UI", "Malgun Gothic", sans-serif'};
      -webkit-app-region: no-drag;
      ${horizontal ? `height: ${SIZE}px; left: 0; right: 0;` : `width: ${SIDE_WIDTH}px; top: ${headerHeight}px; bottom: 26px;`}
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
      cursor: pointer; opacity: 0.65; -webkit-app-region: no-drag;
    }
    .hqt-button:hover { opacity: 1; background: rgba(127,127,127,0.16); }
    .hqt-button:active { background: rgba(127,127,127,0.25); }
    .hqt-button:focus-visible, .hqt-placement:focus-visible { outline: 1px solid currentColor; outline-offset: -1px; opacity: 1; }
    .hqt-button svg, .hqt-placement svg { width: 16px; height: 16px; pointer-events: none; }
    .hqt-button svg { flex: 0 0 16px; }
    .hqt-shortcut { font: 10px/1.2 Consolas, "Malgun Gothic", monospace; white-space: nowrap; opacity: 0.6; }
    ${horizontal ? '' : `
      .hqt-track .hqt-button { flex-direction: column; width: ${SIDE_WIDTH - 8}px; height: 46px; padding: 4px 0; gap: 4px; }
    `}
    .hqt-button[aria-checked="true"] { opacity: 1; background: rgba(127,127,127,0.2); }
    .hqt-button[aria-checked="true"]::after {
      content: ''; position: absolute; right: 3px; top: 3px; width: 4px; height: 4px;
      border-radius: 50%; background: currentColor;
    }
    .hqt-settings { position: relative; display: flex; align-items: center; justify-content: center; flex: 0 0 37px; }
    .hqt-settings > .hqt-button { width: 30px; height: 30px; padding: 0; }
    .hqt-popover {
      position: absolute; z-index: 40; width: 176px; padding: 10px;
      box-sizing: border-box; border: 1px solid var(--hqt-border); border-radius: 5px;
      background: var(--hqt-bg); color: var(--hqt-fg); box-shadow: 0 6px 20px rgba(0,0,0,0.3);
      ${position === 'top' ? 'top: 40px; right: 4px;' : ''}
      ${position === 'bottom' ? 'bottom: 40px; right: 4px;' : ''}
      ${position === 'left' ? `left: ${SIDE_WIDTH + 2}px; bottom: 4px;` : ''}
      ${position === 'right' ? `right: ${SIDE_WIDTH + 2}px; bottom: 4px;` : ''}
    }
    .hqt-popover-title { margin: 0 0 8px; font-size: 11px; font-weight: 400; opacity: 0.6; }
    .hqt-language { display: block; margin-top: 12px; }
    .hqt-language-label { display: block; margin-bottom: 6px; opacity: 0.6; }
    .hqt-language select {
      width: 100%; padding: 6px; box-sizing: border-box; font: inherit;
      background: var(--hqt-bg); color: var(--hqt-fg); border: 1px solid var(--hqt-border);
      border-radius: 3px; cursor: pointer;
    }
    .hqt-language select:focus-visible { outline: 1px solid currentColor; outline-offset: 1px; }
    .hqt-placements { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .hqt-placement {
      display: flex; align-items: center; justify-content: center; gap: 7px; padding: 7px 4px;
      font: inherit; color: inherit; background: transparent; border: 1px solid var(--hqt-border);
      border-radius: 3px; cursor: pointer;
    }
    .hqt-placement:hover, .hqt-placement[aria-pressed="true"] { background: rgba(127,127,127,0.2); }
    .hqt-placement[aria-pressed="true"] { border-color: currentColor; }
  `;
}

exports.mapHyperState = (state, map) => {
  const {sessions, termGroups, ui} = state;
  const targets = (sessions.broadcast || []).filter((uid) => !!sessions.sessions[uid]);
  const rootCount = Object.values(termGroups.termGroups).filter((group) => !group.parentUid).length;
  return Object.assign({}, map, {
    quickControlsTargetCount: targets.length,
    quickControlsHeaderHeight: !map.isMac && rootCount > 1 ? 68 : 34,
    quickControlsTheme: {
      backgroundColor: ui.backgroundColor,
      foregroundColor: ui.foregroundColor,
      borderColor: ui.borderColor,
      uiFontFamily: ui.uiFontFamily,
    },
  });
};

exports.decorateHyper = (Hyper, {React}, runAction) => {
  const h = React.createElement;
  const icon = (name) => h('svg', {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
    strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false,
  }, ...icons[name].map((d, i) => h('path', {d, key: i})));

  return class QuickControls extends React.Component {
    constructor(props) {
      super(props);
      this.state = {
        position: readPreference(STORAGE_KEY, POSITIONS, 'top'),
        language: readPreference(LANGUAGE_KEY, LANGUAGES, 'en'),
        settingsOpen: false,
      };
      this.onOutside = (event) => {
        if (this.state.settingsOpen && this.settingsElement && !this.settingsElement.contains(event.target)) {
          this.setState({settingsOpen: false});
        }
      };
    }

    componentDidMount() { document.addEventListener('pointerdown', this.onOutside, true); }
    componentWillUnmount() { document.removeEventListener('pointerdown', this.onOutside, true); }

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

    button(action, label, shortcut, checked) {
      const description = shortcut ? `${label}\n${shortcut}` : label;
      const compact = action === 'broadcastToggle' ? (checked ? 'Ctrl Alt P' : 'Ctrl Alt T') : SHORTCUTS[action];
      return h('button', {
        key: action, type: 'button', className: 'hqt-button',
        title: description, 'aria-label': description,
        role: checked === undefined ? undefined : 'switch', 'aria-checked': checked,
        onMouseDown: (event) => event.preventDefault(), onClick: () => this.run(action),
      }, icon(action), h('kbd', {className: 'hqt-shortcut', 'aria-hidden': true}, compact));
    }

    settings() {
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
        onClick: () => this.setState((state) => ({settingsOpen: !state.settingsOpen})),
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
          h('option', {value: 'ko', lang: 'ko'}, '한국어')))) : null);
    }

    render() {
      const count = this.props.quickControlsTargetCount || 0;
      const {position} = this.state;
      const toolbar = h('aside', {
        className: 'hqt-toolbar', 'data-position': position,
        lang: this.state.language, 'aria-label': this.t('toolbar'),
      },
      h('div', {className: 'hqt-track'},
        h('section', {className: 'hqt-group', 'aria-label': 'hyper'},
          this.button('newTab', this.t('newTab'), 'Ctrl + Shift + T'),
          this.button('previousTab', this.t('previousTab'), 'Ctrl + Shift + Tab'),
          this.button('nextTab', this.t('nextTab'), 'Ctrl + Tab')),
        h('section', {className: 'hqt-group', 'aria-label': 'hyper-controll'},
          this.button('splitRight', this.t('splitRight'), 'Ctrl + Shift + D'),
          this.button('splitDown', this.t('splitDown'), 'Ctrl + Shift + E'),
          this.button('previousPane', this.t('previousPane'), 'Ctrl + Page Down'),
          this.button('nextPane', this.t('nextPane'), 'Ctrl + Page Up'),
          this.button('broadcastToggle', count > 0 ? this.t('broadcastOn')(count) : this.t('broadcastOff'),
            this.t('broadcastShortcut'), count > 0))),
      this.settings());

      return h(Hyper, Object.assign({}, this.props, {
        // Render beside Hyper's main window, so the hyper-scripts overlay cannot cover settings.
        customChildren: h(React.Fragment, null, this.props.customChildren,
          h('style', null, styles(this.props.quickControlsTheme || {}, position, this.props.quickControlsHeaderHeight || 34)),
          toolbar),
      }));
    }
  };
};
