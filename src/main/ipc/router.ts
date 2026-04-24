/**
 * Wires every channel in ./registry.ts to ipcMain.handle. Called once at
 * main-process boot. The body never needs to change per channel — to add a
 * channel, see ./registry.ts.
 */

import { ipcMain } from 'electron';

import { channels } from './registry';

export function registerIpcHandlers(): void {
	for ( const channel of channels ) {
		ipcMain.handle( channel.name, channel.invoke );
	}
}
