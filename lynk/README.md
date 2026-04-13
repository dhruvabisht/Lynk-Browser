# Lynk

Lynk is a desktop web browser built with Electron 41, React 18, TypeScript, Tailwind CSS, and `better-sqlite3`.

## Features

- BrowserView-backed tabs with loading state, favicon/title updates, keyboard shortcuts, and overflow scrolling
- Side-by-side split view with draggable divider and inline per-pane address bars
- True incognito tabs backed by a dedicated in-memory Electron session with cookie stripping, storage clearing, and userData auditing
- Google-powered omnibox search with debounced suggestions
- Bookmark bar, bookmark manager tree, SQLite persistence, folder nesting, drag-to-reorder, and Chrome bookmark import on macOS
- Universal video controls injected into page `<video>` elements, with YouTube native controls preserved
- macOS power optimizations, GPU switches, and packaging configuration for signed hardened-runtime builds

## Requirements

- Node.js 18.20+ or newer
- pnpm 10.x
- macOS for local `build:mac` packaging

This project is configured to work on the default macOS/Homebrew Node 18+ line and newer Node releases.

## Setup

```bash
pnpm install
pnpm dev
```

`pnpm install` will warn that `better-sqlite3`'s own build script was ignored. That is expected here: Lynk rebuilds the native module in `postinstall` for the active Electron/macOS architecture so Apple Silicon installs do not end up with an incompatible binary.
`pnpm dev` also rebuilds Electron native dependencies before launch so a stale `x64` binding cannot crash the arm64 Electron runtime.

## Build

```bash
pnpm build
```

This writes the Electron application bundles into `out/`.

## Package For macOS

```bash
pnpm build:dir
pnpm build:mac
```

- `pnpm build:dir` validates the packaged `.app` layout in `dist/mac-arm64` or `dist/mac-x64`.
- `pnpm build:mac` produces macOS artifacts in `dist/`, including DMG/ZIP targets for `arm64` and `x64`.
- If a signing identity is available in the local keychain, `electron-builder` uses hardened runtime with `build/entitlements.mac.plist`.

## Project Structure

```text
src/
  main/       Electron main-process browser orchestration
  preload/    Secure preload bridge and page-level video injection
  renderer/   React shell, components, styles, and Zustand store
  shared/     Typed IPC and shared interfaces
```

## Data Storage

- Bookmarks/settings database: `path.join(app.getPath('userData'), 'bookmarks.db')`
- Unpacked extensions directory: `resources/extensions/`

## Keyboard Shortcuts

- `Cmd+T`: new tab
- `Cmd+Shift+N`: new incognito tab
- `Cmd+W`: close current tab
- `Cmd+Shift+\\`: toggle split view with current and previous tabs
- `Cmd+Shift+B`: toggle bookmark bar
- `Cmd+Shift+O`: toggle bookmark manager

## Notes

- Incognito tabs never record visit history into the SQLite history table.
- Incognito BrowserViews disable Blink service workers, strip `Set-Cookie`/`Cookie` headers, and clear storage/cache on close.
- Search suggestions come from Google via the typed `search:suggest` IPC contract.
