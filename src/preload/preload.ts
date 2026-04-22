import { contextBridge, ipcRenderer } from 'electron';

import type { AgentEvent } from '../main/ipc';

const api = {
  chat: {
    send: (prompt: string): Promise<void> =>
      ipcRenderer.invoke('chat:send', { prompt }),
    onEvent: (cb: (event: AgentEvent) => void): (() => void) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        event: AgentEvent,
      ): void => cb(event);
      ipcRenderer.on('chat:event', listener);
      return () => ipcRenderer.off('chat:event', listener);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
