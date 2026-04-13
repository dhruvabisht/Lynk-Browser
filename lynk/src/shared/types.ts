export type BookmarkNodeType = 'bookmark' | 'folder'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface TabState {
  id: string
  url: string
  title: string
  favicon: string | null
  isLoading: boolean
  isIncognito: boolean
  viewId: number
  canGoBack: boolean
  canGoForward: boolean
  isPlayingMedia: boolean
  isInternalPage: boolean
}

export interface SplitState {
  leftTabId: string
  rightTabId: string
  ratio: number
}

export interface Bookmark {
  id: number
  url: string
  title: string
  favicon: string | null
  folderId: number | null
  createdAt: number
  sortOrder: number
}

export interface Folder {
  id: number
  name: string
  parentId: number | null
  sortOrder: number
}

export interface BookmarkLeafNode extends Bookmark {
  type: 'bookmark'
}

export interface BookmarkFolderNode extends Folder {
  type: 'folder'
  children: BookmarkNode[]
}

export type BookmarkNode = BookmarkLeafNode | BookmarkFolderNode

export interface RecentSite {
  url: string
  title: string
  favicon: string | null
  visitedAt: number
}

export interface ExtensionSummary {
  id: string
  name: string
  version: string
  enabled: boolean
}

export interface IncognitoAuditState {
  activeTabCount: number
  clean: boolean
  unexpectedWrites: string[]
}

export interface ChromeState {
  bookmarkBarVisible: boolean
  bookmarkManagerVisible: boolean
  omniboxHeight: number
}

export interface PaneBounds {
  tabId: string
  header: Rect
  content: Rect
}

export interface WindowBoundsPayload {
  window: Rect
  chromeHeight: number
  content: Rect
  bookmarkManagerWidth: number
  divider: Rect | null
  panes: PaneBounds[]
}

export interface BrowserStateSnapshot {
  tabs: TabState[]
  activeTabId: string | null
  previousTabId: string | null
  split: SplitState | null
  chrome: ChromeState
  recentlyVisited: RecentSite[]
  extensions: ExtensionSummary[]
  incognitoAudit: IncognitoAuditState
}

export interface TabCreateInput {
  url?: string
  incognito?: boolean
}

export interface TabCloseInput {
  tabId: string
}

export interface TabNavigateInput {
  tabId: string
  url: string
}

export interface TabActivateInput {
  tabId: string
}

export interface SplitActivateInput {
  leftTabId: string
  rightTabId: string
}

export interface SplitResizeInput {
  ratio: number
}

export interface BookmarkAddInput {
  url: string
  title: string
  favicon?: string
  folderId?: number
}

export interface BookmarkRemoveInput {
  id: number
}

export interface BookmarkUpdateInput {
  id: number
  title: string
  url: string
  favicon?: string | null
  folderId?: number | null
}

export interface FolderCreateInput {
  name: string
  parentId?: number | null
}

export interface FolderUpdateInput {
  id: number
  name: string
  parentId?: number | null
}

export interface BookmarkMoveInput {
  nodeId: number
  nodeType: BookmarkNodeType
  targetFolderId: number | null
  index: number
}

export interface SearchSuggestInput {
  query: string
}

export interface ChromeUpdateInput {
  bookmarkBarVisible?: boolean
  bookmarkManagerVisible?: boolean
  omniboxHeight?: number
}

export interface InvokeRequestMap {
  'browser:getState': void
  'tab:create': TabCreateInput
  'tab:close': TabCloseInput
  'tab:navigate': TabNavigateInput
  'tab:goBack': TabCloseInput
  'tab:goForward': TabCloseInput
  'tab:reload': TabCloseInput
  'tab:activate': TabActivateInput
  'tab:getAll': void
  'split:activate': SplitActivateInput
  'split:deactivate': void
  'split:resize': SplitResizeInput
  'split:toggle': void
  'bookmark:add': BookmarkAddInput
  'bookmark:remove': BookmarkRemoveInput
  'bookmark:getAll': void
  'bookmark:import': void
  'bookmark:update': BookmarkUpdateInput
  'bookmark:createFolder': FolderCreateInput
  'bookmark:updateFolder': FolderUpdateInput
  'bookmark:move': BookmarkMoveInput
  'search:suggest': SearchSuggestInput
  'chrome:update': ChromeUpdateInput
}

export interface InvokeResponseMap {
  'browser:getState': BrowserStateSnapshot
  'tab:create': TabState
  'tab:close': void
  'tab:navigate': void
  'tab:goBack': void
  'tab:goForward': void
  'tab:reload': void
  'tab:activate': void
  'tab:getAll': TabState[]
  'split:activate': void
  'split:deactivate': void
  'split:resize': void
  'split:toggle': void
  'bookmark:add': Bookmark
  'bookmark:remove': void
  'bookmark:getAll': BookmarkNode[]
  'bookmark:import': void
  'bookmark:update': Bookmark
  'bookmark:createFolder': BookmarkFolderNode
  'bookmark:updateFolder': BookmarkFolderNode
  'bookmark:move': void
  'search:suggest': string[]
  'chrome:update': BrowserStateSnapshot
}

export interface EventPayloadMap {
  'browser:state': BrowserStateSnapshot
  'bookmarks:changed': BookmarkNode[]
  'window:setBounds': WindowBoundsPayload
  'bookmark:edit-request': { nodeId: number; nodeType: BookmarkNodeType }
}

export type InvokeChannel = keyof InvokeRequestMap
export type EventChannel = keyof EventPayloadMap

export type EventUnsubscribe = () => void

export interface LynkApi {
  browser: {
    getState: () => Promise<BrowserStateSnapshot>
    onState: (listener: (state: BrowserStateSnapshot) => void) => EventUnsubscribe
    onBounds: (listener: (bounds: WindowBoundsPayload) => void) => EventUnsubscribe
  }
  tabs: {
    create: (input?: TabCreateInput) => Promise<TabState>
    close: (input: TabCloseInput) => Promise<void>
    navigate: (input: TabNavigateInput) => Promise<void>
    goBack: (input: TabCloseInput) => Promise<void>
    goForward: (input: TabCloseInput) => Promise<void>
    reload: (input: TabCloseInput) => Promise<void>
    activate: (input: TabActivateInput) => Promise<void>
    getAll: () => Promise<TabState[]>
  }
  split: {
    activate: (input: SplitActivateInput) => Promise<void>
    deactivate: () => Promise<void>
    resize: (input: SplitResizeInput) => Promise<void>
    toggle: () => Promise<void>
  }
  bookmarks: {
    add: (input: BookmarkAddInput) => Promise<Bookmark>
    remove: (input: BookmarkRemoveInput) => Promise<void>
    getAll: () => Promise<BookmarkNode[]>
    importFromChrome: () => Promise<void>
    update: (input: BookmarkUpdateInput) => Promise<Bookmark>
    createFolder: (input: FolderCreateInput) => Promise<BookmarkFolderNode>
    updateFolder: (input: FolderUpdateInput) => Promise<BookmarkFolderNode>
    move: (input: BookmarkMoveInput) => Promise<void>
    onChanged: (listener: (nodes: BookmarkNode[]) => void) => EventUnsubscribe
    onEditRequest: (
      listener: (payload: { nodeId: number; nodeType: BookmarkNodeType }) => void
    ) => EventUnsubscribe
  }
  search: {
    suggest: (input: SearchSuggestInput) => Promise<string[]>
  }
  chrome: {
    update: (input: ChromeUpdateInput) => Promise<BrowserStateSnapshot>
  }
}
