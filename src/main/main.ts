import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { AgentService } from './agentService';
import { IpcChannels, PermissionResponse, SendRequest } from './ipc';

try {
	process.loadEnvFile();
} catch {
	// no .env present — fall back to process environment
}

if ( started ) {
	app.quit();
}

if ( ! app.isPackaged ) {
	app.commandLine.appendSwitch( 'remote-debugging-port', '9222' );
}

const isMac = process.platform === 'darwin';

const services = new Map< number, AgentService >();

ipcMain.handle( IpcChannels.send, async ( event, payload: unknown ) => {
	const { prompt } = SendRequest.parse( payload );
	const contents = event.sender;
	let service = services.get( contents.id );
	if ( ! service ) {
		service = new AgentService( contents );
		services.set( contents.id, service );
		contents.once( 'destroyed', () => services.delete( contents.id ) );
	}
	await service.send( prompt );
} );

ipcMain.handle( IpcChannels.permissionRespond, ( event, payload: unknown ) => {
	const response = PermissionResponse.parse( payload );
	const service = services.get( event.sender.id );
	if ( service ) {
		service.respondToPermission( response );
	}
} );

const createWindow = () => {
	const mainWindow = new BrowserWindow( {
		width: 1100,
		height: 720,
		minWidth: 820,
		minHeight: 520,
		titleBarStyle: isMac ? 'hiddenInset' : 'default',
		trafficLightPosition: isMac ? { x: 14, y: 13 } : undefined,
		vibrancy: isMac ? 'sidebar' : undefined,
		visualEffectState: isMac ? 'active' : undefined,
		backgroundColor: isMac ? '#00000000' : '#1a1a1a',
		webPreferences: {
			contextIsolation: true,
			sandbox: true,
			preload: path.join( __dirname, 'preload.js' ),
		},
	} );

	if ( MAIN_WINDOW_VITE_DEV_SERVER_URL ) {
		mainWindow.loadURL( MAIN_WINDOW_VITE_DEV_SERVER_URL );
	} else {
		mainWindow.loadFile(
			path.join(
				__dirname,
				`../renderer/${ MAIN_WINDOW_VITE_NAME }/index.html`
			)
		);
	}
};

app.on( 'ready', createWindow );

app.on( 'window-all-closed', () => {
	if ( ! isMac ) {
		app.quit();
	}
} );

app.on( 'activate', () => {
	if ( BrowserWindow.getAllWindows().length === 0 ) {
		createWindow();
	}
} );
