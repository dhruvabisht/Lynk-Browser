const { execFileSync, spawnSync } = require('node:child_process')
const { existsSync, rmSync } = require('node:fs')
const path = require('node:path')

function getBetterSqliteBindingPath() {
  const packageJsonPath = require.resolve('better-sqlite3/package.json')
  return path.join(path.dirname(packageJsonPath), 'build/Release/better_sqlite3.node')
}

function getExpectedBinaryArch() {
  if (process.arch === 'arm64') {
    return 'arm64'
  }

  if (process.arch === 'x64') {
    return 'x86_64'
  }

  return process.arch
}

function getBinaryInfo(binaryPath) {
  try {
    return execFileSync('file', [binaryPath], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function hasExpectedArchitecture(binaryInfo) {
  const expectedArch = getExpectedBinaryArch()
  return binaryInfo.includes(expectedArch)
}

function rebuildNativeDeps() {
  console.log(`Rebuilding native Electron dependencies for ${process.platform}-${process.arch}...`)
  const installScriptPath = path.join(__dirname, 'install-app-deps.cjs')
  const result = spawnSync(process.execPath, [installScriptPath], {
    stdio: 'inherit',
    env: process.env
  })

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status)
  }

  if (result.error) {
    throw result.error
  }
}

function ensureBetterSqliteForHost() {
  const bindingPath = getBetterSqliteBindingPath()

  if (!existsSync(bindingPath)) {
    rebuildNativeDeps()
  } else {
    const binaryInfo = getBinaryInfo(bindingPath)

    if (hasExpectedArchitecture(binaryInfo)) {
      return
    }

    console.warn(
      `Found incompatible better-sqlite3 binary for ${process.platform}-${process.arch}: ${binaryInfo || 'unknown architecture'}`
    )

    // Remove the stale binary tree first so electron-builder cannot leave an
    // incompatible prebuild in place on the next rebuild.
    rmSync(path.dirname(path.dirname(bindingPath)), { recursive: true, force: true })
    rebuildNativeDeps()
  }

  const refreshedBinaryInfo = getBinaryInfo(bindingPath)

  if (!hasExpectedArchitecture(refreshedBinaryInfo)) {
    throw new Error(
      `better-sqlite3 is still not built for ${process.platform}-${process.arch}: ${refreshedBinaryInfo || 'missing binary'}`
    )
  }
}

ensureBetterSqliteForHost()
