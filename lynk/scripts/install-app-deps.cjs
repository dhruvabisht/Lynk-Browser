const { execFileSync, spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')

function appendFlag(currentValue, nextFlag) {
  return currentValue ? `${currentValue} ${nextFlag}` : nextFlag
}

const env = { ...process.env }

if (process.platform === 'darwin') {
  try {
    const sdkroot = execFileSync('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], {
      encoding: 'utf8'
    }).trim()

    if (sdkroot) {
      const isysrootFlag = `-isysroot ${sdkroot}`
      env.SDKROOT = env.SDKROOT || sdkroot
      env.CFLAGS = appendFlag(env.CFLAGS, isysrootFlag)
      env.CXXFLAGS = appendFlag(env.CXXFLAGS, isysrootFlag)
      env.CPPFLAGS = appendFlag(env.CPPFLAGS, isysrootFlag)
      env.LDFLAGS = appendFlag(env.LDFLAGS, isysrootFlag)
      env.CC = env.CC || 'clang'
      env.CXX = env.CXX || 'clang++'

      const libcxxIncludePath = path.join(sdkroot, 'usr/include/c++/v1')

      // Some CLT installs point clang at a non-existent c++ header directory.
      // Force the SDK's libc++ headers so native Electron rebuilds can resolve
      // standard headers like <climits> without requiring machine-specific fixes.
      if (existsSync(path.join(libcxxIncludePath, 'climits'))) {
        const libcxxIncludeFlag = `-isystem ${libcxxIncludePath}`
        const libcxxStdlibFlag = '-stdlib=libc++'

        env.CXXFLAGS = appendFlag(env.CXXFLAGS, libcxxIncludeFlag)
        env.CXXFLAGS = appendFlag(env.CXXFLAGS, libcxxStdlibFlag)
        env.CPPFLAGS = appendFlag(env.CPPFLAGS, libcxxIncludeFlag)
      }
    }
  } catch (error) {
    console.warn('Skipping SDKROOT injection for install-app-deps:', error instanceof Error ? error.message : error)
  }
}

// Force a local rebuild for the host architecture so Apple Silicon installs do
// not accidentally pick up an x64 prebuild that Electron cannot load.
env.npm_config_build_from_source = env.npm_config_build_from_source || 'true'
env.npm_config_arch = env.npm_config_arch || process.arch
env.npm_config_target_arch = env.npm_config_target_arch || process.arch

const electronBuilderCli = require.resolve('electron-builder/out/cli/cli.js')
const result = spawnSync(process.execPath, [electronBuilderCli, 'install-app-deps', '--arch', process.arch], {
  stdio: 'inherit',
  env
})

if (typeof result.status === 'number' && result.status !== 0) {
  process.exit(result.status)
}

if (result.error) {
  throw result.error
}
