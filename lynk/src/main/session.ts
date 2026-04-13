import { app, session } from 'electron'
import type { Cookie, Session } from 'electron'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import type { IncognitoAuditState } from '@shared/types'

interface SessionManagerOptions {
  userDataPath?: string
}

export class SessionManager {
  private readonly userDataPath: string
  private readonly configured = new WeakSet<Session>()
  private incognitoSession: Session | null = null
  private incognitoTabCount = 0
  private incognitoAuditBaseline: Set<string> | null = null
  private auditState: IncognitoAuditState = {
    activeTabCount: 0,
    clean: true,
    unexpectedWrites: []
  }

  constructor(options: SessionManagerOptions = {}) {
    this.userDataPath = options.userDataPath ?? app.getPath('userData')
  }

  async getSession(isIncognito: boolean): Promise<Session> {
    if (!isIncognito) {
      const normalSession = session.defaultSession
      this.configureSession(normalSession, false)
      return normalSession
    }

    if (!this.incognitoSession) {
      const incognitoSession = session.fromPartition('incognito', { cache: false })
      this.configureSession(incognitoSession, true)
      this.incognitoSession = incognitoSession
      await this.setStoragePathNull(incognitoSession)
    }

    return this.incognitoSession
  }

  async handleTabCreated(isIncognito: boolean): Promise<void> {
    if (!isIncognito) {
      return
    }

    this.incognitoTabCount += 1

    if (this.incognitoTabCount === 1) {
      this.incognitoAuditBaseline = this.snapshotUserData()
      this.auditState = {
        activeTabCount: this.incognitoTabCount,
        clean: true,
        unexpectedWrites: []
      }
    } else {
      this.auditState = {
        ...this.auditState,
        activeTabCount: this.incognitoTabCount
      }
    }
  }

  async handleTabClosed(isIncognito: boolean): Promise<IncognitoAuditState> {
    if (!isIncognito || !this.incognitoSession) {
      return this.auditState
    }

    this.incognitoTabCount = Math.max(0, this.incognitoTabCount - 1)

    // Electron only exposes session-level clearing, so every incognito tab close
    // performs an aggressive sweep to keep the shared in-memory partition ephemeral.
    await this.incognitoSession.clearStorageData()
    await this.incognitoSession.clearCache()

    if (this.incognitoTabCount === 0) {
      await this.incognitoSession.clearStorageData()
      await this.incognitoSession.clearCache()

      const currentSnapshot = this.snapshotUserData()
      const baseline = this.incognitoAuditBaseline ?? new Set<string>()
      const unexpectedWrites = [...currentSnapshot].filter((entry) => !baseline.has(entry))

      this.auditState = {
        activeTabCount: 0,
        clean: unexpectedWrites.length === 0,
        unexpectedWrites
      }
      this.incognitoAuditBaseline = null

      return this.auditState
    }

    this.auditState = {
      ...this.auditState,
      activeTabCount: this.incognitoTabCount
    }

    return this.auditState
  }

  getAuditState(): IncognitoAuditState {
    return this.auditState
  }

  private configureSession(targetSession: Session, isIncognito: boolean): void {
    if (this.configured.has(targetSession)) {
      return
    }

    if (isIncognito) {
      this.configureIncognitoSession(targetSession)
    }

    targetSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === 'fullscreen' || permission === 'media' || permission === 'clipboard-sanitized-write')
    })

    this.configured.add(targetSession)
  }

  private configureIncognitoSession(targetSession: Session): void {
    const filter = { urls: ['*://*/*'] }

    targetSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
      const requestHeaders = { ...details.requestHeaders }
      delete requestHeaders.Cookie
      delete requestHeaders.cookie
      callback({ requestHeaders })
    })

    targetSession.webRequest.onHeadersReceived(filter, (details, callback) => {
      const responseHeaders = { ...details.responseHeaders }

      for (const key of Object.keys(responseHeaders)) {
        if (key.toLowerCase() === 'set-cookie') {
          delete responseHeaders[key]
        }
      }

      callback({ responseHeaders })
    })

    targetSession.cookies.on('changed', async (_event, cookie, _cause, removed) => {
      if (removed) {
        return
      }

      try {
        await targetSession.cookies.remove(this.cookieToUrl(cookie), cookie.name)
      } catch {
        // The cookie may already be gone when the async removal runs.
      }
    })

    // Electron 41 does not expose service worker requests as a dedicated resource
    // type here, so BrowserViews additionally disable the Blink feature for incognito.
    targetSession.serviceWorkers.on('registration-completed', () => {
      void targetSession.clearStorageData({ storages: ['serviceworkers'] })
    })
    void targetSession.clearStorageData({ storages: ['serviceworkers'] })
  }

  private async setStoragePathNull(targetSession: Session): Promise<void> {
    const sessionWithStoragePath = targetSession as Session & {
      setStoragePath?: (storagePath: string | null) => Promise<void> | void
    }

    await sessionWithStoragePath.setStoragePath?.(null)
  }

  private snapshotUserData(): Set<string> {
    const entries = new Set<string>()

    if (!existsSync(this.userDataPath)) {
      return entries
    }

    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory)) {
        const absolutePath = join(directory, entry)
        const relativePath = absolutePath.replace(`${this.userDataPath}/`, '')
        const stats = statSync(absolutePath)

        if (/(cache|cookies|service worker|session storage|partitions|network|code cache)/i.test(relativePath)) {
          entries.add(`${relativePath}:${stats.size}:${Math.trunc(stats.mtimeMs)}`)
        }

        if (stats.isDirectory()) {
          walk(absolutePath)
        }
      }
    }

    walk(this.userDataPath)
    return entries
  }

  private cookieToUrl(cookie: Cookie): string {
    const protocol = cookie.secure ? 'https://' : 'http://'
    const normalizedDomain = (cookie.domain ?? 'localhost').replace(/^\./, '')
    const path = cookie.path || '/'

    return `${protocol}${normalizedDomain}${path}`
  }
}
