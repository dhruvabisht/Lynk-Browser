import { useRef } from 'react'

import type { TabState } from '@shared/types'

interface TabBarProps {
  tabs: TabState[]
  activeTabId: string | null
  splitTabIds: string[]
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
  onCreate: (incognito?: boolean) => void
  onDragEnd: (tabId: string, point: { x: number; y: number }) => void
}

export function TabBar({
  tabs,
  activeTabId,
  splitTabIds,
  onActivate,
  onClose,
  onCreate,
  onDragEnd
}: TabBarProps): JSX.Element {
  const dragPoint = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  return (
    <div className="flex h-9 items-center gap-2 border-b border-white/8 px-3">
      <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const isSplitVisible = splitTabIds.includes(tab.id)

          return (
            <button
              key={tab.id}
              type="button"
              draggable
              onClick={() => onActivate(tab.id)}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault()
                  onClose(tab.id)
                }
              }}
              onDrag={(event) => {
                dragPoint.current = {
                  x: event.clientX,
                  y: event.clientY
                }
              }}
              onDragEnd={() => onDragEnd(tab.id, dragPoint.current)}
              className={`group relative flex h-8 w-[180px] min-w-[180px] items-center gap-2 rounded-full border px-3 text-left transition ${
                isActive
                  ? 'border-white/30 bg-white text-slate-900 shadow-[0_8px_32px_rgba(255,255,255,0.16)]'
                  : isSplitVisible
                    ? 'border-cyan-400/30 bg-cyan-400/10 text-white'
                    : 'border-transparent bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800">
                {tab.isLoading ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
                ) : tab.favicon ? (
                  <img src={tab.favicon} alt="" className="h-4 w-4" />
                ) : (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M6 5h12M4 12h16M7 19h10" />
                  </svg>
                )}
              </span>

              <span className="min-w-0 flex-1 truncate text-xs font-medium">
                {tab.title || (tab.isInternalPage ? 'New Tab' : tab.url)}
              </span>

              {tab.isIncognito ? <span className="h-2 w-2 rounded-full bg-violet-300" /> : null}

              <span
                role="button"
                tabIndex={-1}
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(tab.id)
                }}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-sm ${
                  isActive ? 'hover:bg-slate-900/10' : 'opacity-0 hover:bg-white/10 group-hover:opacity-100'
                }`}
              >
                ×
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onCreate(false)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-white/6 text-white transition hover:bg-white/12"
          title="New Tab"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => onCreate(true)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-violet-300/20 bg-violet-500/12 text-violet-100 transition hover:bg-violet-500/20"
          title="New Incognito Tab"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 4l6.5 3V12c0 4.2-2.6 7.9-6.5 9-3.9-1.1-6.5-4.8-6.5-9V7l6.5-3Z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
