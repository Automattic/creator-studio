import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app, BrowserWindow, net, protocol } from 'electron';
import started from 'electron-squirrel-startup';

import { getProject } from './channels/utils/project-get';
import { registerIpcHandlers } from './ipc';

try {
	process.loadEnvFile();
} catch {
	// no .env present — fall back to process environment
}

// Per-worktree isolation: tests pass STUDIO_WRITE_USER_DATA_DIR; dev runs
// default to a `.userData` dir under the project root so two worktrees don't
// share projects.json / Chromium profile state. Lives outside `.vite/` because
// electron-forge's vite plugin wipes that dir on startup, which would erase
// linked projects between dev sessions. Packaged builds keep the OS-standard
// userData path.
const userDataOverride = process.env.STUDIO_WRITE_USER_DATA_DIR;
if ( userDataOverride ) {
	app.setPath( 'userData', userDataOverride );
} else if ( ! app.isPackaged ) {
	app.setPath( 'userData', path.join( app.getAppPath(), '.userData' ) );
}

// Packaged builds can't write to the repo-root .env, so the Settings screen
// persists the API key to <userData>/.env. Load it now (after userData is
// finalized) so the SDK picks up a key set in a previous session. Tests can
// point at any .env via STUDIO_WRITE_ENV_FILE.
try {
	const envOverride = process.env.STUDIO_WRITE_ENV_FILE;
	process.loadEnvFile(
		envOverride ?? path.join( app.getPath( 'userData' ), '.env' )
	);
} catch {
	// no userData .env yet — first launch or no key configured
}

if ( started ) {
	app.quit();
}

// Privileged scheme for serving project assets (images, etc.) into the
// renderer's markdown preview. The renderer is loaded from
// `http://localhost:5173` in dev or `file://` in packaged builds — neither
// can fetch arbitrary `file://` URLs from a different origin (Chromium
// blocks it). Routing through `studio-asset://<projectId>/<relPath>` gives
// us a same-protocol URL the markdown renderer can include in <img src>,
// while the main-process handler enforces in-project bounds.
//
// Must run before `app.ready`.
protocol.registerSchemesAsPrivileged( [
	{
		scheme: 'studio-asset',
		privileges: {
			standard: true,
			secure: true,
			supportFetchAPI: true,
			stream: true,
		},
	},
] );

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

app.on( 'ready', () => {
	// `studio-asset://<projectId>/<relPath>` → file inside the project
	// directory. Rejects paths that escape the project root via `..` or
	// resolve to a non-file. Used by the draft preview to render images
	// referenced with relative paths in the markdown source.
	protocol.handle( 'studio-asset', ( request ) => {
		try {
			const url = new URL( request.url );
			const projectId = url.hostname;
			const relPath = decodeURIComponent( url.pathname ).replace(
				/^\/+/,
				''
			);
			if ( ! projectId || ! relPath ) {
				return new Response( 'Bad request', { status: 400 } );
			}
			const project = getProject( projectId );
			if ( ! project ) {
				return new Response( 'Not found', { status: 404 } );
			}
			const target = path.resolve( project.path, relPath );
			const root = path.resolve( project.path );
			if ( target !== root && ! target.startsWith( root + path.sep ) ) {
				return new Response( 'Forbidden', { status: 403 } );
			}
			// Forward the Range header so HTML5 <video> can stream/seek.
			// Without this, net.fetch returns the whole file as 200 OK and
			// Chromium's media element refuses to play many .mov/.mp4 files
			// (notably ones with a trailing moov atom — macOS screen
			// recordings). Range support is harmless for images.
			const range = request.headers.get( 'range' );
			return net.fetch(
				`file://${ target }`,
				range ? { headers: { range } } : undefined
			);
		} catch {
			return new Response( 'Server error', { status: 500 } );
		}
	} );
	createWindow();
} );

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
