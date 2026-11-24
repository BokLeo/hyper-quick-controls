# Hyper Quick Controls

A compact, dockable toolbar for [Hyper](https://hyper.is): tabs, pane splits,
navigation, broadcast input, keyboard-triggered command favorites, and customizable
toolbar shortcuts and button order.

## Features

- New tab, previous/next tab, left/right and top/bottom splits, previous/next pane.
- Icons plus vivid, customizable shortcut labels (`#3AEED9` default, `12px` default). Hover to see the complete action description.
- A single broadcast toggle, with an indicator and target count in the tooltip.
- Keyboard-triggered **command favorites** palette (shortcut unset by default): navigate with `Up`/`Down`, insert onto the prompt line without executing with `Enter`, and close with `Esc` or the same shortcut while restoring focus to the original terminal.
- A settings button to dock the toolbar on any of the four edges, switch between English and 한국어, pick a custom shortcut text color (or reset to `#3AEED9`), adjust shortcut text size (`−`/`+`, `10px–16px`, default `12px`), and open the **Keyboard shortcuts** modal.
- Full shortcut customization for all toolbar actions with conflict detection, plus drag-and-drop and keyboard (`↑`/`↓`) reordering synchronized between the toolbar and the shortcuts modal.
- Local preference persistence and reserved terminal space to avoid covering output.
- Colors follow the Hyper background, foreground and border settings.
- Keeps the hyper-scripts selector below a top-docked toolbar when that plugin is installed.
- No build step and no additional npm runtime dependencies in this plugin.

## Compatibility

Tested interactively on **Windows with Hyper 3.4.1**. Broadcast integration was
tested with **hyper-broadcast 2.0.0**. macOS and Linux have not been verified.
The UI defaults to English and supports Korean, with **Windows default shortcuts**.
Default shortcut hints reflect Windows Hyper defaults unless customized in the
**Keyboard shortcuts** modal (they do not automatically mirror custom `.hyper.js` `keymaps`).

The plugin uses Hyper's internal command/event names and CSS selectors, so newer
Hyper or third-party plugin versions may require compatibility updates.

## Install from GitHub (Windows)

This is currently a GitHub/local plugin distribution, **not an npm release**.
The package remains private to prevent accidental npm publishing.

1. Clone this repository, or download and extract its source ZIP.
2. In a PowerShell window opened in the repository folder, run:

   ```powershell
   .\install.ps1
   ```

3. In Hyper, use **View → Full Reload** (`Ctrl+Shift+F5`). Check any running work
   before reloading. If a newly installed main-process hook is not available,
   restart Hyper after finishing that work.

The installer locates `%APPDATA%\Hyper\.hyper.js`, creates timestamped backups,
copies the plugin files into `.hyper_plugins\local\hyper-quick-controls`, and adds
`"hyper-quick-controls"` to `localPlugins`. It preserves other settings and does
not install third-party plugins. It refuses unfamiliar `localPlugins` syntax
rather than rewriting the entire configuration.

### Manual installation

Copy `index.js`, `favorites.js`, `shortcuts.js`, `toolbar.js`, `package.json`, `LICENSE`, `ACKNOWLEDGEMENTS.md` and this README into:

```text
%APPDATA%\Hyper\.hyper_plugins\local\hyper-quick-controls\
```

Add the plugin name to your existing `.hyper.js` configuration:

```js
module.exports = {
  // Keep your existing config, plugins and other settings.
  localPlugins: ['hyper-quick-controls'],
};
```

Keep any existing `localPlugins` entries as well.

## Broadcast input

The broadcast toggle requires [hyper-broadcast](https://github.com/chabou/hyper-broadcast)
to be installed separately and included in Hyper's `plugins` list.
Tab and pane commands do not require it. hyper-scripts and hyper-pane are optional.

- Turning on selects all panes in the **current tab at that moment**.
- After adding another pane, turn off and on again to include the new pane.
- Turning off clears broadcast targets across all tabs.
- The icon's background and dot show the enabled state; hover to see the target count.

## Command favorites

Configure favorite commands and an optional keyboard shortcut in `.hyper.js` under `config.quickControls` (you can also set, change, or unset the shortcut in the **Keyboard shortcuts** modal):

```js
module.exports = {
  config: {
    quickControls: {
      favoritesShortcut: 'Ctrl+Alt+K', // Unset by default
      favorites: [
        { label: 'Git status', command: 'git status' },
        'npm test',
      ],
    },
  },
};
```

- **Unset by default**: No key opens the favorites palette until you configure a shortcut.
- **Recent**: On Windows, opening the palette reads the last three complete, single-line commands from the default Windows PowerShell PSReadLine history (`%APPDATA%/Microsoft/Windows/PowerShell/PSReadLine/ConsoleHost_history.txt`), newest first. Choose **More** to browse up to 50 commands from the history file's tail, or **Show less** to return to three. Use the same arrow keys and Enter to select an entry. Palette selections do not change Recent until PSReadLine saves the command.
- **Manage favorites**: Use **Add command** to enter a command and an optional label. Select a Recent command and choose **Add to favorites**, or select a favorite and choose **Edit** or **Delete**. Use `Tab` to reach these controls and `Esc` to cancel editing. The first change saves a local copy of the configured favorites.
- **Toolbar button & shortcut badge**: The toolbar includes a **Command favorites** button showing the configured shortcut (or `Favorites` / `즐겨찾기` when unset). Clicking the button toggles the same palette while preserving terminal focus.
- **Keyboard flow**: Press your configured shortcut (or click the toolbar button) to open the palette; press `Up`/`Down` to navigate, `Enter` to insert the selected command, or `Esc` / the same shortcut / the toolbar button to close and restore focus to the original terminal.
- **Target consistency & no duplicate broadcast**: The palette header shows the live target mode and count (`Active pane · 1` when broadcast is off, or `Broadcast · N panes` using live sessions in `sessions.broadcast` when on). On `Enter`, text is sent directly via `window.rpc.emit('data', { uid, data })` once per live target instead of `SESSION_USER_DATA`, preventing `hyper-broadcast` middleware from duplicating input.
- **Insert-only safety**: Newlines (`\r`, `\n`, Unicode line/paragraph separators) and executable control characters (`0x00–0x1F`, `0x7F–0x9F`) are blocked, and the `Enter` key itself (including held auto-repeats until `keyup`) is intercepted so commands are inserted onto the prompt line without executing.
- **No hover interference**: There is no right-edge mouse hover trigger, and normal terminal drag selection and copy behavior remain untouched.

## Keyboard shortcuts & button order

Open the toolbar settings popover and click **Shortcut settings…** (`단축키 설정…`) to customize shortcuts and reorder buttons for all actions provided by `hyper-quick-controls`:

- Tabs: **New tab**, **Previous tab**, **Next tab**
- Panes: **Split right**, **Split down**, **Previous pane**, **Next pane**
- Broadcast: **Broadcast on (current tab)** and **Broadcast off** (grouped together as one toolbar item)
- **Command favorites** (unset by default)

### Behavior, conflict prevention & scope

- **Live execution & toolbar sync**: Custom bindings are saved in `localStorage` (`hyper-quick-controls.shortcuts.v1`, automatically migrating any prior `hyper-quick-controls.favoritesShortcut.v1` entry), update the toolbar shortcut labels immediately, and trigger the corresponding Hyper / `hyper-broadcast` / favorites action directly.
- **No duplicate execution**: Default bindings for built-in Hyper and `hyper-broadcast` commands are **not** re-dispatched by this plugin's renderer listener; only custom overrides and `favoritesToggle` are handled in the renderer.
- **Conflict blocking**: Assigning a shortcut already used by another `hyper-quick-controls` action, a built-in Hyper shortcut (e.g., `Ctrl+Shift+C`, `Ctrl+Shift+K`, `Ctrl+Shift+T`), a `hyper-broadcast` default (`Ctrl+Alt+T`, `Ctrl+Alt+P`, `Ctrl+Alt+A`, `Ctrl+Alt+B`), or a bare key without modifiers is blocked with an inline alert.
- **Scope note**: Hyper's own built-in keymaps and `hyper-broadcast`'s menu accelerators remain active in Hyper for their original default key combinations unless you also change them in `.hyper.js` (`keymaps`). `hyper-quick-controls` does not hijack unrelated Hyper commands.
- **Drag-and-drop & modal reordering**: Drag toolbar buttons directly (horizontal or vertical docking) or reorder items in the **Keyboard shortcuts** modal via drag-and-drop or keyboard `↑`/`↓` buttons. Broadcast on/off stay grouped together as one item so toolbar and modal order always match. Order is saved in `localStorage` (`hyper-quick-controls.order.v1`) and can be restored via **Reset order** without erasing custom shortcuts or affecting terminal drag selection and copy.
- **Safe recording**: While recording a shortcut or while the modal is open, `Esc` cancels recording (or closes the modal and restores focus), and keys are prevented from leaking into the terminal.

## Toolbar placement & appearance

Click the settings icon to configure:

- **Toolbar position**: **Top** (default), **Bottom**, **Left**, or **Right**.
- **Shortcut text color**: Default `#3AEED9`, custom color picker, and **Reset** (`기본값 복원`).
- **Shortcut text size**: `−` / `+` stepper buttons (`10px–16px`, default `12px`). Vertical docking width and button height expand automatically to prevent clipping without altering the terminal body font.

Horizontal toolbars show the icon next to its shortcut. Vertical toolbars put
the shortcut below the icon. Shift is written as `Shift`; Page Up/Down are
shortened to `Pg↑`/`Pg↓`. Hover for the full description and shortcut. All preferences
are stored locally and restored on reload.

## Language

The default language is **English**. Open the settings icon and use the
**Language** selector to choose **English** or **한국어**.
Tooltips, accessible labels, broadcast status, command favorites, shortcuts modal and settings labels update immediately.
The choice is saved locally, independently of toolbar placement, and restored on reload.
Keyboard shortcut labels remain in English. No translation service or network access is required.

## Uninstall

Remove `"hyper-quick-controls"` from `localPlugins`, then fully reload Hyper.
The installer backups can be used to restore your earlier configuration.

## Development

No dependency installation or build is required. Use Node.js 22 or newer:

```sh
npm test
```

Tests cover command dispatch, broadcast state decisions, keyboard command favorites
(unset default shortcut, toggle open/close, Esc/Up/Down/Enter handling, held-Enter repeat
blocking, focus restoration, active vs live broadcast exactly-once insertion, newline/control-character
blocking, no right-edge hover trigger, preserved terminal drag selection and copy),
shortcut text color/size settings, full action shortcut customization with conflict blocking
and legacy migration, toolbar and modal drag/keyboard reordering, toolbar placement,
position/language persistence, language switching, invalid storage and preservation of other plugin children.
They run without a local Hyper installation. Real Hyper integration and visual
layout should also be checked when changing event names or CSS selectors.

## License

[MIT](LICENSE) — Copyright (c) 2026 BokLeo.
See [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md) for related projects.
