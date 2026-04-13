export function IncognitoIndicator(): JSX.Element {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-violet-500/20 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-violet-100 uppercase">
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3l7 3v6c0 4.5-2.9 8.6-7 10-4.1-1.4-7-5.5-7-10V6l7-3Z" />
      </svg>
      True Incognito
    </span>
  )
}
