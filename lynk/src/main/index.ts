import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

import type { BrowserStateSnapshot, ChromeState } from '@shared/types'
import { BookmarkStore } from './bookmarks'
import { ExtensionHost } from './extensions'
import { registerIpcHandlers } from './ipc'
import { PowerManager } from './power'
import { SessionManager } from './session'
import { TabManager } from './tabs'

const isMac = process.platform === 'darwin'
const isDev = !app.isPackaged

app.commandLine.appendSwitch('enable-accelerated-video-decode')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('ignore-gpu-blacklist')

if (isMac && process.arch === 'arm64') {
  app.commandLine.appendSwitch('use-angle', 'metal')
}

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection in the Electron main process:', error)
})

async function createMainWindow(): Promise<BrowserWindow> {
  const preloadPath = join(__dirname, '../preload/index.js')
  const contentPreloadPath = join(__dirname, '../preload/content.js')
  const bookmarkStore = new BookmarkStore()
  const sessionManager = new SessionManager()
  const extensionHost = new ExtensionHost()

  let chromeState: ChromeState = bookmarkStore.getChromeState()

  const window = new BrowserWindow({
    minWidth: 1120,
    minHeight: 720,
    width: 1440,
    height: 960,
    show: false,
    title: 'Lynk',
    autoHideMenuBar: true,
    backgroundColor: '#0f1014',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    vibrancy: isMac ? 'sidebar' : undefined,
    visualEffectState: isMac ? 'active' : undefined,
    trafficLightPosition: isMac ? { x: 16, y: 14 } : undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  })

  const tabManager = new TabManager({
    window,
    contentPreloadPath,
    getSession: (isIncognito) => sessionManager.getSession(isIncognito),
    onTabsChanged: emitBrowserState,
    onVisit: (payload) => {
      bookmarkStore.recordVisit(payload)
      emitBrowserState()
    },
    onMediaStateChanged: (tabId, isPlaying) => {
      powerManager.setTabMediaState(tabId, isPlaying)
    },
    onIncognitoTabCreated: (isIncognito) => sessionManager.handleTabCreated(isIncognito),
    onIncognitoTabClosed: (isIncognito) => sessionManager.handleTabClosed(isIncognito).then(() => {
      emitBrowserState()
    }),
    isOnBattery: () => powerManager.isOnBattery()
  })

  const powerManager = new PowerManager({
    onPowerModeChanged: () => {
      tabManager.applyPowerPolicy()
      emitBrowserState()
    }
  })
  powerManager.start()

  const emitBookmarksChanged = (): void => {
    window.webContents.send('bookmarks:changed', bookmarkStore.getAll())
  }

  function getSnapshot(): BrowserStateSnapshot {
    const tabSnapshot = tabManager.getSnapshot()

    return {
      tabs: tabManager.getAllTabs(),
      activeTabId: tabSnapshot.activeTabId,
      previousTabId: tabSnapshot.previousTabId,
      split: tabSnapshot.split,
      chrome: chromeState,
      recentlyVisited: bookmarkStore.getRecentlyVisited(),
      extensions: extensionHost.getLoaded(),
      incognitoAudit: sessionManager.getAuditState()
    }
  }

  function emitBrowserState(): void {
    if (window.isDestroyed()) {
      return
    }

    window.webContents.send('browser:state', getSnapshot())
    window.webContents.send('window:setBounds', tabManager.getLastBounds())
  }

  function updateChrome(nextPartial: Partial<ChromeState>): BrowserStateSnapshot {
    chromeState = {
      ...chromeState,
      ...bookmarkStore.setChromeState(nextPartial),
      omniboxHeight: nextPartial.omniboxHeight ?? chromeState.omniboxHeight
    }
    tabManager.updateChromeState(chromeState)
    return getSnapshot()
  }

  registerIpcHandlers({
    window,
    tabManager,
    bookmarkStore,
    getSnapshot,
    emitBrowserState,
    emitBookmarksChanged,
    updateChrome
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  tabManager.updateChromeState(chromeState)
  await extensionHost.load(await sessionManager.getSession(false))
  await tabManager.createTab()
  emitBookmarksChanged()
  emitBrowserState()

  window.on('ready-to-show', () => {
    window.show()
  })

  window.on('resize', () => {
    tabManager.applyPowerPolicy()
  })
  window.on('maximize', () => {
    tabManager.applyPowerPolicy()
  })
  window.on('unmaximize', () => {
    tabManager.applyPowerPolicy()
  })
  window.on('enter-full-screen', () => {
    tabManager.applyPowerPolicy()
  })
  window.on('leave-full-screen', () => {
    tabManager.applyPowerPolicy()
  })
  window.on('closed', () => {
    powerManager.stop()
  })

  window.webContents.on('before-input-event', (event, input) => {
    const commandPressed = isMac ? input.meta : input.control
    const key = input.key.toLowerCase()

    if (input.type !== 'keyDown' || !commandPressed) {
      return
    }

    const activeTabId = tabManager.getSnapshot().activeTabId

    if (input.shift && key === 'n') {
      event.preventDefault()
      void tabManager.createTab({ incognito: true })
      return
    }

    if (!input.shift && key === 't') {
      event.preventDefault()
      void tabManager.createTab()
      return
    }

    if (!input.shift && key === 'w' && activeTabId) {
      event.preventDefault()
      void tabManager.closeTab(activeTabId)
      return
    }

    if (input.shift && key === '\\') {
      event.preventDefault()
      tabManager.toggleSplit()
      return
    }

    if (input.shift && key === 'b') {
      event.preventDefault()
      chromeState = {
        ...chromeState,
        bookmarkBarVisible: !chromeState.bookmarkBarVisible
      }
      chromeState = updateChrome({ bookmarkBarVisible: chromeState.bookmarkBarVisible }).chrome
      return
    }

    if (input.shift && key === 'o') {
      event.preventDefault()
      chromeState = {
        ...chromeState,
        bookmarkManagerVisible: !chromeState.bookmarkManagerVisible
      }
      chromeState = updateChrome({ bookmarkManagerVisible: chromeState.bookmarkManagerVisible }).chrome
      return
    }
  })

  return window
}

app.whenReady()
  .then(async () => {
    app.setAppUserModelId('com.lynk.browser')

    await createMainWindow()

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow()
      }
    })
  })
  .catch((error) => {
    console.error('Failed to start Lynk:', error)
    app.exit(1)
  })

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit()
  }
})
