import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { AgentService } from './agentService';
import { createChat, listChats, loadChat } from './chatService';
import { addFolder, listFolders, removeFolder } from './folderService';
import {
	ChatsCreateRequest,
	ChatsListRequest,
	ChatsLoadRequest,
	FoldersRemoveRequest,
	IpcChannels,
	PermissionResponse,
	SendRequest,
} from './ipc';

try {
	process.loadEnvFile();
} catch {
	// no .env present — fall back to process environment
}

// Test isolation hook: Playwright specs pass an isolated userData dir so
// seeded folders.json / chats don't collide with the user's real state.
const userDataOverride = process.env.CREATOR_STUDIO_USER_DATA_DIR;
if ( userDataOverride ) {
	app.setPath( 'userData', userDataOverride );
}

if ( started ) {
	app.quit();
}

if ( ! app.isPackaged ) {
	app.commandLine.appendSwitch( 'remote-debugging-port', '9222' );
}

const isMac = process.platform === 'darwin';

const services = new Map< number, Map< string, AgentService > >();

function getOrCreateService(
	contents: Electron.WebContents,
	folderId: string
): AgentService {
	let perFolder = services.get( contents.id );
	if ( ! perFolder ) {
		perFolder = new Map();
		services.set( contents.id, perFolder );
		contents.once( 'destroyed', () => services.delete( contents.id ) );
	}
	let service = perFolder.get( folderId );
	if ( ! service ) {
		service = new AgentService( contents, folderId );
		perFolder.set( folderId, service );
	}
	return service;
}

ipcMain.handle( IpcChannels.send, ( event, payload: unknown ) => {
	const { prompt, folderId } = SendRequest.parse( payload );
	const service = getOrCreateService( event.sender, folderId );
	// Fire-and-forget: returning the IPC handle immediately lets a second
	// invoke from a different folder proceed in parallel. The renderer
	// clears its per-folder busy state on the 'done' event, not on this
	// promise resolving.
	void service.send( prompt ).catch( ( err ) => service.emitError( err ) );
} );

ipcMain.handle( IpcChannels.permissionRespond, ( event, payload: unknown ) => {
	const response = PermissionResponse.parse( payload );
	const service = services.get( event.sender.id )?.get( response.folderId );
	if ( service ) {
		service.respondToPermission( response );
	}
} );

ipcMain.handle( IpcChannels.foldersList, () => listFolders() );

ipcMain.handle( IpcChannels.foldersAdd, async ( event ) => {
	const window = BrowserWindow.fromWebContents( event.sender );
	return await addFolder( window );
} );

ipcMain.handle( IpcChannels.foldersRemove, ( _event, payload: unknown ) => {
	const { id } = FoldersRemoveRequest.parse( payload );
	removeFolder( id );
} );

ipcMain.handle( IpcChannels.chatsLoad, ( _event, payload: unknown ) => {
	const { folderId, chatId } = ChatsLoadRequest.parse( payload );
	return loadChat( folderId, chatId );
} );

ipcMain.handle( IpcChannels.chatsList, ( _event, payload: unknown ) => {
	const { folderId } = ChatsListRequest.parse( payload );
	return listChats( folderId );
} );

ipcMain.handle( IpcChannels.chatsCreate, ( _event, payload: unknown ) => {
	const { folderId, kind, title } = ChatsCreateRequest.parse( payload );
	return createChat( folderId, { kind, title } );
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
