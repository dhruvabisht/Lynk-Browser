import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'

import type {
  BrowserStateSnapshot,
  ChromeUpdateInput,
  InvokeRequestMap,
  InvokeResponseMap
} from '@shared/types'
import { BookmarkStore } from './bookmarks'
import { TabManager } from './tabs'

interface IpcRegistrarOptions {
  window: BrowserWindow
  tabManager: TabManager
  bookmarkStore: BookmarkStore
  getSnapshot: () => BrowserStateSnapshot
  emitBrowserState: () => void
  emitBookmarksChanged: () => void
  updateChrome: (input: ChromeUpdateInput) => BrowserStateSnapshot
}

function registerHandler<C extends keyof InvokeRequestMap>(
  channel: C,
  handler: (payload: InvokeRequestMap[C]) => Promise<InvokeResponseMap[C]> | InvokeResponseMap[C]
): void {
  ipcMain.handle(channel, async (_event, payload) => handler(payload as InvokeRequestMap[C]))
}

export function registerIpcHandlers(options: IpcRegistrarOptions): void {
  registerHandler('browser:getState', () => options.getSnapshot())

  registerHandler('tab:create', async (payload) => options.tabManager.createTab(payload))
  registerHandler('tab:close', async ({ tabId }) => {
    await options.tabManager.closeTab(tabId)
  })
  registerHandler('tab:navigate', async ({ tabId, url }) => {
    await options.tabManager.navigate(tabId, url)
  })
  registerHandler('tab:goBack', ({ tabId }) => {
    options.tabManager.goBack(tabId)
  })
  registerHandler('tab:goForward', ({ tabId }) => {
    options.tabManager.goForward(tabId)
  })
  registerHandler('tab:reload', ({ tabId }) => {
    options.tabManager.reload(tabId)
  })
  registerHandler('tab:activate', ({ tabId }) => {
    options.tabManager.activateTab(tabId)
  })
  registerHandler('tab:getAll', () => options.tabManager.getAllTabs())

  registerHandler('split:activate', ({ leftTabId, rightTabId }) => {
    options.tabManager.activateSplit(leftTabId, rightTabId)
  })
  registerHandler('split:deactivate', () => {
    options.tabManager.deactivateSplit()
  })
  registerHandler('split:resize', ({ ratio }) => {
    options.tabManager.resizeSplit(ratio)
  })
  registerHandler('split:toggle', () => {
    options.tabManager.toggleSplit()
  })

  registerHandler('bookmark:add', (payload) => {
    const bookmark = options.bookmarkStore.addBookmark(payload)
    options.emitBookmarksChanged()
    options.emitBrowserState()
    return bookmark
  })
  registerHandler('bookmark:remove', ({ id }) => {
    options.bookmarkStore.removeBookmark(id)
    options.emitBookmarksChanged()
    options.emitBrowserState()
  })
  registerHandler('bookmark:getAll', () => options.bookmarkStore.getAll())
  registerHandler('bookmark:import', () => {
    options.bookmarkStore.importFromChrome()
    options.emitBookmarksChanged()
    options.emitBrowserState()
  })
  registerHandler('bookmark:update', (payload) => {
    const bookmark = options.bookmarkStore.updateBookmark(payload)
    options.emitBookmarksChanged()
    options.emitBrowserState()
    return bookmark
  })
  registerHandler('bookmark:createFolder', (payload) => {
    const folder = options.bookmarkStore.createFolder(payload)
    options.emitBookmarksChanged()
    options.emitBrowserState()
    return folder
  })
  registerHandler('bookmark:updateFolder', (payload) => {
    const folder = options.bookmarkStore.updateFolder(payload)
    options.emitBookmarksChanged()
    options.emitBrowserState()
    return folder
  })
  registerHandler('bookmark:move', (payload) => {
    options.bookmarkStore.moveNode(payload)
    options.emitBookmarksChanged()
    options.emitBrowserState()
  })

  registerHandler('search:suggest', async ({ query }) => {
    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      return []
    }

    const response = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(trimmedQuery)}`
    )
    const payload = (await response.json()) as [string, string[]]

    return payload[1].slice(0, 6)
  })

  registerHandler('chrome:update', (payload) => options.updateChrome(payload))
}
