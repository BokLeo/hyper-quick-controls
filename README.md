# Hyper Quick Controls

A compact, dockable toolbar for [Hyper](https://hyper.is): tabs, pane splits,
navigation and broadcast input, with visible keyboard shortcut hints.

## Features

- New tab, previous/next tab, left/right and top/bottom splits, previous/next pane.
- Icons plus compact shortcut labels. Hover to see the complete action description.
- A single broadcast toggle, with an indicator and target count in the tooltip.
- A settings button to dock the toolbar on any of the four edges.
- English by default, with an English / 한국어 language selector in settings.
- Local position persistence and reserved terminal space to avoid covering output.
- Colors follow the Hyper background, foreground and border settings.
- Keeps the hyper-scripts selector below a top-docked toolbar when that plugin is installed.
- No build step and no additional npm runtime dependencies in this plugin.

## Compatibility

Tested interactively on **Windows with Hyper 3.4.1**. Broadcast integration was
tested with **hyper-broadcast 2.0.0**. macOS and Linux have not been verified.
The UI defaults to English and supports Korean, with **Windows default shortcuts**.
Shortcut hints are informational; they do not reflect custom Hyper keymaps.

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
copies the plugin into `.hyper_plugins\local\hyper-quick-controls`, and adds
`"hyper-quick-controls"` to `localPlugins`. It preserves other settings and does
not install third-party plugins. It refuses unfamiliar `localPlugins` syntax
rather than rewriting the entire configuration.

### Manual installation

Copy `index.js`, `toolbar.js`, `package.json`, `LICENSE` and this README into:

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

## Toolbar placement

Click the settings icon and choose **Top**, **Bottom**, **Left** or **Right**.
The default is top.
The selection is stored locally and restored on reload.

Horizontal toolbars show the icon next to its shortcut. Vertical toolbars put
the shortcut below the icon. Shift is written as `Shift`; Page Up/Down are
shortened to `Pg↑`/`Pg↓`. Hover for the full description and shortcut.

## Language

The default language is **English**. Open the settings icon and use the
**Language** selector to choose **English** or **한국어**.
Tooltips, accessible labels, broadcast status and settings labels update immediately.
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

Tests cover command dispatch, broadcast state decisions, toolbar placement,
position/language persistence, language switching, invalid storage and preservation of other plugin children.
They run without a local Hyper installation. Real Hyper integration and visual
layout should also be checked when changing event names or CSS selectors.

## License

[MIT](LICENSE) — Copyright (c) 2026 BokLeo.
See [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md) for related projects.
