import { app } from 'electron'
import Database from 'better-sqlite3'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type {
  Bookmark,
  BookmarkAddInput,
  BookmarkFolderNode,
  BookmarkLeafNode,
  BookmarkMoveInput,
  BookmarkNode,
  BookmarkNodeType,
  BookmarkUpdateInput,
  ChromeState,
  FolderCreateInput,
  FolderUpdateInput,
  RecentSite
} from '@shared/types'

interface BookmarkRow {
  id: number
  url: string
  title: string
  favicon: string | null
  folder_id: number | null
  created_at: number
  sort_order: number
}

interface FolderRow {
  id: number
  name: string
  parent_id: number | null
  sort_order: number
}

interface SettingRow {
  value: string
}

interface HistoryRow {
  url: string
  title: string
  favicon: string | null
  visited_at: number
}

interface SortableNode {
  id: number
  type: BookmarkNodeType
  sortOrder: number
}

interface ChromeBookmarksFile {
  roots?: Record<string, ChromeBookmarksFolder | undefined>
}

interface ChromeBookmarksFolder {
  name?: string
  type?: string
  url?: string
  children?: ChromeBookmarksFolder[]
}

const SETTING_KEYS = {
  bookmarkBarVisible: 'bookmarkBarVisible',
  bookmarkManagerVisible: 'bookmarkManagerVisible'
} as const

export class BookmarkStore {
  private readonly db: Database.Database

  constructor(databasePath = join(app.getPath('userData'), 'bookmarks.db')) {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.initialize()
  }

  getChromeState(): ChromeState {
    return {
      bookmarkBarVisible: this.getBooleanSetting(SETTING_KEYS.bookmarkBarVisible, true),
      bookmarkManagerVisible: this.getBooleanSetting(SETTING_KEYS.bookmarkManagerVisible, false),
      omniboxHeight: 0
    }
  }

  setChromeState(input: Partial<ChromeState>): ChromeState {
    if (typeof input.bookmarkBarVisible === 'boolean') {
      this.setSetting(SETTING_KEYS.bookmarkBarVisible, input.bookmarkBarVisible)
    }

    if (typeof input.bookmarkManagerVisible === 'boolean') {
      this.setSetting(SETTING_KEYS.bookmarkManagerVisible, input.bookmarkManagerVisible)
    }

    return {
      ...this.getChromeState(),
      omniboxHeight: input.omniboxHeight ?? 0
    }
  }

  addBookmark(input: BookmarkAddInput): Bookmark {
    const normalizedUrl = input.url.trim()
    const existing = this.findBookmarkByUrl(normalizedUrl)

    if (existing) {
      const updated = this.updateBookmark({
        id: existing.id,
        title: input.title,
        url: normalizedUrl,
        favicon: input.favicon ?? existing.favicon,
        folderId: input.folderId ?? existing.folderId
      })

      return updated
    }

    const sortOrder = this.getNextSortOrder(input.folderId ?? null)
    const result = this.db
      .prepare(
        `
          INSERT INTO bookmarks (url, title, favicon, folder_id, sort_order)
          VALUES (@url, @title, @favicon, @folderId, @sortOrder)
        `
      )
      .run({
        url: normalizedUrl,
        title: input.title.trim() || normalizedUrl,
        favicon: input.favicon ?? null,
        folderId: input.folderId ?? null,
        sortOrder
      })

    return this.getBookmark(result.lastInsertRowid as number)
  }

  removeBookmark(id: number): void {
    this.db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id)
  }

  updateBookmark(input: BookmarkUpdateInput): Bookmark {
    const current = this.getBookmark(input.id)
    const folderId = typeof input.folderId === 'undefined' ? current.folderId : input.folderId
    const sortOrder = folderId === current.folderId ? current.sortOrder : this.getNextSortOrder(folderId)

    this.db
      .prepare(
        `
          UPDATE bookmarks
          SET url = @url,
              title = @title,
              favicon = @favicon,
              folder_id = @folderId,
              sort_order = @sortOrder
          WHERE id = @id
        `
      )
      .run({
        id: input.id,
        url: input.url.trim(),
        title: input.title.trim() || input.url.trim(),
        favicon: typeof input.favicon === 'undefined' ? current.favicon : input.favicon,
        folderId,
        sortOrder
      })

    return this.getBookmark(input.id)
  }

  createFolder(input: FolderCreateInput): BookmarkFolderNode {
    const parentId = input.parentId ?? null
    const sortOrder = this.getNextSortOrder(parentId)
    const result = this.db
      .prepare(
        `
          INSERT INTO folders (name, parent_id, sort_order)
          VALUES (@name, @parentId, @sortOrder)
        `
      )
      .run({
        name: input.name.trim() || 'Untitled Folder',
        parentId,
        sortOrder
      })

    return this.getFolderNode(result.lastInsertRowid as number)
  }

  updateFolder(input: FolderUpdateInput): BookmarkFolderNode {
    const current = this.getFolderRow(input.id)
    const parentId = typeof input.parentId === 'undefined' ? current.parent_id : input.parentId

    if (parentId === input.id || this.isDescendantFolder(input.id, parentId ?? null)) {
      throw new Error('Folders cannot be moved inside themselves.')
    }

    const sortOrder = parentId === current.parent_id ? current.sort_order : this.getNextSortOrder(parentId)

    this.db
      .prepare(
        `
          UPDATE folders
          SET name = @name,
              parent_id = @parentId,
              sort_order = @sortOrder
          WHERE id = @id
        `
      )
      .run({
        id: input.id,
        name: input.name.trim() || current.name,
        parentId,
        sortOrder
      })

    return this.getFolderNode(input.id)
  }

  moveNode(input: BookmarkMoveInput): void {
    const transaction = this.db.transaction(() => {
      const currentParentId = this.getNodeParentId(input.nodeType, input.nodeId)

      if (input.nodeType === 'folder' && this.isDescendantFolder(input.nodeId, input.targetFolderId)) {
        throw new Error('Folders cannot be nested inside their descendants.')
      }

      this.setNodeParent(input.nodeType, input.nodeId, input.targetFolderId)

      const targetSiblings = this.getSiblingEntries(input.targetFolderId, {
        nodeType: input.nodeType,
        nodeId: input.nodeId
      })

      const insertAt = Math.max(0, Math.min(input.index, targetSiblings.length))
      targetSiblings.splice(insertAt, 0, {
        id: input.nodeId,
        type: input.nodeType,
        sortOrder: insertAt
      })
      this.reassignSortOrders(targetSiblings)

      if (currentParentId !== input.targetFolderId) {
        const previousSiblings = this.getSiblingEntries(currentParentId, {
          nodeType: input.nodeType,
          nodeId: input.nodeId
        })
        this.reassignSortOrders(previousSiblings)
      }
    })

    transaction()
  }

  getAll(): BookmarkNode[] {
    const folders = this.db
      .prepare<unknown[], FolderRow>('SELECT id, name, parent_id, sort_order FROM folders ORDER BY sort_order, name')
      .all()
    const bookmarks = this.db
      .prepare<unknown[], BookmarkRow>(
        `
          SELECT id, url, title, favicon, folder_id, created_at, sort_order
          FROM bookmarks
          ORDER BY sort_order, title
        `
      )
      .all()

    const folderNodes = new Map<number, BookmarkFolderNode>()

    for (const folder of folders) {
      folderNodes.set(folder.id, {
        type: 'folder',
        id: folder.id,
        name: folder.name,
        parentId: folder.parent_id,
        sortOrder: folder.sort_order,
        children: []
      })
    }

    const rootNodes: BookmarkNode[] = []

    for (const folder of folders) {
      const node = folderNodes.get(folder.id)

      if (!node) {
        continue
      }

      if (folder.parent_id === null) {
        rootNodes.push(node)
      } else {
        folderNodes.get(folder.parent_id)?.children.push(node)
      }
    }

    for (const bookmark of bookmarks) {
      const node = this.toBookmarkNode(bookmark)

      if (bookmark.folder_id === null) {
        rootNodes.push(node)
      } else {
        folderNodes.get(bookmark.folder_id)?.children.push(node)
      }
    }

    const sortNodes = (nodes: BookmarkNode[]): BookmarkNode[] =>
      nodes
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((node) =>
          node.type === 'folder'
            ? {
                ...node,
                children: sortNodes(node.children)
              }
            : node
        )

    return sortNodes(rootNodes)
  }

  getRecentlyVisited(limit = 8): RecentSite[] {
    return this.db
      .prepare<unknown[], HistoryRow>(
        `
          SELECT url, title, favicon, visited_at
          FROM history
          ORDER BY visited_at DESC
          LIMIT ?
        `
      )
      .all(limit)
      .map((row: HistoryRow) => ({
        url: row.url,
        title: row.title,
        favicon: row.favicon,
        visitedAt: row.visited_at
      }))
  }

  recordVisit(input: { url: string; title: string; favicon?: string | null; isIncognito: boolean }): void {
    if (input.isIncognito || !/^https?:\/\//.test(input.url)) {
      return
    }

    const visitedAt = Date.now()
    this.db
      .prepare(
        `
          INSERT INTO history (url, title, favicon, visited_at)
          VALUES (@url, @title, @favicon, @visitedAt)
          ON CONFLICT(url) DO UPDATE SET
            title = excluded.title,
            favicon = excluded.favicon,
            visited_at = excluded.visited_at
        `
      )
      .run({
        url: input.url,
        title: input.title.trim() || input.url,
        favicon: input.favicon ?? null,
        visitedAt
      })

    this.db
      .prepare(
        `
          DELETE FROM history
          WHERE url NOT IN (
            SELECT url
            FROM history
            ORDER BY visited_at DESC
            LIMIT 32
          )
        `
      )
      .run()
  }

  importFromChrome(): void {
    const chromePath = join(
      homedir(),
      'Library/Application Support/Google/Chrome/Default/Bookmarks'
    )

    if (!existsSync(chromePath)) {
      throw new Error(`Chrome bookmark file not found at ${chromePath}`)
    }

    const raw = readFileSync(chromePath, 'utf8')
    const parsed = JSON.parse(raw) as ChromeBookmarksFile
    const importedRoot = this.createFolder({
      name: `Imported from Chrome ${new Date().toLocaleDateString('en-IE')}`,
      parentId: null
    })

    const importFolder = (children: ChromeBookmarksFolder[] | undefined, parentId: number): void => {
      for (const child of children ?? []) {
        if (child.type === 'url' && child.url) {
          this.addBookmark({
            url: child.url,
            title: child.name ?? child.url,
            folderId: parentId
          })
          continue
        }

        if (child.children?.length) {
          const folder = this.createFolder({
            name: child.name ?? 'Folder',
            parentId
          })
          importFolder(child.children, folder.id)
        }
      }
    }

    const groupedRoots = [
      ['Bookmarks Bar', parsed.roots?.bookmark_bar],
      ['Other Bookmarks', parsed.roots?.other],
      ['Synced', parsed.roots?.synced]
    ] as const

    for (const [label, root] of groupedRoots) {
      if (!root?.children?.length) {
        continue
      }

      const folder = this.createFolder({
        name: label,
        parentId: importedRoot.id
      })

      importFolder(root.children, folder.id)
    }
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        favicon TEXT,
        folder_id INTEGER REFERENCES folders(id),
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        parent_id INTEGER REFERENCES folders(id)
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS history (
        url TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        favicon TEXT,
        visited_at INTEGER NOT NULL
      );
    `)

    this.ensureColumn('bookmarks', 'sort_order', 'INTEGER NOT NULL DEFAULT 0')
    this.ensureColumn('folders', 'sort_order', 'INTEGER NOT NULL DEFAULT 0')
    this.setSetting(SETTING_KEYS.bookmarkBarVisible, this.getBooleanSetting(SETTING_KEYS.bookmarkBarVisible, true))
    this.setSetting(
      SETTING_KEYS.bookmarkManagerVisible,
      this.getBooleanSetting(SETTING_KEYS.bookmarkManagerVisible, false)
    )
  }

  private ensureColumn(tableName: 'bookmarks' | 'folders', columnName: string, definition: string): void {
    const columns = this.db
      .prepare<unknown[], { name: string }>(`PRAGMA table_info(${tableName})`)
      .all()

    if (columns.some((column: { name: string }) => column.name === columnName)) {
      return
    }

    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
  }

  private findBookmarkByUrl(url: string): Bookmark | null {
    const row = this.db
      .prepare<unknown[], BookmarkRow>(
        `
          SELECT id, url, title, favicon, folder_id, created_at, sort_order
          FROM bookmarks
          WHERE url = ?
          LIMIT 1
        `
      )
      .get(url)

    return row ? this.toBookmark(row) : null
  }

  private getBookmark(id: number): Bookmark {
    const row = this.db
      .prepare<unknown[], BookmarkRow>(
        `
          SELECT id, url, title, favicon, folder_id, created_at, sort_order
          FROM bookmarks
          WHERE id = ?
        `
      )
      .get(id)

    if (!row) {
      throw new Error(`Bookmark ${id} not found`)
    }

    return this.toBookmark(row)
  }

  private getFolderNode(id: number): BookmarkFolderNode {
    const folder = this.getFolderRow(id)

    return {
      type: 'folder',
      id: folder.id,
      name: folder.name,
      parentId: folder.parent_id,
      sortOrder: folder.sort_order,
      children: []
    }
  }

  private getFolderRow(id: number): FolderRow {
    const row = this.db
      .prepare<unknown[], FolderRow>(
        `
          SELECT id, name, parent_id, sort_order
          FROM folders
          WHERE id = ?
        `
      )
      .get(id)

    if (!row) {
      throw new Error(`Folder ${id} not found`)
    }

    return row
  }

  private toBookmark(row: BookmarkRow): Bookmark {
    return {
      id: row.id,
      url: row.url,
      title: row.title,
      favicon: row.favicon,
      folderId: row.folder_id,
      createdAt: row.created_at,
      sortOrder: row.sort_order
    }
  }

  private toBookmarkNode(row: BookmarkRow): BookmarkLeafNode {
    return {
      ...this.toBookmark(row),
      type: 'bookmark'
    }
  }

  private getBooleanSetting(key: string, fallback: boolean): boolean {
    const row = this.db.prepare<unknown[], SettingRow>('SELECT value FROM settings WHERE key = ?').get(key)

    if (!row) {
      return fallback
    }

    try {
      return Boolean(JSON.parse(row.value))
    } catch {
      return fallback
    }
  }

  private setSetting(key: string, value: unknown): void {
    this.db
      .prepare(
        `
          INSERT INTO settings (key, value)
          VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `
      )
      .run(key, JSON.stringify(value))
  }

  private getNextSortOrder(parentId: number | null): number {
    const folderMax = this.getMaxSortOrder('folders', 'parent_id', parentId)
    const bookmarkMax = this.getMaxSortOrder('bookmarks', 'folder_id', parentId)

    return Math.max(folderMax, bookmarkMax) + 1
  }

  private getMaxSortOrder(
    tableName: 'folders' | 'bookmarks',
    parentColumn: 'parent_id' | 'folder_id',
    parentId: number | null
  ): number {
    const row =
      parentId === null
        ? this.db
            .prepare<unknown[], { value: number | null }>(
              `SELECT MAX(sort_order) AS value FROM ${tableName} WHERE ${parentColumn} IS NULL`
            )
            .get()
        : this.db
            .prepare<unknown[], { value: number | null }>(
              `SELECT MAX(sort_order) AS value FROM ${tableName} WHERE ${parentColumn} = ?`
            )
            .get(parentId)

    return row?.value ?? -1
  }

  private getNodeParentId(nodeType: BookmarkNodeType, nodeId: number): number | null {
    if (nodeType === 'bookmark') {
      const row = this.db
        .prepare<unknown[], { folder_id: number | null }>('SELECT folder_id FROM bookmarks WHERE id = ?')
        .get(nodeId)

      if (!row) {
        throw new Error(`Bookmark ${nodeId} not found`)
      }

      return row.folder_id
    }

    return this.getFolderRow(nodeId).parent_id
  }

  private setNodeParent(nodeType: BookmarkNodeType, nodeId: number, targetFolderId: number | null): void {
    if (nodeType === 'bookmark') {
      this.db.prepare('UPDATE bookmarks SET folder_id = ? WHERE id = ?').run(targetFolderId, nodeId)
      return
    }

    this.db.prepare('UPDATE folders SET parent_id = ? WHERE id = ?').run(targetFolderId, nodeId)
  }

  private getSiblingEntries(
    parentId: number | null,
    exclude?: { nodeType: BookmarkNodeType; nodeId: number }
  ): SortableNode[] {
    const folders =
      parentId === null
        ? this.db
            .prepare<unknown[], FolderRow>(
              'SELECT id, name, parent_id, sort_order FROM folders WHERE parent_id IS NULL ORDER BY sort_order'
            )
            .all()
        : this.db
            .prepare<unknown[], FolderRow>(
              'SELECT id, name, parent_id, sort_order FROM folders WHERE parent_id = ? ORDER BY sort_order'
            )
            .all(parentId)

    const bookmarks =
      parentId === null
        ? this.db
            .prepare<unknown[], BookmarkRow>(
              `
                SELECT id, url, title, favicon, folder_id, created_at, sort_order
                FROM bookmarks
                WHERE folder_id IS NULL
                ORDER BY sort_order
              `
            )
            .all()
        : this.db
            .prepare<unknown[], BookmarkRow>(
              `
                SELECT id, url, title, favicon, folder_id, created_at, sort_order
                FROM bookmarks
                WHERE folder_id = ?
                ORDER BY sort_order
              `
            )
            .all(parentId)

    return [...folders.map<SortableNode>((folder: FolderRow) => ({
      id: folder.id,
      type: 'folder',
      sortOrder: folder.sort_order
    })), ...bookmarks.map<SortableNode>((bookmark: BookmarkRow) => ({
      id: bookmark.id,
      type: 'bookmark',
      sortOrder: bookmark.sort_order
    }))]
      .filter((node) => !(exclude && node.id === exclude.nodeId && node.type === exclude.nodeType))
      .sort((left, right) => left.sortOrder - right.sortOrder)
  }

  private reassignSortOrders(nodes: SortableNode[]): void {
    const folderStatement = this.db.prepare('UPDATE folders SET sort_order = ? WHERE id = ?')
    const bookmarkStatement = this.db.prepare('UPDATE bookmarks SET sort_order = ? WHERE id = ?')

    nodes.forEach((node, index) => {
      if (node.type === 'folder') {
        folderStatement.run(index, node.id)
        return
      }

      bookmarkStatement.run(index, node.id)
    })
  }

  private isDescendantFolder(folderId: number, candidateParentId: number | null): boolean {
    if (candidateParentId === null) {
      return false
    }

    let currentParentId: number | null = candidateParentId

    while (currentParentId !== null) {
      if (currentParentId === folderId) {
        return true
      }

      currentParentId = this.getFolderRow(currentParentId).parent_id
    }

    return false
  }
}
