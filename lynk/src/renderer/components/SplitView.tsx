import { useMemo } from 'react'

import type { SplitState, TabState, WindowBoundsPayload } from '@shared/types'
import { AddressBar } from './AddressBar'

interface SplitViewProps {
  split: SplitState
  bounds: WindowBoundsPayload
  leftTab?: TabState
  rightTab?: TabState
  onNavigate: (tabId: string, value: string) => void
  onActivateTab: (tabId: string) => void
  onResize: (ratio: number) => void
  onDeactivate: () => void
}

export function SplitView({
  split,
  bounds,
  leftTab,
  rightTab,
  onNavigate,
  onActivateTab,
  onResize,
  onDeactivate
}: SplitViewProps): JSX.Element | null {
  const panes = useMemo(() => {
    const leftPane = bounds.panes.find((pane) => pane.tabId === split.leftTabId)
    const rightPane = bounds.panes.find((pane) => pane.tabId === split.rightTabId)

    return { leftPane, rightPane }
  }, [bounds.panes, split.leftTabId, split.rightTabId])

  if (!panes.leftPane || !panes.rightPane || !bounds.divider) {
    return null
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {[{ pane: panes.leftPane, tab: leftTab }, { pane: panes.rightPane, tab: rightTab }].map(({ pane, tab }) =>
        tab ? (
          <div
            key={tab.id}
            style={{
              left: pane.header.x,
              top: pane.header.y,
              width: pane.header.width,
              height: pane.header.height
            }}
            className="pointer-events-auto absolute px-3 py-2"
          >
            <AddressBar
              compact
              tab={tab}
              showIncognitoBadge={tab.isIncognito}
              onFocus={() => onActivateTab(tab.id)}
              onSubmit={(value) => {
                onActivateTab(tab.id)
                onNavigate(tab.id, value)
              }}
            />
          </div>
        ) : null
      )}

      <div
        style={{
          left: bounds.divider.x,
          top: bounds.divider.y,
          width: bounds.divider.width,
          height: bounds.divider.height
        }}
        className="pointer-events-auto absolute flex items-center justify-center"
        onMouseDown={(event) => {
          event.preventDefault()

          const handleMove = (moveEvent: MouseEvent): void => {
            const contentWidth = Math.max(1, bounds.content.width - bounds.divider!.width)
            const ratio = (moveEvent.clientX - bounds.content.x) / contentWidth
            onResize(Math.max(0.2, Math.min(0.8, ratio)))
          }

          const handleUp = (): void => {
            window.removeEventListener('mousemove', handleMove)
            window.removeEventListener('mouseup', handleUp)
          }

          window.addEventListener('mousemove', handleMove)
          window.addEventListener('mouseup', handleUp)
        }}
      >
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex h-full w-1 rounded-full bg-white/12" />
          <button
            type="button"
            onClick={onDeactivate}
            className="absolute top-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-[#121620]/95 text-white shadow-[0_16px_40px_rgba(0,0,0,0.35)] transition hover:bg-[#1a2030]"
            title="Merge Split View"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M7 6h4v12H7zM13 6h4v12h-4z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
