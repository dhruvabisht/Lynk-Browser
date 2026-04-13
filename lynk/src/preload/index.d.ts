import type { LynkApi } from '@shared/types'

declare global {
  interface Window {
    lynk: LynkApi
  }
}

export {}
