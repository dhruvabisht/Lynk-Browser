import { powerMonitor, powerSaveBlocker } from 'electron'

interface PowerManagerOptions {
  onPowerModeChanged: (onBattery: boolean) => void
}

export class PowerManager {
  private readonly mediaTabs = new Set<string>()
  private readonly onPowerModeChanged: (onBattery: boolean) => void
  private powerBlockerId = -1
  private onBattery = false

  constructor(options: PowerManagerOptions) {
    this.onPowerModeChanged = options.onPowerModeChanged
  }

  start(): void {
    powerMonitor.on('on-battery', this.handleOnBattery)
    powerMonitor.on('on-ac', this.handleOnAc)
  }

  stop(): void {
    powerMonitor.removeListener('on-battery', this.handleOnBattery)
    powerMonitor.removeListener('on-ac', this.handleOnAc)

    if (this.powerBlockerId !== -1 && powerSaveBlocker.isStarted(this.powerBlockerId)) {
      powerSaveBlocker.stop(this.powerBlockerId)
      this.powerBlockerId = -1
    }
  }

  setTabMediaState(tabId: string, isPlaying: boolean): void {
    if (isPlaying) {
      this.mediaTabs.add(tabId)
    } else {
      this.mediaTabs.delete(tabId)
    }

    this.syncPowerSaveBlocker()
  }

  isOnBattery(): boolean {
    return this.onBattery
  }

  private readonly handleOnBattery = (): void => {
    this.onBattery = true
    this.onPowerModeChanged(true)
  }

  private readonly handleOnAc = (): void => {
    this.onBattery = false
    this.onPowerModeChanged(false)
  }

  private syncPowerSaveBlocker(): void {
    if (this.mediaTabs.size > 0 && this.powerBlockerId === -1) {
      this.powerBlockerId = powerSaveBlocker.start('prevent-app-suspension')
      return
    }

    if (this.mediaTabs.size === 0 && this.powerBlockerId !== -1 && powerSaveBlocker.isStarted(this.powerBlockerId)) {
      powerSaveBlocker.stop(this.powerBlockerId)
      this.powerBlockerId = -1
    }
  }
}
