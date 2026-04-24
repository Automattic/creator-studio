import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';

import { registerIpcHandlers } from './ipc/registry';

try {
	process.loadEnvFile();
} catch {
	// no .env present — fall back to process environment
}

// Per-worktree isolation: tests pass CREATOR_STUDIO_USER_DATA_DIR; dev runs
// default to a `.vite/userData` dir under the project root so two worktrees
// don't share folders.json / Chromium profile state. Packaged builds keep
// the OS-standard userData path.
const userDataOverride = process.env.CREATOR_STUDIO_USER_DATA_DIR;
if ( userDataOverride ) {
	app.setPath( 'userData', userDataOverride );
} else if ( ! app.isPackaged ) {
	app.setPath(
		'userData',
		path.join( app.getAppPath(), '.vite', 'userData' )
	);
}

if ( started ) {
	app.quit();
}

let devCdpPort: number | null = null;
if ( ! app.isPackaged ) {
	// CDP port is derived from the project root so parallel worktrees land
	// on distinct ports. scripts/playwright-mcp.mjs computes the same value
	// to reach this instance's DevTools.
	const rootHash = crypto
		.createHash( 'sha1' )
		.update( app.getAppPath() )
		.digest( 'hex' );
	devCdpPort = 9222 + ( parseInt( rootHash.slice( 0, 4 ), 16 ) % 1000 );
	app.commandLine.appendSwitch(
		'remote-debugging-port',
		String( devCdpPort )
	);
}

// Dev wrapper (scripts/dev.mjs) and scripts/ensure-dev.mjs poll this file
// to know when a restart has finished. Writing it only after the renderer
// finishes loading means `exit 0` from `npm run reload` also guarantees
// there is a live CDP target to attach to — the main process being up is
// not enough because Playwright MCP can't reattach until the renderer is
// listable as a target. __dirname resolves to <project>/.vite/build in
// dev, so the marker lands at <project>/.vite/dev-boot.json.
function writeDevBootMarker( cdpPort: number ): void {
	try {
		const bootId = `${ Date.now() }-${ process.pid }`;
		fs.writeFileSync(
			path.join( __dirname, '..', 'dev-boot.json' ),
			JSON.stringify( { bootId, pid: process.pid, cdpPort } )
		);
	} catch {
		// Best effort — a missing marker just means `npm run reload`
		// will time out instead of returning instantly.
	}
}

const isMac = process.platform === 'darwin';

registerIpcHandlers();

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

	if ( devCdpPort !== null ) {
		const port = devCdpPort;
		mainWindow.webContents.once( 'did-finish-load', () => {
			writeDevBootMarker( port );
		} );
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
