<div align="center">

# Lynk Browser

A modern macOS browser built around speed, control, and a cleaner browsing surface.

Lynk is a Chromium-based desktop browser with a custom interface, split-view browsing, local bookmark management, extension loading, and isolated incognito sessions. It is designed for people who keep too many tabs open, work across multiple pages at once, and want a browser that feels deliberate rather than bloated.

[![License](https://img.shields.io/github/license/dhruvabisht/Lynk-Browser?style=flat-square)](./LICENSE)
[![Stars](https://img.shields.io/github/stars/dhruvabisht/Lynk-Browser?style=flat-square)](https://github.com/dhruvabisht/Lynk-Browser/stargazers)
[![Last Commit](https://img.shields.io/github/last-commit/dhruvabisht/Lynk-Browser?style=flat-square)](https://github.com/dhruvabisht/Lynk-Browser/commits/main)
[![Top Language](https://img.shields.io/github/languages/top/dhruvabisht/Lynk-Browser?style=flat-square)](https://github.com/dhruvabisht/Lynk-Browser)

</div>

---

## What Lynk is

Lynk is an open-source browser for macOS built with Electron, React, TypeScript, Tailwind CSS, Zustand, and SQLite. It replaces the standard browser shell with a custom interface that gives you direct control over tabs, navigation, bookmarks, split view, and session behaviour.

The project is aimed at developers, researchers, and heavy browser users who care about structure, speed, and a more intentional browsing workflow.

---

## Preview

Add your screenshots or demo assets here once they are committed to the repository.

```md
![Lynk overview](./assets/lynk-overview.png)
![Lynk split view](./assets/lynk-split-view.png)
![Lynk demo](./assets/lynk-demo.gif)
```

---

## Highlights

| Feature | What it gives you |
|---|---|
| Custom browser chrome | A fully custom tab bar, address bar, bookmark bar, and window layout instead of a generic Electron wrapper |
| Split view | Two tabs side by side in the same window, with a resizable divider for comparison, research, and multitasking |
| Fast tab workflow | Quick tab creation, switching, activation, and closure with support for internal pages and incognito tabs |
| Search-ready address bar | URL input and search input in one place, with live suggestions for a modern omnibox-style flow |
| Local bookmark system | Bookmark bar, folders, editing, drag-and-drop reordering, and Chrome bookmark import backed by SQLite |
| Isolated incognito sessions | Separate session handling for private tabs, with more deliberate control over browsing state |
| Extension loading | Support for unpacked Chrome-style extensions from a local extensions directory |
| Media-aware behaviour | Lightweight video overlay controls and power-aware behaviour tuned for desktop usage |

---

## Why this project exists

Most experimental browsers stop at being a styled browser window with tabs. Lynk goes further than that.

The browser UI is part of the product, not an afterthought. Tabs are managed in-app. Split view is built in. Bookmarks have their own structure and persistence layer. Incognito mode is handled as a separate session instead of a visual toggle. The result is a browser that feels more considered and more useful for real work.

---

## Core capabilities

### Browser interface

Lynk ships with a custom-built interface rather than the default browser controls provided by the platform. That includes:

- a tab bar
- an omnibox-style address bar
- a bookmark bar
- a bookmark manager panel
- split-view controls
- an internal new tab experience

### Tab management

The browser supports a practical desktop tab workflow, including:

- opening and closing tabs
- switching between active and previous tabs
- internal new tab pages
- incognito tab creation
- drag-based tab interactions
- browser-view based tab rendering

### Split view

Split view is one of the strongest parts of the browser.

You can place two tabs side by side in a single window and resize the divider as needed. That makes Lynk especially useful for reading documentation while coding, comparing two pages, reviewing search results against source material, or working across multiple tools without switching windows.

### Bookmarks

Bookmarks are stored locally and treated as a real first-class feature rather than a checkbox item. Lynk includes:

- bookmark bar visibility controls
- bookmark folders
- inline editing
- drag-and-drop movement
- manager panel editing
- Chrome bookmark import support

### Search and navigation

The address bar handles both direct navigation and search-style queries. This keeps the browser usable for everyday browsing rather than making it feel like a technical demo.

### Incognito sessions

Incognito tabs run in a separate session with their own state lifecycle. This keeps private browsing behaviour more explicit and reduces leakage between regular and incognito contexts.

### Extension support

Lynk can load unpacked Chrome-compatible extensions from a local directory. That makes it possible to extend the browser without relying on a separate Chrome installation.

---

## Built with

- Electron
- React
- TypeScript
- Tailwind CSS
- Zustand
- better-sqlite3
- electron-vite
- electron-builder

---

## Getting started

### Requirements

- macOS
- Node.js `18.20.0` or later
- `pnpm`
- Xcode Command Line Tools

### Clone the repository

```bash
git clone https://github.com/dhruvabisht/Lynk-Browser.git
cd Lynk-Browser/lynk
```

### Install dependencies

```bash
pnpm install
```

### Run in development mode

```bash
pnpm dev
```

### Build the application

```bash
pnpm build
```

### Preview the production build locally

```bash
pnpm start
```

### Build macOS packages

```bash
pnpm build:mac
```

---

## Useful commands

```bash
pnpm dev
pnpm start
pnpm typecheck
pnpm build
pnpm build:dir
pnpm build:mac
```

---

## Example use cases

### Research and comparison

Open a search result on one side and the source material on the other using split view. This is useful for comparing documentation, evaluating vendors, checking implementation details, or reading while writing.

### Development workflow

Keep local documentation, issue trackers, design references, and test pages open in a single browser window with a bookmark structure that does not collapse into chaos after a week of use.

---

## Project structure

```text
Lynk-Browser/
├── README.md
├── LICENSE
└── lynk/
    ├── build/
    ├── resources/
    ├── scripts/
    ├── src/
    │   ├── main/
    │   ├── preload/
    │   ├── renderer/
    │   └── shared/
    ├── electron-builder.yml
    ├── electron.vite.config.ts
    ├── package.json
    ├── postcss.config.cjs
    ├── tailwind.config.cjs
    └── tsconfig.*.json
```

### Directory notes

#### `src/main`

Main-process logic for:

- window creation
- tab management
- session handling
- power management
- extension loading
- bookmark persistence
- IPC handlers

#### `src/preload`

The secure bridge between Electron and the renderer.

#### `src/renderer`

The React application that powers the browser UI, including:

- tab bar
- address bar
- bookmark bar
- split view
- new tab page
- renderer state

#### `src/shared`

Shared TypeScript types used across the main process and renderer.

---

## Architecture

Lynk is split into four clear layers:

1. **Main process**  
   Handles native browser concerns such as sessions, views, persistence, power events, and application lifecycle.

2. **Preload layer**  
   Exposes a controlled browser API to the renderer.

3. **Renderer**  
   Handles the visible browser interface and user interaction.

4. **Persistence layer**  
   Stores bookmarks and related browser data locally through SQLite.

This keeps the renderer focused on interface work while the browser-specific logic stays where it belongs.

---

## Contributing

Contributions are welcome.

If you want to improve Lynk:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run the checks locally
5. Open a pull request

Before submitting work, run:

```bash
pnpm typecheck
pnpm build
```

Bug reports, feature requests, and implementation discussions should go through GitHub Issues.

---

## License

This project is licensed under the **MIT License**.

See the [LICENSE](./LICENSE) file for details.

---

## Author

**Dhruva Bisht**

- GitHub: [@dhruvabisht](https://github.com/dhruvabisht)

---

## Notes

Lynk is still early, but the foundation is already there: custom browser chrome, structured tab management, split view, session isolation, bookmark persistence, and extension loading.

It is not trying to be a novelty wrapper around Chromium. The point of the project is to build a browser that feels tighter, sharper, and more intentional on macOS.
