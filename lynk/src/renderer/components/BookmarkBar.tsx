import { useEffect, useMemo, useState } from 'react'

import type { BookmarkLeafNode, BookmarkNode, BookmarkNodeType, WindowBoundsPayload } from '@shared/types'

interface BookmarkBarProps {
  visible: boolean
  managerOpen: boolean
  bookmarks: BookmarkNode[]
  activeUrl?: string
  barTop: number
  bounds: WindowBoundsPayload
  pendingEditRequest: { nodeId: number; nodeType: BookmarkNodeType } | null
  onOpenBookmark: (url: string, newTab?: boolean) => void
  onRemoveBookmark: (id: number) => Promise<void>
  onUpdateBookmark: (bookmark: BookmarkLeafNode, updates: { title: string; url: string }) => Promise<void>
  onCreateFolder: (name: string, parentId?: number | null) => Promise<void>
  onUpdateFolder: (id: number, name: string, parentId?: number | null) => Promise<void>
  onMoveNode: (nodeId: number, nodeType: BookmarkNodeType, targetFolderId: number | null, index: number) => Promise<void>
  onImportChrome: () => Promise<void>
  onToggleManager: (visible: boolean) => void
  onClearPendingEdit: () => void
}

interface EditingState {
  nodeId: number
  nodeType: BookmarkNodeType
}

interface ContextMenuState {
  x: number
  y: number
  node: BookmarkLeafNode
}

export function BookmarkBar({
  visible,
  managerOpen,
  bookmarks,
  activeUrl,
  barTop,
  bounds,
  pendingEditRequest,
  onOpenBookmark,
  onRemoveBookmark,
  onUpdateBookmark,
  onCreateFolder,
  onUpdateFolder,
  onMoveNode,
  onImportChrome,
  onToggleManager,
  onClearPendingEdit
}: BookmarkBarProps): JSX.Element {
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftUrl, setDraftUrl] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  useEffect(() => {
    if (!pendingEditRequest) {
      return
    }

    const targetNode = findNode(bookmarks, pendingEditRequest.nodeId, pendingEditRequest.nodeType)

    if (!targetNode) {
      onClearPendingEdit()
      return
    }

    setEditing({
      nodeId: targetNode.id,
      nodeType: targetNode.type
    })
    setDraftTitle(targetNode.type === 'bookmark' ? targetNode.title : targetNode.name)
    setDraftUrl(targetNode.type === 'bookmark' ? targetNode.url : '')
    onToggleManager(true)
    onClearPendingEdit()
  }, [bookmarks, onClearPendingEdit, onToggleManager, pendingEditRequest])

  const rootNodes = useMemo(() => bookmarks, [bookmarks])
  const editingNode = editing ? findNode(bookmarks, editing.nodeId, editing.nodeType) : null

  return (
    <>
      {visible ? (
        <div
          className="absolute inset-x-0 z-20 flex h-9 items-center gap-2 overflow-x-auto border-b border-white/8 px-3"
          style={{ top: barTop }}
        >
          {rootNodes.map((node) =>
            node.type === 'bookmark' ? (
              <button
                key={`bookmark-${node.id}`}
                type="button"
                onClick={() => onOpenBookmark(node.url, false)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setContextMenu({
                    x: event.clientX,
                    y: event.clientY,
                    node
                  })
                }}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                  activeUrl === node.url
                    ? 'border-cyan-300/30 bg-cyan-400/12 text-cyan-100'
                    : 'border-white/10 bg-white/6 text-slate-200 hover:bg-white/10'
                }`}
              >
                {node.favicon ? <img src={node.favicon} alt="" className="h-4 w-4 rounded-full" /> : <BookmarkGlyph />}
                <span className="max-w-[160px] truncate">{node.title}</span>
              </button>
            ) : (
              <button
                key={`folder-${node.id}`}
                type="button"
                onClick={() => onToggleManager(true)}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
              >
                <FolderGlyph />
                <span className="max-w-[160px] truncate">{node.name}</span>
              </button>
            )
          )}
        </div>
      ) : null}

      {managerOpen ? (
        <aside
          className="absolute right-0 top-0 z-30 flex h-full flex-col border-l border-white/10 bg-[#0f1219]/96 shadow-[-32px_0_80px_rgba(0,0,0,0.42)] backdrop-blur-xl"
          style={{ width: bounds.bookmarkManagerWidth || 320 }}
        >
          <header className="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300">Bookmarks</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Manager</h2>
            </div>
            <button
              type="button"
              onClick={() => onToggleManager(false)}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              Close
            </button>
          </header>

          <div className="flex items-center gap-2 border-b border-white/8 px-5 py-3">
            <input
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="New folder name"
              className="h-10 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={async () => {
                if (!newFolderName.trim()) {
                  return
                }

                await onCreateFolder(newFolderName.trim(), null)
                setNewFolderName('')
              }}
              className="rounded-2xl border border-white/10 bg-white/8 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/12"
            >
              Add Folder
            </button>
            <button
              type="button"
              onClick={onImportChrome}
              className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/16"
            >
              Import Chrome
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <BookmarkTree
              nodes={rootNodes}
              parentId={null}
              level={0}
              onOpenBookmark={onOpenBookmark}
              onEdit={(nodeId, nodeType) => {
                const node = findNode(bookmarks, nodeId, nodeType)

                if (!node) {
                  return
                }

                setEditing({ nodeId, nodeType })
                setDraftTitle(node.type === 'bookmark' ? node.title : node.name)
                setDraftUrl(node.type === 'bookmark' ? node.url : '')
              }}
              onContextMenu={setContextMenu}
              onMoveNode={onMoveNode}
            />
          </div>

          <div className="border-t border-white/8 p-5">
            {editingNode ? (
              <form
                className="space-y-3"
                onSubmit={async (event) => {
                  event.preventDefault()

                  if (editingNode.type === 'bookmark') {
                    await onUpdateBookmark(editingNode, {
                      title: draftTitle,
                      url: draftUrl
                    })
                  } else {
                    await onUpdateFolder(editingNode.id, draftTitle)
                  }

                  setEditing(null)
                  setDraftTitle('')
                  setDraftUrl('')
                }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                  {editingNode.type === 'bookmark' ? 'Edit Bookmark' : 'Edit Folder'}
                </p>
                <input
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  placeholder={editingNode.type === 'bookmark' ? 'Bookmark title' : 'Folder name'}
                  className="h-11 w-full rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white outline-none placeholder:text-slate-500"
                />
                {editingNode.type === 'bookmark' ? (
                  <input
                    value={draftUrl}
                    onChange={(event) => setDraftUrl(event.target.value)}
                    placeholder="https://example.com"
                    className="h-11 w-full rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white outline-none placeholder:text-slate-500"
                  />
                ) : null}
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="rounded-2xl border border-emerald-400/20 bg-emerald-400/12 px-4 py-2.5 text-xs font-semibold text-emerald-100"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null)
                      setDraftTitle('')
                      setDraftUrl('')
                    }}
                    className="rounded-2xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-sm leading-6 text-slate-400">
                Select a bookmark or folder to edit it here. Drag items inside the tree to reorder siblings or nest them inside a
                folder.
              </p>
            )}
          </div>
        </aside>
      ) : null}

      {contextMenu ? (
        <div
          className="absolute z-40 min-w-[180px] overflow-hidden rounded-2xl border border-white/10 bg-[#0e1117]/96 p-1 shadow-[0_24px_60px_rgba(0,0,0,0.38)] backdrop-blur-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <ContextMenuButton
            onClick={() => {
              onOpenBookmark(contextMenu.node.url, false)
              setContextMenu(null)
            }}
          >
            Open
          </ContextMenuButton>
          <ContextMenuButton
            onClick={() => {
              onOpenBookmark(contextMenu.node.url, true)
              setContextMenu(null)
            }}
          >
            Open in New Tab
          </ContextMenuButton>
          <ContextMenuButton
            onClick={() => {
              setEditing({
                nodeId: contextMenu.node.id,
                nodeType: 'bookmark'
              })
              setDraftTitle(contextMenu.node.title)
              setDraftUrl(contextMenu.node.url)
              onToggleManager(true)
              setContextMenu(null)
            }}
          >
            Edit
          </ContextMenuButton>
          <ContextMenuButton
            destructive
            onClick={async () => {
              await onRemoveBookmark(contextMenu.node.id)
              setContextMenu(null)
            }}
          >
            Delete
          </ContextMenuButton>
        </div>
      ) : null}
    </>
  )
}

interface BookmarkTreeProps {
  nodes: BookmarkNode[]
  parentId: number | null
  level: number
  onOpenBookmark: (url: string, newTab?: boolean) => void
  onEdit: (nodeId: number, nodeType: BookmarkNodeType) => void
  onContextMenu: (state: ContextMenuState | null) => void
  onMoveNode: (nodeId: number, nodeType: BookmarkNodeType, targetFolderId: number | null, index: number) => Promise<void>
}

function BookmarkTree({
  nodes,
  parentId,
  level,
  onOpenBookmark,
  onEdit,
  onContextMenu,
  onMoveNode
}: BookmarkTreeProps): JSX.Element {
  return (
    <div className="space-y-1">
      {nodes.map((node, index) => (
        <div key={`${node.type}-${node.id}`}>
          <button
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(
                'application/x-lynk-bookmark',
                JSON.stringify({ nodeId: node.id, nodeType: node.type })
              )
            }}
            onDrop={async (event) => {
              event.preventDefault()
              const payload = event.dataTransfer.getData('application/x-lynk-bookmark')

              if (!payload) {
                return
              }

              const parsed = JSON.parse(payload) as { nodeId: number; nodeType: BookmarkNodeType }
              const { top, height } = event.currentTarget.getBoundingClientRect()
              const dropRatio = (event.clientY - top) / Math.max(1, height)

              if (node.type === 'folder' && dropRatio > 0.28 && dropRatio < 0.72) {
                await onMoveNode(parsed.nodeId, parsed.nodeType, node.id, node.children.length)
                return
              }

              const insertIndex = dropRatio < 0.5 ? index : index + 1
              await onMoveNode(parsed.nodeId, parsed.nodeType, parentId, insertIndex)
            }}
            onDragOver={(event) => event.preventDefault()}
            onClick={() => {
              if (node.type === 'bookmark') {
                onOpenBookmark(node.url, false)
              } else {
                onEdit(node.id, node.type)
              }
            }}
            onDoubleClick={() => onEdit(node.id, node.type)}
            onContextMenu={(event) => {
              if (node.type !== 'bookmark') {
                return
              }

              event.preventDefault()
              onContextMenu({
                x: event.clientX,
                y: event.clientY,
                node
              })
            }}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/7"
            style={{ paddingLeft: 12 + level * 16 }}
          >
            {node.type === 'bookmark' ? (
              node.favicon ? (
                <img src={node.favicon} alt="" className="h-4 w-4 rounded-full" />
              ) : (
                <BookmarkGlyph />
              )
            ) : (
              <FolderGlyph />
            )}
            <span className="min-w-0 flex-1 truncate">{node.type === 'bookmark' ? node.title : node.name}</span>
          </button>

          {node.type === 'folder' ? (
            <BookmarkTree
              nodes={node.children}
              parentId={node.id}
              level={level + 1}
              onOpenBookmark={onOpenBookmark}
              onEdit={onEdit}
              onContextMenu={onContextMenu}
              onMoveNode={onMoveNode}
            />
          ) : null}
        </div>
      ))}

      <div
        className="rounded-2xl border border-dashed border-white/10 px-3 py-2 text-xs text-slate-500"
        style={{ marginLeft: 12 + level * 16 }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={async (event) => {
          event.preventDefault()
          const payload = event.dataTransfer.getData('application/x-lynk-bookmark')

          if (!payload) {
            return
          }

          const parsed = JSON.parse(payload) as { nodeId: number; nodeType: BookmarkNodeType }
          await onMoveNode(parsed.nodeId, parsed.nodeType, parentId, nodes.length)
        }}
      >
        Drop here to move to the end
      </div>
    </div>
  )
}

function ContextMenuButton({
  children,
  destructive = false,
  onClick
}: {
  children: React.ReactNode
  destructive?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition ${
        destructive ? 'text-rose-300 hover:bg-rose-500/12' : 'text-slate-200 hover:bg-white/8'
      }`}
    >
      {children}
    </button>
  )
}

function findNode(nodes: BookmarkNode[], nodeId: number, nodeType: BookmarkNodeType): BookmarkNode | null {
  for (const node of nodes) {
    if (node.id === nodeId && node.type === nodeType) {
      return node
    }

    if (node.type === 'folder') {
      const childMatch = findNode(node.children, nodeId, nodeType)

      if (childMatch) {
        return childMatch
      }
    }
  }

  return null
}

function BookmarkGlyph(): JSX.Element {
  return (
    <svg className="h-4 w-4 shrink-0 text-amber-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 4h10v16l-5-3-5 3V4Z" />
    </svg>
  )
}

function FolderGlyph(): JSX.Element {
  return (
    <svg className="h-4 w-4 shrink-0 text-cyan-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  )
}
