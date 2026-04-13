export function VideoOverlay(): JSX.Element {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 text-left shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300">Video Controls</p>
      <h3 className="mt-2 text-lg font-semibold text-white">Universal media controls stay inside every page.</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        Lynk injects hover-aware playback, seek, volume, fullscreen, speed, and PiP controls into HTML5 video sites while skipping
        YouTube&apos;s native player.
      </p>
    </div>
  )
}
