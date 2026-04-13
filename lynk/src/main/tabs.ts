import { BrowserView, BrowserWindow } from 'electron'
import type { Session, WebContents } from 'electron'

import type {
  ChromeState,
  SplitState,
  TabCreateInput,
  TabState,
  WindowBoundsPayload
} from '@shared/types'

const TAB_BAR_HEIGHT = 36
const TOOLBAR_HEIGHT = 44
const BOOKMARK_BAR_HEIGHT = 36
const SPLIT_HEADER_HEIGHT = 44
const DIVIDER_WIDTH = 12
const BOOKMARK_MANAGER_WIDTH = 320
const INTERNAL_NEW_TAB_URL = 'lynk://new-tab'

interface ManagedTab {
  id: string
  state: TabState
  view: BrowserView
}

interface TabManagerOptions {
  window: BrowserWindow
  contentPreloadPath: string
  getSession: (isIncognito: boolean) => Promise<Session>
  onTabsChanged: () => void
  onVisit: (input: { url: string; title: string; favicon?: string | null; isIncognito: boolean }) => void
  onMediaStateChanged: (tabId: string, isPlaying: boolean) => void
  onIncognitoTabCreated: (isIncognito: boolean) => Promise<void>
  onIncognitoTabClosed: (isIncognito: boolean) => Promise<void>
  isOnBattery: () => boolean
}

export class TabManager {
  private readonly window: BrowserWindow
  private readonly contentPreloadPath: string
  private readonly getSession: (isIncognito: boolean) => Promise<Session>
  private readonly onTabsChanged: () => void
  private readonly onVisit: TabManagerOptions['onVisit']
  private readonly onMediaStateChanged: TabManagerOptions['onMediaStateChanged']
  private readonly onIncognitoTabCreated: TabManagerOptions['onIncognitoTabCreated']
  private readonly onIncognitoTabClosed: TabManagerOptions['onIncognitoTabClosed']
  private readonly isOnBattery: () => boolean
  private readonly tabs = new Map<string, ManagedTab>()
  private readonly tabOrder: string[] = []
  private activeTabId: string | null = null
  private previousTabId: string | null = null
  private splitState: SplitState | null = null
  private chromeState: ChromeState = {
    bookmarkBarVisible: true,
    bookmarkManagerVisible: false,
    omniboxHeight: 0
  }
  private lastBounds: WindowBoundsPayload = {
    window: { x: 0, y: 0, width: 0, height: 0 },
    chromeHeight: TAB_BAR_HEIGHT + TOOLBAR_HEIGHT,
    content: { x: 0, y: TAB_BAR_HEIGHT + TOOLBAR_HEIGHT, width: 0, height: 0 },
    bookmarkManagerWidth: 0,
    divider: null,
    panes: []
  }

  constructor(options: TabManagerOptions) {
    this.window = options.window
    this.contentPreloadPath = options.contentPreloadPath
    this.getSession = options.getSession
    this.onTabsChanged = options.onTabsChanged
    this.onVisit = options.onVisit
    this.onMediaStateChanged = options.onMediaStateChanged
    this.onIncognitoTabCreated = options.onIncognitoTabCreated
    this.onIncognitoTabClosed = options.onIncognitoTabClosed
    this.isOnBattery = options.isOnBattery
  }

  async createTab(input: TabCreateInput = {}): Promise<TabState> {
    const id = crypto.randomUUID()
    const isIncognito = Boolean(input.incognito)
    const tabSession = await this.getSession(isIncognito)
    await this.onIncognitoTabCreated(isIncognito)
    const view = new BrowserView({
      webPreferences: {
        session: tabSession,
        preload: this.contentPreloadPath,
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false,
        backgroundThrottling: true,
        autoplayPolicy: 'no-user-gesture-required',
        disableBlinkFeatures: isIncognito ? 'ServiceWorker' : undefined
      }
    })
    const managedTab: ManagedTab = {
      id,
      view,
      state: {
        id,
        url: INTERNAL_NEW_TAB_URL,
        title: 'New Tab',
        favicon: null,
        isLoading: false,
        isIncognito,
        viewId: view.webContents.id,
        canGoBack: false,
        canGoForward: false,
        isPlayingMedia: false,
        isInternalPage: true
      }
    }

    this.tabs.set(id, managedTab)
    this.tabOrder.push(id)
    this.window.addBrowserView(view)
    this.bindTabEvents(managedTab)
    await view.webContents.loadURL('about:blank')
    await this.navigateToInput(managedTab, input.url?.trim() || INTERNAL_NEW_TAB_URL)

    if (this.activeTabId && this.activeTabId !== id) {
      this.previousTabId = this.activeTabId
    }

    this.activeTabId = id
    this.splitState = null
    this.applyLayout()
    this.emitState()
    return managedTab.state
  }

  async closeTab(tabId: string): Promise<void> {
    const tab = this.tabs.get(tabId)

    if (!tab) {
      return
    }

    this.tabs.delete(tabId)
    this.removeFromOrder(tabId)
    this.window.removeBrowserView(tab.view)
    tab.view.webContents.close({ waitForBeforeUnload: false })

    if (this.splitState && (this.splitState.leftTabId === tabId || this.splitState.rightTabId === tabId)) {
      const survivingTabId =
        this.splitState.leftTabId === tabId ? this.splitState.rightTabId : this.splitState.leftTabId

      this.splitState = null
      this.activeTabId = this.tabs.has(survivingTabId) ? survivingTabId : this.activeTabId
    }

    if (this.activeTabId === tabId) {
      this.activeTabId = this.pickFallbackTabId() ?? null
    }

    if (this.previousTabId === tabId) {
      this.previousTabId = this.activeTabId
    }

    await this.onIncognitoTabClosed(tab.state.isIncognito)

    if (this.tabOrder.length === 0) {
      await this.createTab()
      return
    }

    this.applyLayout()
    this.emitState()
  }

  async navigate(tabId: string, url: string): Promise<void> {
    const tab = this.getTabOrThrow(tabId)
    await this.navigateToInput(tab, url)
    this.applyLayout()
    this.emitState()
  }

  goBack(tabId: string): void {
    const tab = this.getTabOrThrow(tabId)

    if (tab.state.isInternalPage || !this.canGoBack(tab.view.webContents)) {
      return
    }

    this.goBackWithHistory(tab.view.webContents)
    this.updateNavigationFlags(tab)
    this.emitState()
  }

  goForward(tabId: string): void {
    const tab = this.getTabOrThrow(tabId)

    if (tab.state.isInternalPage || !this.canGoForward(tab.view.webContents)) {
      return
    }

    this.goForwardWithHistory(tab.view.webContents)
    this.updateNavigationFlags(tab)
    this.emitState()
  }

  reload(tabId: string): void {
    const tab = this.getTabOrThrow(tabId)

    if (tab.state.isInternalPage) {
      return
    }

    tab.view.webContents.reload()
    this.updateTabState(tabId, { isLoading: true })
    this.emitState()
  }

  activateTab(tabId: string): void {
    if (!this.tabs.has(tabId)) {
      return
    }

    if (this.activeTabId && this.activeTabId !== tabId) {
      this.previousTabId = this.activeTabId
    }

    this.activeTabId = tabId

    if (this.splitState && ![this.splitState.leftTabId, this.splitState.rightTabId].includes(tabId)) {
      this.splitState = null
    }

    this.applyLayout()
    this.emitState()
  }

  activateSplit(leftTabId: string, rightTabId: string): void {
    if (leftTabId === rightTabId || !this.tabs.has(leftTabId) || !this.tabs.has(rightTabId)) {
      return
    }

    this.splitState = {
      leftTabId,
      rightTabId,
      ratio: this.splitState?.ratio ?? 0.5
    }
    this.previousTabId = rightTabId
    this.activeTabId = this.activeTabId && [leftTabId, rightTabId].includes(this.activeTabId) ? this.activeTabId : leftTabId
    this.applyLayout()
    this.emitState()
  }

  deactivateSplit(): void {
    if (!this.splitState) {
      return
    }

    this.splitState = null
    this.applyLayout()
    this.emitState()
  }

  toggleSplit(): void {
    if (this.splitState) {
      this.deactivateSplit()
      return
    }

    if (!this.activeTabId || !this.previousTabId || this.activeTabId === this.previousTabId) {
      return
    }

    this.activateSplit(this.previousTabId, this.activeTabId)
  }

  resizeSplit(ratio: number): void {
    if (!this.splitState) {
      return
    }

    this.splitState = {
      ...this.splitState,
      ratio: Math.max(0.2, Math.min(0.8, ratio))
    }
    this.applyLayout()
    this.emitState()
  }

  updateChromeState(chromeState: ChromeState): void {
    this.chromeState = chromeState
    this.applyLayout()
    this.emitState()
  }

  applyPowerPolicy(): void {
    this.applyLayout()
    this.emitState()
  }

  getAllTabs(): TabState[] {
    return this.tabOrder
      .map((tabId) => this.tabs.get(tabId)?.state)
      .filter((tab): tab is TabState => Boolean(tab))
  }

  getSnapshot(): { activeTabId: string | null; previousTabId: string | null; split: SplitState | null } {
    return {
      activeTabId: this.activeTabId,
      previousTabId: this.previousTabId,
      split: this.splitState
    }
  }

  getLastBounds(): WindowBoundsPayload {
    return this.lastBounds
  }

  private bindTabEvents(tab: ManagedTab): void {
    const { webContents } = tab.view

    webContents.setWindowOpenHandler(({ url }) => {
      void this.createTab({ url, incognito: tab.state.isIncognito })
      return { action: 'deny' }
    })

    webContents.on('did-start-loading', () => {
      this.updateTabState(tab.id, { isLoading: true })
      this.emitState()
    })

    webContents.on('did-stop-loading', () => {
      this.updateNavigationFlags(tab)
      this.updateTabState(tab.id, {
        isLoading: false,
        url: webContents.getURL() || tab.state.url
      })
      this.recordVisit(tab)
      this.emitState()
    })

    webContents.on('did-navigate', (_event, url) => {
      this.updateTabState(tab.id, {
        url,
        isInternalPage: false
      })
      this.updateNavigationFlags(tab)
      this.emitState()
    })

    webContents.on('did-navigate-in-page', (_event, url) => {
      this.updateTabState(tab.id, {
        url,
        isInternalPage: false
      })
      this.recordVisit(tab)
      this.updateNavigationFlags(tab)
      this.emitState()
    })

    webContents.on('page-title-updated', (event, title) => {
      event.preventDefault()
      this.updateTabState(tab.id, {
        title: title.trim() || tab.state.title
      })
      this.recordVisit(tab)
      this.emitState()
    })

    webContents.on('page-favicon-updated', (_event, favicons) => {
      this.updateTabState(tab.id, {
        favicon: favicons[0] ?? null
      })
      this.recordVisit(tab)
      this.emitState()
    })

    webContents.on('media-started-playing', () => {
      this.updateTabState(tab.id, { isPlayingMedia: true })
      this.onMediaStateChanged(tab.id, true)
      this.emitState()
    })

    webContents.on('media-paused', () => {
      this.updateTabState(tab.id, { isPlayingMedia: false })
      this.onMediaStateChanged(tab.id, false)
      this.emitState()
    })
  }

  private async navigateToInput(tab: ManagedTab, url: string): Promise<void> {
    if (url === INTERNAL_NEW_TAB_URL) {
      this.updateTabState(tab.id, {
        url: INTERNAL_NEW_TAB_URL,
        title: 'New Tab',
        favicon: null,
        isInternalPage: true,
        isLoading: false,
        canGoBack: false,
        canGoForward: false
      })
      return
    }

    this.updateTabState(tab.id, {
      url,
      isInternalPage: false,
      isLoading: true
    })
    try {
      await tab.view.webContents.loadURL(url)
    } catch (error) {
      // Redirect chains and quick follow-up navigations surface as ERR_ABORTED in
      // Electron; the tab state is already updated by the navigation events.
      if (!this.isAbortedNavigation(error)) {
        throw error
      }
    }

    this.updateNavigationFlags(tab)
  }

  private updateTabState(tabId: string, partialState: Partial<TabState>): void {
    const tab = this.getTabOrThrow(tabId)
    tab.state = {
      ...tab.state,
      ...partialState
    }
  }

  private updateNavigationFlags(tab: ManagedTab): void {
    this.updateTabState(tab.id, {
      canGoBack: !tab.state.isInternalPage && this.canGoBack(tab.view.webContents),
      canGoForward: !tab.state.isInternalPage && this.canGoForward(tab.view.webContents)
    })
  }

  private canGoBack(webContents: WebContents): boolean {
    return webContents.navigationHistory.canGoBack()
  }

  private canGoForward(webContents: WebContents): boolean {
    return webContents.navigationHistory.canGoForward()
  }

  private goBackWithHistory(webContents: WebContents): void {
    webContents.navigationHistory.goBack()
  }

  private goForwardWithHistory(webContents: WebContents): void {
    webContents.navigationHistory.goForward()
  }

  private isAbortedNavigation(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false
    }

    return 'code' in error && error.code === 'ERR_ABORTED'
  }

  private recordVisit(tab: ManagedTab): void {
    if (tab.state.isInternalPage) {
      return
    }

    this.onVisit({
      url: tab.state.url,
      title: tab.state.title,
      favicon: tab.state.favicon,
      isIncognito: tab.state.isIncognito
    })
  }

  private getTabOrThrow(tabId: string): ManagedTab {
    const tab = this.tabs.get(tabId)

    if (!tab) {
      throw new Error(`Unknown tab ${tabId}`)
    }

    return tab
  }

  private emitState(): void {
    this.window.webContents.send('window:setBounds', this.lastBounds)
    this.onTabsChanged()
  }

  private applyLayout(): void {
    const bounds = this.calculateBounds()
    this.lastBounds = bounds
    const visibleTabIds = new Set<string>()

    for (const pane of bounds.panes) {
      const tab = this.tabs.get(pane.tabId)

      if (!tab) {
        continue
      }

      visibleTabIds.add(tab.id)

      if (tab.state.isInternalPage) {
        this.hideView(tab)
        continue
      }

      tab.view.setBounds(pane.content)
      tab.view.setBackgroundColor('#101114')
      const shouldThrottle = !this.isForegroundTab(tab.id)
      tab.view.webContents.setBackgroundThrottling(shouldThrottle)
    }

    for (const tabId of this.tabOrder) {
      if (visibleTabIds.has(tabId)) {
        continue
      }

      this.hideView(this.getTabOrThrow(tabId))
    }

    if (this.activeTabId) {
      const activeTab = this.tabs.get(this.activeTabId)

      if (activeTab && !activeTab.state.isInternalPage) {
        this.window.setTopBrowserView(activeTab.view)
        activeTab.view.webContents.focus()
      }
    }
  }

  private hideView(tab: ManagedTab): void {
    tab.view.setBounds({ x: -20_000, y: -20_000, width: 1, height: 1 })
    tab.view.setBackgroundColor('#00000000')
    tab.view.webContents.setBackgroundThrottling(true)
  }

  private isForegroundTab(tabId: string): boolean {
    if (this.splitState) {
      const isVisibleSplitPane =
        this.splitState.leftTabId === tabId || this.splitState.rightTabId === tabId
      return isVisibleSplitPane && (!this.isOnBattery() || this.activeTabId === tabId)
    }

    return this.activeTabId === tabId
  }

  private calculateBounds(): WindowBoundsPayload {
    const { width: rawWindowWidth, height: rawWindowHeight } = this.window.getContentBounds()
    const windowWidth = rawWindowWidth
    const windowHeight = rawWindowHeight
    const bookmarkBarHeight = this.chromeState.bookmarkBarVisible ? BOOKMARK_BAR_HEIGHT : 0
    const bookmarkManagerWidth = this.chromeState.bookmarkManagerVisible ? BOOKMARK_MANAGER_WIDTH : 0
    const suggestionsHeight = this.chromeState.omniboxHeight
    const splitHeaderHeight = this.splitState ? SPLIT_HEADER_HEIGHT : 0
    const splitTop = TAB_BAR_HEIGHT + TOOLBAR_HEIGHT + suggestionsHeight + bookmarkBarHeight
    const chromeHeight = splitTop + splitHeaderHeight
    const contentWidth = Math.max(0, windowWidth - bookmarkManagerWidth)
    const contentHeight = Math.max(0, windowHeight - chromeHeight)
    const payload: WindowBoundsPayload = {
      window: { x: 0, y: 0, width: windowWidth, height: windowHeight },
      chromeHeight,
      content: { x: 0, y: chromeHeight, width: contentWidth, height: contentHeight },
      bookmarkManagerWidth,
      divider: null,
      panes: []
    }

    if (this.splitState) {
      const splitRatio = Math.max(0.2, Math.min(0.8, this.splitState.ratio))
      const availableWidth = Math.max(0, contentWidth - DIVIDER_WIDTH)
      const leftWidth = Math.round(availableWidth * splitRatio)
      const rightWidth = availableWidth - leftWidth
      const headerHeight = SPLIT_HEADER_HEIGHT

      payload.divider = {
        x: leftWidth,
        y: splitTop,
        width: DIVIDER_WIDTH,
        height: Math.max(0, windowHeight - splitTop)
      }
      payload.panes = [
        {
          tabId: this.splitState.leftTabId,
          header: {
            x: 0,
            y: splitTop,
            width: leftWidth,
            height: headerHeight
          },
          content: {
            x: 0,
            y: chromeHeight,
            width: leftWidth,
            height: contentHeight
          }
        },
        {
          tabId: this.splitState.rightTabId,
          header: {
            x: leftWidth + DIVIDER_WIDTH,
            y: splitTop,
            width: rightWidth,
            height: headerHeight
          },
          content: {
            x: leftWidth + DIVIDER_WIDTH,
            y: chromeHeight,
            width: rightWidth,
            height: contentHeight
          }
        }
      ]

      return payload
    }

    if (this.activeTabId) {
      payload.panes = [
        {
          tabId: this.activeTabId,
          header: {
            x: 0,
            y: splitTop,
            width: contentWidth,
            height: 0
          },
          content: {
            x: 0,
            y: chromeHeight,
            width: contentWidth,
            height: contentHeight
          }
        }
      ]
    }

    return payload
  }

  private removeFromOrder(tabId: string): void {
    const index = this.tabOrder.indexOf(tabId)

    if (index >= 0) {
      this.tabOrder.splice(index, 1)
    }
  }

  private pickFallbackTabId(): string | undefined {
    if (!this.activeTabId) {
      return this.tabOrder.at(-1)
    }

    const currentIndex = this.tabOrder.indexOf(this.activeTabId)

    if (currentIndex === -1) {
      return this.tabOrder.at(-1)
    }

    return this.tabOrder[currentIndex] ?? this.tabOrder[currentIndex - 1]
  }
}
