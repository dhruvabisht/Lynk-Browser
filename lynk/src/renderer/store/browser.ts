import { create } from 'zustand'

import type {
  BookmarkNode,
  BookmarkNodeType,
  BrowserStateSnapshot,
  ChromeUpdateInput,
  WindowBoundsPayload
} from '@shared/types'

interface BrowserStoreState {
  initialized: boolean
  snapshot: BrowserStateSnapshot
  bounds: WindowBoundsPayload
  bookmarks: BookmarkNode[]
  pendingEditRequest: { nodeId: number; nodeType: BookmarkNodeType } | null
  hydrate: () => Promise<void>
  setSnapshot: (snapshot: BrowserStateSnapshot) => void
  setBounds: (bounds: WindowBoundsPayload) => void
  setBookmarks: (bookmarks: BookmarkNode[]) => void
  setPendingEditRequest: (payload: { nodeId: number; nodeType: BookmarkNodeType } | null) => void
  createTab: (input?: { url?: string; incognito?: boolean }) => Promise<void>
  closeTab: (tabId: string) => Promise<void>
  navigate: (tabId: string, url: string) => Promise<void>
  goBack: (tabId: string) => Promise<void>
  goForward: (tabId: string) => Promise<void>
  reload: (tabId: string) => Promise<void>
  activateTab: (tabId: string) => Promise<void>
  activateSplit: (leftTabId: string, rightTabId: string) => Promise<void>
  deactivateSplit: () => Promise<void>
  resizeSplit: (ratio: number) => Promise<void>
  toggleSplit: () => Promise<void>
  importBookmarks: () => Promise<void>
  updateChrome: (input: ChromeUpdateInput) => Promise<void>
}

const initialSnapshot: BrowserStateSnapshot = {
  tabs: [],
  activeTabId: null,
  previousTabId: null,
  split: null,
  chrome: {
    bookmarkBarVisible: true,
    bookmarkManagerVisible: false,
    omniboxHeight: 0
  },
  recentlyVisited: [],
  extensions: [],
  incognitoAudit: {
    activeTabCount: 0,
    clean: true,
    unexpectedWrites: []
  }
}

const initialBounds: WindowBoundsPayload = {
  window: { x: 0, y: 0, width: 0, height: 0 },
  chromeHeight: 80,
  content: { x: 0, y: 80, width: 0, height: 0 },
  bookmarkManagerWidth: 0,
  divider: null,
  panes: []
}

let subscriptionsBound = false

export const useBrowserStore = create<BrowserStoreState>((set) => ({
  initialized: false,
  snapshot: initialSnapshot,
  bounds: initialBounds,
  bookmarks: [],
  pendingEditRequest: null,
  hydrate: async () => {
    if (!subscriptionsBound) {
      window.lynk.browser.onState((snapshot) => {
        set({ snapshot })
      })
      window.lynk.browser.onBounds((bounds) => {
        set({ bounds })
      })
      window.lynk.bookmarks.onChanged((bookmarks) => {
        set({ bookmarks })
      })
      window.lynk.bookmarks.onEditRequest((payload) => {
        set({ pendingEditRequest: payload })
      })
      subscriptionsBound = true
    }

    const [snapshot, bookmarks] = await Promise.all([window.lynk.browser.getState(), window.lynk.bookmarks.getAll()])

    set({
      initialized: true,
      snapshot,
      bookmarks
    })
  },
  setSnapshot: (snapshot) => set({ snapshot }),
  setBounds: (bounds) => set({ bounds }),
  setBookmarks: (bookmarks) => set({ bookmarks }),
  setPendingEditRequest: (pendingEditRequest) => set({ pendingEditRequest }),
  createTab: async (input) => {
    await window.lynk.tabs.create(input)
  },
  closeTab: async (tabId) => {
    await window.lynk.tabs.close({ tabId })
  },
  navigate: async (tabId, url) => {
    await window.lynk.tabs.navigate({ tabId, url })
  },
  goBack: async (tabId) => {
    await window.lynk.tabs.goBack({ tabId })
  },
  goForward: async (tabId) => {
    await window.lynk.tabs.goForward({ tabId })
  },
  reload: async (tabId) => {
    await window.lynk.tabs.reload({ tabId })
  },
  activateTab: async (tabId) => {
    await window.lynk.tabs.activate({ tabId })
  },
  activateSplit: async (leftTabId, rightTabId) => {
    await window.lynk.split.activate({ leftTabId, rightTabId })
  },
  deactivateSplit: async () => {
    await window.lynk.split.deactivate()
  },
  resizeSplit: async (ratio) => {
    await window.lynk.split.resize({ ratio })
  },
  toggleSplit: async () => {
    await window.lynk.split.toggle()
  },
  importBookmarks: async () => {
    await window.lynk.bookmarks.importFromChrome()
  },
  updateChrome: async (input) => {
    const snapshot = await window.lynk.chrome.update(input)
    set({ snapshot })
  }
}))
