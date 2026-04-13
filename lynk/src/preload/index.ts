import { contextBridge, ipcRenderer } from 'electron'

import type {
  EventChannel,
  EventPayloadMap,
  InvokeChannel,
  InvokeRequestMap,
  InvokeResponseMap,
  LynkApi
} from '@shared/types'

function invoke<C extends InvokeChannel>(
  channel: C,
  payload?: InvokeRequestMap[C]
): Promise<InvokeResponseMap[C]> {
  if (typeof payload === 'undefined') {
    return ipcRenderer.invoke(channel)
  }

  return ipcRenderer.invoke(channel, payload)
}

function subscribe<C extends EventChannel>(
  channel: C,
  listener: (payload: EventPayloadMap[C]) => void
): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: EventPayloadMap[C]): void => {
    listener(payload)
  }

  ipcRenderer.on(channel, wrapped)

  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

const api: LynkApi = {
  browser: {
    getState: () => invoke('browser:getState'),
    onState: (listener) => subscribe('browser:state', listener),
    onBounds: (listener) => subscribe('window:setBounds', listener)
  },
  tabs: {
    create: (input) => invoke('tab:create', input),
    close: (input) => invoke('tab:close', input),
    navigate: (input) => invoke('tab:navigate', input),
    goBack: (input) => invoke('tab:goBack', input),
    goForward: (input) => invoke('tab:goForward', input),
    reload: (input) => invoke('tab:reload', input),
    activate: (input) => invoke('tab:activate', input),
    getAll: () => invoke('tab:getAll')
  },
  split: {
    activate: (input) => invoke('split:activate', input),
    deactivate: () => invoke('split:deactivate'),
    resize: (input) => invoke('split:resize', input),
    toggle: () => invoke('split:toggle')
  },
  bookmarks: {
    add: (input) => invoke('bookmark:add', input),
    remove: (input) => invoke('bookmark:remove', input),
    getAll: () => invoke('bookmark:getAll'),
    importFromChrome: () => invoke('bookmark:import'),
    update: (input) => invoke('bookmark:update', input),
    createFolder: (input) => invoke('bookmark:createFolder', input),
    updateFolder: (input) => invoke('bookmark:updateFolder', input),
    move: (input) => invoke('bookmark:move', input),
    onChanged: (listener) => subscribe('bookmarks:changed', listener),
    onEditRequest: (listener) => subscribe('bookmark:edit-request', listener)
  },
  search: {
    suggest: (input) => invoke('search:suggest', input)
  },
  chrome: {
    update: (input) => invoke('chrome:update', input)
  }
}

contextBridge.exposeInMainWorld('lynk', api)
