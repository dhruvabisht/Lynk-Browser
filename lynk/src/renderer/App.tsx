import { useEffect, useMemo, useState } from 'react'

import type { BookmarkLeafNode, TabState } from '@shared/types'
import { AddressBar } from './components/AddressBar'
import { BookmarkBar } from './components/BookmarkBar'
import { SplitView } from './components/SplitView'
import { TabBar } from './components/TabBar'
import { VideoOverlay } from './components/VideoOverlay'
import { useBrowserStore } from './store/browser'
import { flattenBookmarks, normalizeOmniboxInput } from './utils'

export default function App(): JSX.Element {
  const {
    initialized,
    snapshot,
    bounds,
    bookmarks,
    pendingEditRequest,
    setPendingEditRequest,
    hydrate,
    createTab,
    closeTab,
    navigate,
    goBack,
    goForward,
    reload,
    activateTab,
    activateSplit,
    deactivateSplit,
    resizeSplit,
    updateChrome
  } = useBrowserStore()
  const [newTabQuery, setNewTabQuery] = useState('')

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  const activeTab = snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId)
  const leftSplitTab = snapshot.tabs.find((tab) => tab.id === snapshot.split?.leftTabId)
  const rightSplitTab = snapshot.tabs.find((tab) => tab.id === snapshot.split?.rightTabId)
  const splitTabIds = snapshot.split ? [snapshot.split.leftTabId, snapshot.split.rightTabId] : []
  const flatBookmarks = useMemo(() => flattenBookmarks(bookmarks), [bookmarks])
  const activeBookmark = activeTab ? flatBookmarks.find((bookmark) => bookmark.url === activeTab.url) : undefined
  const chromeIsIncognito = activeTab?.isIncognito ?? leftSplitTab?.isIncognito ?? false

  const navigateCurrent = async (value: string): Promise<void> => {
    if (activeTab) {
      await navigate(activeTab.id, value)
      return
    }

    await createTab({ url: value })
  }

  const handleOpenBookmark = async (url: string, newTab = false): Promise<void> => {
    if (newTab || !activeTab) {
      await createTab({ url })
      return
    }

    await navigate(activeTab.id, url)
  }

  const handleToggleBookmark = async (): Promise<void> => {
    if (!activeTab || activeTab.isInternalPage) {
      return
    }

    if (activeBookmark) {
      await window.lynk.bookmarks.remove({ id: activeBookmark.id })
      return
    }

    await window.lynk.bookmarks.add({
      url: activeTab.url,
      title: activeTab.title,
      favicon: activeTab.favicon ?? undefined
    })
  }

  const handleTabDragEnd = async (tabId: string, point: { x: number; y: number }): Promise<void> => {
    const withinContentArea =
      point.x >= bounds.content.x &&
      point.x <= bounds.content.x + bounds.content.width &&
      point.y >= bounds.content.y &&
      point.y <= bounds.content.y + bounds.content.height

    if (!withinContentArea) {
      return
    }

    const dropOnLeft = point.x < bounds.content.x + bounds.content.width / 2
    const counterpart = snapshot.split
      ? dropOnLeft
        ? snapshot.split.rightTabId
        : snapshot.split.leftTabId
      : snapshot.activeTabId && snapshot.activeTabId !== tabId
        ? snapshot.activeTabId
        : snapshot.previousTabId

    if (!counterpart || counterpart === tabId) {
      return
    }

    await activateSplit(dropOnLeft ? tabId : counterpart, dropOnLeft ? counterpart : tabId)
  }

  const handleSuggestionHeightChange = (height: number): void => {
    if (height !== snapshot.chrome.omniboxHeight) {
      void updateChrome({ omniboxHeight: height })
    }
  }

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0c12] text-slate-200">
        <div className="rounded-[28px] border border-white/10 bg-white/5 px-6 py-5 shadow-[0_20px_80px_rgba(0,0,0,0.42)]">
          Initializing Lynk…
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-screen overflow-hidden bg-[#090b12] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(90,138,255,0.16),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(34,211,238,0.14),_transparent_28%)]" />

      <header
        className={`absolute inset-x-0 top-0 z-10 overflow-visible border-b border-white/8 backdrop-blur-2xl ${
          chromeIsIncognito ? 'bg-[#2D1B5E]/92' : 'bg-[#1C1C1E]/86'
        }`}
        style={{ height: bounds.chromeHeight }}
      >
        <TabBar
          tabs={snapshot.tabs}
          activeTabId={snapshot.activeTabId}
          splitTabIds={splitTabIds}
          onActivate={(tabId) => void activateTab(tabId)}
          onClose={(tabId) => void closeTab(tabId)}
          onCreate={(incognito) => void createTab({ incognito })}
          onDragEnd={(tabId, point) => {
            void handleTabDragEnd(tabId, point)
          }}
        />

        <div className="px-3 py-1.5">
          <AddressBar
            tab={activeTab}
            isBookmarked={Boolean(activeBookmark)}
            extensionsCount={snapshot.extensions.length}
            showIncognitoBadge={Boolean(activeTab?.isIncognito)}
            onSubmit={(value) => {
              void navigateCurrent(value)
            }}
            onBack={activeTab ? () => void goBack(activeTab.id) : undefined}
            onForward={activeTab ? () => void goForward(activeTab.id) : undefined}
            onReload={activeTab ? () => void reload(activeTab.id) : undefined}
            onToggleBookmark={() => {
              void handleToggleBookmark()
            }}
            onSuggestionsHeightChange={handleSuggestionHeightChange}
          />
        </div>

        {snapshot.chrome.omniboxHeight > 0 ? <div style={{ height: snapshot.chrome.omniboxHeight }} /> : null}
      </header>

      <BookmarkBar
        visible={snapshot.chrome.bookmarkBarVisible}
        managerOpen={snapshot.chrome.bookmarkManagerVisible}
        bookmarks={bookmarks}
        activeUrl={activeTab?.url}
        barTop={80 + snapshot.chrome.omniboxHeight}
        bounds={bounds}
        pendingEditRequest={pendingEditRequest}
        onOpenBookmark={(url, newTab) => {
          void handleOpenBookmark(url, newTab)
        }}
        onRemoveBookmark={(id) => window.lynk.bookmarks.remove({ id })}
        onUpdateBookmark={async (bookmark, updates) => {
          await window.lynk.bookmarks.update({
            id: bookmark.id,
            title: updates.title,
            url: normalizeOmniboxInput(updates.url),
            favicon: bookmark.favicon,
            folderId: bookmark.folderId
          })
        }}
        onCreateFolder={async (name, parentId) => {
          await window.lynk.bookmarks.createFolder({ name, parentId })
        }}
        onUpdateFolder={async (id, name, parentId) => {
          await window.lynk.bookmarks.updateFolder({ id, name, parentId })
        }}
        onMoveNode={async (nodeId, nodeType, targetFolderId, index) => {
          await window.lynk.bookmarks.move({
            nodeId,
            nodeType,
            targetFolderId,
            index
          })
        }}
        onImportChrome={() => window.lynk.bookmarks.importFromChrome()}
        onToggleManager={(visible) => {
          void updateChrome({ bookmarkManagerVisible: visible })
        }}
        onClearPendingEdit={() => setPendingEditRequest(null)}
      />

      {snapshot.split ? (
        <SplitView
          split={snapshot.split}
          bounds={bounds}
          leftTab={leftSplitTab}
          rightTab={rightSplitTab}
          onNavigate={(tabId, value) => {
            void navigate(tabId, value)
          }}
          onActivateTab={(tabId) => {
            void activateTab(tabId)
          }}
          onResize={(ratio) => {
            void resizeSplit(ratio)
          }}
          onDeactivate={() => {
            void deactivateSplit()
          }}
        />
      ) : null}

      {bounds.panes.map((pane) => {
        const tab = snapshot.tabs.find((item) => item.id === pane.tabId)

        if (!tab?.isInternalPage) {
          return null
        }

        return (
          <InternalNewTabPane
            key={tab.id}
            tab={tab}
            bounds={pane.content}
            bookmarks={flatBookmarks.slice(0, 8)}
            recentSites={snapshot.recentlyVisited}
            query={newTabQuery}
            onQueryChange={setNewTabQuery}
            onSearch={() => {
              void navigate(tab.id, normalizeOmniboxInput(newTabQuery))
            }}
            onOpen={(url, newTab) => {
              void handleOpenBookmark(url, newTab)
            }}
          />
        )
      })}

      {snapshot.incognitoAudit.activeTabCount === 0 && !snapshot.incognitoAudit.clean ? (
        <div className="absolute bottom-4 left-4 z-30 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-100 shadow-[0_20px_60px_rgba(0,0,0,0.36)]">
          Incognito storage audit detected unexpected writes:
          <div className="mt-2 max-w-[480px] text-rose-200">{snapshot.incognitoAudit.unexpectedWrites.join(', ')}</div>
        </div>
      ) : null}
    </div>
  )
}

function InternalNewTabPane({
  tab,
  bounds,
  bookmarks,
  recentSites,
  query,
  onQueryChange,
  onSearch,
  onOpen
}: {
  tab: TabState
  bounds: { x: number; y: number; width: number; height: number }
  bookmarks: BookmarkLeafNode[]
  recentSites: Array<{ url: string; title: string; favicon: string | null }>
  query: string
  onQueryChange: (value: string) => void
  onSearch: () => void
  onOpen: (url: string, newTab?: boolean) => void
}): JSX.Element {
  return (
    <section
      className="absolute overflow-auto px-8 py-10"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height
      }}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <div className={`rounded-[36px] border p-8 shadow-[0_28px_100px_rgba(0,0,0,0.36)] backdrop-blur-2xl ${
          tab.isIncognito ? 'border-violet-300/16 bg-[#1a1234]/92' : 'border-white/10 bg-white/6'
        }`}>
          <p className="text-[12px] font-semibold uppercase tracking-[0.32em] text-cyan-300">Lynk</p>
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-semibold tracking-tight text-white">Search, split, and browse without wasted motion.</h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300">
                Google search is built in, bookmarks stay one shortcut away, and incognito tabs keep their own isolated in-memory
                session.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpen('https://www.google.com', true)}
              className="rounded-full border border-white/10 bg-white/8 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/14"
            >
              Open Google in New Tab
            </button>
          </div>

          <form
            className="mt-8 flex items-center gap-3 rounded-[26px] border border-white/10 bg-[#0b0f17]/78 p-3"
            onSubmit={(event) => {
              event.preventDefault()
              onSearch()
            }}
          >
            <svg className="ml-2 h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search with Google or jump to a domain"
              className="h-12 min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-slate-500"
            />
            <button
              type="submit"
              className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Search
            </button>
          </form>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Favorites</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Bookmarks at a glance</h2>
              </div>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {bookmarks.length > 0 ? (
                bookmarks.map((bookmark) => (
                  <button
                    key={bookmark.id}
                    type="button"
                    onClick={() => onOpen(bookmark.url, false)}
                    className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-[#0c1018]/70 px-4 py-3 text-left transition hover:bg-[#121824]"
                  >
                    {bookmark.favicon ? (
                      <img src={bookmark.favicon} alt="" className="h-5 w-5 rounded-full" />
                    ) : (
                      <svg className="h-5 w-5 text-amber-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M7 4h10v16l-5-3-5 3V4Z" />
                      </svg>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{bookmark.title}</span>
                  </button>
                ))
              ) : (
                <p className="text-sm text-slate-400">Save a few pages from the star button to populate your bookmark bar and manager.</p>
              )}
            </div>
          </div>

          <div className="grid gap-6">
            <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Recent</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Recently visited</h2>
              <div className="mt-5 space-y-2">
                {recentSites.length > 0 ? (
                  recentSites.map((site) => (
                    <button
                      key={site.url}
                      type="button"
                      onClick={() => onOpen(site.url, false)}
                      className="flex w-full items-center gap-3 rounded-[20px] border border-white/8 bg-[#0c1018]/70 px-4 py-3 text-left transition hover:bg-[#121824]"
                    >
                      {site.favicon ? (
                        <img src={site.favicon} alt="" className="h-5 w-5 rounded-full" />
                      ) : (
                        <svg className="h-5 w-5 text-cyan-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-white">{site.title}</span>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">Non-incognito browsing history appears here once you start navigating.</p>
                )}
              </div>
            </div>

            <VideoOverlay />
          </div>
        </div>
      </div>
    </section>
  )
}
