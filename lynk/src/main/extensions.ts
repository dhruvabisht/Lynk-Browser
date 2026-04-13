import { app } from 'electron'
import type { Session } from 'electron'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import type { ExtensionSummary } from '@shared/types'

export class ExtensionHost {
  private loaded: ExtensionSummary[] = []

  async load(targetSession: Session): Promise<ExtensionSummary[]> {
    const extensionDirectories = this.collectExtensionDirectories()
    const loaded: ExtensionSummary[] = []

    for (const extensionDirectory of extensionDirectories) {
      try {
        const extension = await targetSession.loadExtension(extensionDirectory, {
          allowFileAccess: true
        })

        loaded.push({
          id: extension.id,
          name: extension.name,
          version: extension.version,
          enabled: true
        })
      } catch {
        // Invalid or duplicate unpacked extensions are ignored so the browser boots
        // even when the local extensions folder contains partial work-in-progress bundles.
      }
    }

    this.loaded = loaded
    return this.loaded
  }

  getLoaded(): ExtensionSummary[] {
    return this.loaded
  }

  private collectExtensionDirectories(): string[] {
    const searchRoots = [
      join(app.getAppPath(), 'resources', 'extensions'),
      join(process.resourcesPath, 'resources', 'extensions')
    ]
    const discovered = new Set<string>()

    for (const root of searchRoots) {
      if (!existsSync(root)) {
        continue
      }

      for (const entry of readdirSync(root)) {
        const absolutePath = join(root, entry)

        if (statSync(absolutePath).isDirectory()) {
          discovered.add(absolutePath)
        }
      }
    }

    return [...discovered]
  }
}
