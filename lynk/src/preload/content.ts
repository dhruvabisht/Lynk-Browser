interface VideoOverlayController {
  refresh: () => void
  destroy: () => void
}

if (!/youtube\.com$|youtu\.be$/i.test(location.hostname)) {
  const controllers = new WeakMap<HTMLVideoElement, VideoOverlayController>()

  const ensureController = (video: HTMLVideoElement): void => {
    if (controllers.has(video)) {
      return
    }

    controllers.set(video, createVideoOverlay(video))
  }

  const scanForVideos = (root: ParentNode): void => {
    root.querySelectorAll('video').forEach((element) => {
      if (element instanceof HTMLVideoElement) {
        ensureController(element)
      }
    })
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          return
        }

        if (node instanceof HTMLVideoElement) {
          ensureController(node)
        } else {
          scanForVideos(node)
        }
      })
    }
  })

  const boot = (): void => {
    scanForVideos(document)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    })
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', boot, { once: true })
  } else {
    boot()
  }
}

function createVideoOverlay(video: HTMLVideoElement): VideoOverlayController {
  const outer = document.createElement('div')
  const controls = document.createElement('div')
  const playButton = createButton('Play')
  const seek = document.createElement('input')
  const timeLabel = document.createElement('span')
  const volume = document.createElement('input')
  const muteButton = createButton('Mute')
  const fullscreenButton = createButton('Fullscreen')
  const pipButton = createButton('PiP')
  const speed = document.createElement('select')
  const destroyController = (): void => {
    outer.remove()
    window.removeEventListener('resize', refresh)
    window.removeEventListener('scroll', refresh, true)
    clearTimeout(hideTimer)
    clearInterval(syncTimer)
  }

  let visible = false
  let hideTimer = 0

  outer.style.position = 'fixed'
  outer.style.pointerEvents = 'none'
  outer.style.zIndex = '2147483646'
  outer.style.opacity = '0'
  outer.style.transition = 'opacity 160ms ease'

  controls.style.position = 'absolute'
  controls.style.left = '12px'
  controls.style.right = '12px'
  controls.style.bottom = '12px'
  controls.style.display = 'flex'
  controls.style.alignItems = 'center'
  controls.style.gap = '10px'
  controls.style.padding = '10px 12px'
  controls.style.borderRadius = '16px'
  controls.style.background = 'rgba(11, 12, 17, 0.82)'
  controls.style.backdropFilter = 'blur(12px)'
  controls.style.border = '1px solid rgba(255, 255, 255, 0.18)'
  controls.style.boxShadow = '0 20px 50px rgba(0, 0, 0, 0.32)'
  controls.style.pointerEvents = 'auto'
  controls.style.color = '#f8f8ff'
  controls.style.fontFamily =
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif'
  controls.style.fontSize = '12px'

  seek.type = 'range'
  seek.min = '0'
  seek.max = '1000'
  seek.step = '1'
  seek.style.flex = '1'
  seek.style.accentColor = '#7dd3fc'

  volume.type = 'range'
  volume.min = '0'
  volume.max = '1'
  volume.step = '0.05'
  volume.style.width = '88px'
  volume.style.accentColor = '#c4b5fd'

  speed.style.height = '32px'
  speed.style.borderRadius = '10px'
  speed.style.border = '1px solid rgba(255, 255, 255, 0.18)'
  speed.style.background = 'rgba(20, 21, 28, 0.94)'
  speed.style.color = '#f8f8ff'
  speed.style.padding = '0 10px'

  for (const rate of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
    const option = document.createElement('option')
    option.value = String(rate)
    option.textContent = `${rate}x`
    if (rate === 1) {
      option.selected = true
    }
    speed.append(option)
  }

  timeLabel.style.minWidth = '88px'
  timeLabel.style.textAlign = 'center'
  timeLabel.style.fontVariantNumeric = 'tabular-nums'

  controls.append(
    playButton,
    seek,
    timeLabel,
    volume,
    muteButton,
    fullscreenButton,
    speed,
    pipButton
  )
  outer.append(controls)
  document.documentElement.append(outer)

  const show = (): void => {
    visible = true
    outer.style.opacity = '1'
    clearTimeout(hideTimer)
    hideTimer = window.setTimeout(() => {
      visible = false
      outer.style.opacity = '0'
    }, 3000)
  }

  const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds)) {
      return '--:--'
    }

    const totalSeconds = Math.max(0, Math.floor(seconds))
    const minutes = Math.floor(totalSeconds / 60)
    const remainingSeconds = totalSeconds % 60
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60

    if (hours > 0) {
      return `${hours}:${String(remainingMinutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    }

    return `${remainingMinutes}:${String(remainingSeconds).padStart(2, '0')}`
  }

  const syncUi = (): void => {
    if (!document.contains(video)) {
      destroyController()
      return
    }

    const duration = Number.isFinite(video.duration) ? video.duration : 0
    const ratio = duration > 0 ? Math.min(1, video.currentTime / duration) : 0
    const rect = video.getBoundingClientRect()
    const hidden =
      rect.width < 140 ||
      rect.height < 100 ||
      rect.bottom < 0 ||
      rect.right < 0 ||
      rect.left > window.innerWidth ||
      rect.top > window.innerHeight

    if (hidden) {
      outer.style.opacity = '0'
      outer.style.pointerEvents = 'none'
    } else {
      outer.style.pointerEvents = 'none'
      outer.style.left = `${rect.left}px`
      outer.style.top = `${rect.top}px`
      outer.style.width = `${rect.width}px`
      outer.style.height = `${rect.height}px`
      outer.style.opacity = visible ? '1' : '0'
    }

    playButton.textContent = video.paused ? 'Play' : 'Pause'
    seek.value = String(Math.round(ratio * 1000))
    timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(duration)}`
    volume.value = String(video.volume)
    muteButton.textContent = video.muted ? 'Unmute' : 'Mute'
    speed.value = String(video.playbackRate)
    pipButton.style.display =
      document.pictureInPictureEnabled && !video.disablePictureInPicture ? 'inline-flex' : 'none'
  }

  const refresh = (): void => {
    syncUi()
  }

  playButton.addEventListener('click', () => {
    if (video.paused) {
      void video.play()
    } else {
      video.pause()
    }
    show()
  })

  seek.addEventListener('input', () => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      return
    }

    const nextTime = (Number(seek.value) / 1000) * video.duration
    video.currentTime = nextTime
    show()
  })

  volume.addEventListener('input', () => {
    video.volume = Number(volume.value)
    video.muted = video.volume === 0
    show()
  })

  muteButton.addEventListener('click', () => {
    video.muted = !video.muted
    show()
  })

  fullscreenButton.addEventListener('click', async () => {
    const target = video.closest('[data-fullscreen-target]') ?? video

    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else if ('requestFullscreen' in target) {
      await (target as HTMLElement).requestFullscreen()
    }

    show()
  })

  speed.addEventListener('change', () => {
    video.playbackRate = Number(speed.value)
    show()
  })

  pipButton.addEventListener('click', async () => {
    if (!document.pictureInPictureEnabled || video.disablePictureInPicture) {
      return
    }

    if (document.pictureInPictureElement === video) {
      await document.exitPictureInPicture()
    } else {
      await video.requestPictureInPicture()
    }

    show()
  })

  video.addEventListener('mouseenter', show)
  video.addEventListener('mousemove', show)
  controls.addEventListener('mouseenter', show)
  controls.addEventListener('mousemove', show)
  controls.addEventListener('mouseleave', () => {
    clearTimeout(hideTimer)
    hideTimer = window.setTimeout(() => {
      visible = false
      outer.style.opacity = '0'
    }, 1500)
  })

  window.addEventListener('resize', refresh)
  window.addEventListener('scroll', refresh, true)

  const syncTimer = window.setInterval(syncUi, 200)
  syncUi()

  return {
    refresh,
    destroy: destroyController
  }
}

function createButton(label: string): HTMLButtonElement {
  const button = document.createElement('button')

  button.type = 'button'
  button.textContent = label
  button.style.display = 'inline-flex'
  button.style.alignItems = 'center'
  button.style.justifyContent = 'center'
  button.style.height = '32px'
  button.style.padding = '0 12px'
  button.style.borderRadius = '10px'
  button.style.border = '1px solid rgba(255, 255, 255, 0.18)'
  button.style.background = 'rgba(255, 255, 255, 0.08)'
  button.style.color = '#ffffff'
  button.style.cursor = 'pointer'
  button.style.pointerEvents = 'auto'

  return button
}
