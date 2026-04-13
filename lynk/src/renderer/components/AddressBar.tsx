import { useEffect, useMemo, useState } from 'react'

import type { TabState } from '@shared/types'
import { IncognitoIndicator } from './IncognitoIndicator'
import { displayUrl, isLikelyUrl, normalizeOmniboxInput } from '@renderer/utils'

interface AddressBarProps {
  tab?: TabState
  compact?: boolean
  isBookmarked?: boolean
  extensionsCount?: number
  showIncognitoBadge?: boolean
  onSubmit: (value: string) => void
  onBack?: () => void
  onForward?: () => void
  onReload?: () => void
  onToggleBookmark?: () => void
  onFocus?: () => void
  onSuggestionsHeightChange?: (height: number) => void
}

export function AddressBar({
  tab,
  compact = false,
  isBookmarked = false,
  extensionsCount = 0,
  showIncognitoBadge = false,
  onSubmit,
  onBack,
  onForward,
  onReload,
  onToggleBookmark,
  onFocus,
  onSuggestionsHeightChange
}: AddressBarProps): JSX.Element {
  const [value, setValue] = useState(displayUrl(tab?.url ?? ''))
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [focused, setFocused] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const isSecure = tab?.url.startsWith('https://')
  const showSuggestions = !compact && focused && suggestions.length > 0
  const favicon = tab?.favicon

  useEffect(() => {
    if (!focused) {
      setValue(displayUrl(tab?.url ?? ''))
    }
  }, [focused, tab?.url])

  useEffect(() => {
    if (compact) {
      onSuggestionsHeightChange?.(0)
      return
    }

    const trimmedValue = value.trim()

    if (!focused || !trimmedValue || isLikelyUrl(trimmedValue)) {
      setSuggestions([])
      setHighlightedIndex(-1)
      onSuggestionsHeightChange?.(0)
      return
    }

    const timer = window.setTimeout(async () => {
      const results = await window.lynk.search.suggest({ query: trimmedValue })
      setSuggestions(results.slice(0, 6))
      setHighlightedIndex(results.length ? 0 : -1)
      onSuggestionsHeightChange?.(results.length ? results.length * 40 + 18 : 0)
    }, 300)

    return () => {
      window.clearTimeout(timer)
    }
  }, [compact, focused, onSuggestionsHeightChange, value])

  useEffect(() => {
    return () => onSuggestionsHeightChange?.(0)
  }, [onSuggestionsHeightChange])

  const placeholder = useMemo(
    () => (compact ? 'Search or enter address' : 'Search with Google or enter an address'),
    [compact]
  )

  const commit = (rawValue: string): void => {
    const nextValue = rawValue.trim()
    setFocused(false)
    setSuggestions([])
    setHighlightedIndex(-1)
    onSuggestionsHeightChange?.(0)
    onSubmit(normalizeOmniboxInput(nextValue))
  }

  return (
    <div className={`relative flex items-center gap-3 ${compact ? 'h-full' : 'h-11'}`}>
      {!compact ? (
        <div className="flex items-center gap-1">
          <ToolbarButton disabled={!tab?.canGoBack} onClick={onBack} label="Back">
            <path d="m15 18-6-6 6-6" />
          </ToolbarButton>
          <ToolbarButton disabled={!tab?.canGoForward} onClick={onForward} label="Forward">
            <path d="m9 18 6-6-6-6" />
          </ToolbarButton>
          <ToolbarButton onClick={onReload} label="Reload">
            <path d="M20 12a8 8 0 1 1-2.34-5.66" />
            <path d="M20 4v6h-6" />
          </ToolbarButton>
        </div>
      ) : null}

      <div className="relative min-w-0 flex-1">
        <div
          className={`flex h-11 items-center gap-3 rounded-full border px-4 transition ${
            showIncognitoBadge
              ? 'border-violet-300/18 bg-violet-950/60 text-violet-50'
              : 'border-white/8 bg-white/8 text-white backdrop-blur-xl'
          }`}
        >
          <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-white/6">
            {favicon ? (
              <img src={favicon} alt="" className="h-4 w-4" />
            ) : isSecure ? (
              <svg className="h-4 w-4 text-emerald-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M7 10V7a5 5 0 0 1 10 0v3" />
                <rect x="5" y="10" width="14" height="10" rx="2" />
              </svg>
            ) : (
              <svg className="h-4 w-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            )}
          </span>

          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onFocus={() => {
              setFocused(true)
              onFocus?.()
            }}
            onBlur={() => {
              window.setTimeout(() => {
                setFocused(false)
                setSuggestions([])
                setHighlightedIndex(-1)
                onSuggestionsHeightChange?.(0)
                setValue(displayUrl(tab?.url ?? value))
              }, 120)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && suggestions.length) {
                event.preventDefault()
                setHighlightedIndex((current) => (current + 1) % suggestions.length)
              }

              if (event.key === 'ArrowUp' && suggestions.length) {
                event.preventDefault()
                setHighlightedIndex((current) => (current - 1 + suggestions.length) % suggestions.length)
              }

              if (event.key === 'Escape') {
                setFocused(false)
                setSuggestions([])
                onSuggestionsHeightChange?.(0)
              }

              if (event.key === 'Enter') {
                event.preventDefault()
                if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
                  commit(suggestions[highlightedIndex])
                } else {
                  commit(value)
                }
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder={placeholder}
            spellCheck={false}
          />

          {showIncognitoBadge ? <IncognitoIndicator /> : null}

          {!compact ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleBookmark}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                  isBookmarked ? 'bg-amber-400/20 text-amber-200' : 'hover:bg-white/10 text-slate-300'
                }`}
                title={isBookmarked ? 'Remove Bookmark' : 'Add Bookmark'}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
                  <path d="M7 4h10v16l-5-3-5 3V4Z" />
                </svg>
              </button>
              <button
                type="button"
                className="relative flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10"
                title="Extensions"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M8 4h3v3H8zM13 4h3v3h-3zM8 9h3v3H8zM13 9h3v3h-3zM8 14h3v3H8zM13 14h3v3h-3z" />
                </svg>
                {extensionsCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 rounded-full bg-cyan-400 px-1.5 text-[10px] font-semibold text-slate-950">
                    {extensionsCount}
                  </span>
                ) : null}
              </button>
            </div>
          ) : null}
        </div>

        {!compact && showSuggestions ? (
          <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-[26px] border border-white/10 bg-[#0d1017]/94 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.46)] backdrop-blur-xl">
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion}-${index}`}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  commit(suggestion)
                }}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                  index === highlightedIndex ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/6'
                }`}
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <span className="truncate">{suggestion}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

interface ToolbarButtonProps {
  children: React.ReactNode
  disabled?: boolean
  label: string
  onClick?: () => void
}

function ToolbarButton({ children, disabled = false, label, onClick }: ToolbarButtonProps): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        {children}
      </svg>
    </button>
  )
}
