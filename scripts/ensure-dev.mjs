// Ensure `npm start` is running for this worktree. Idempotent: if the dev
// server is already up, exits immediately. If it isn't, spawns it detached
// and blocks until the new process has written a fresh boot marker with a
// live CDP endpoint.
//
// Two "already up" signals:
//   - .vite/dev-boot.json + CDP responds → fully booted, done.
//   - Reload socket exists (dev.mjs creates it before forge finishes
//     booting) → something is starting; wait for it rather than spawning
//     a second instance that would collide on CDP port.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
const bootPath = path.join( projectRoot, '.vite', 'dev-boot.json' );
const socketPath = path.join(
	os.tmpdir(),
	`creator-studio-${ crypto
		.createHash( 'sha1' )
		.update( projectRoot )
		.digest( 'hex' )
		.slice( 0, 12 ) }.sock`
);

function readBoot() {
	try {
		return JSON.parse( fs.readFileSync( bootPath, 'utf8' ) );
	} catch {
		return null;
	}
}

function cdpAlive( port ) {
	return new Promise( ( resolve ) => {
		const req = http.get(
			`http://localhost:${ port }/json/version`,
			( res ) => {
				res.resume();
				resolve( res.statusCode === 200 );
			}
		);
		req.on( 'error', () => resolve( false ) );
		req.setTimeout( 500, () => {
			req.destroy();
			resolve( false );
		} );
	} );
}

async function sleep( ms ) {
	return new Promise( ( r ) => setTimeout( r, ms ) );
}

async function waitForBoot( previousBootId, timeoutMs ) {
	const start = Date.now();
	while ( Date.now() - start < timeoutMs ) {
		const boot = readBoot();
		if (
			boot &&
			boot.bootId !== previousBootId &&
			boot.cdpPort &&
			( await cdpAlive( boot.cdpPort ) )
		) {
			return boot;
		}
		await sleep( 300 );
	}
	return null;
}

const existingBoot = readBoot();
if (
	existingBoot &&
	existingBoot.cdpPort &&
	( await cdpAlive( existingBoot.cdpPort ) )
) {
	console.log(
		`dev already up (pid ${ existingBoot.pid }, cdp ${ existingBoot.cdpPort })`
	);
	process.exit( 0 );
}

// Reload socket present means dev.mjs is alive even if Electron hasn't
// finished booting yet. Wait instead of spawning a duplicate.
if ( fs.existsSync( socketPath ) ) {
	console.log( 'dev wrapper is running but app not ready yet; waiting…' );
	const boot = await waitForBoot( existingBoot?.bootId ?? null, 60_000 );
	if ( ! boot ) {
		console.error( 'timed out waiting for existing dev wrapper to boot' );
		process.exit( 2 );
	}
	console.log( `dev up (pid ${ boot.pid }, cdp ${ boot.cdpPort })` );
	process.exit( 0 );
}

// Truly dead; spawn fresh. On macOS we open a visible Terminal.app window
// so the human can watch forge/Vite output live; elsewhere we fall back to
// a detached process writing to .vite/dev.log.
const logPath = path.join( projectRoot, '.vite', 'dev.log' );

function spawnDevInTerminal() {
	// Single-quote the path for the shell, then double-quote the whole
	// command for AppleScript. `activate` raises the Terminal window so
	// the user sees it.
	const shEscaped = projectRoot.replace( /'/g, `'\\''` );
	const shellCmd = `cd '${ shEscaped }' && npm start`;
	const asEscaped = shellCmd.replace( /\\/g, '\\\\' ).replace( /"/g, '\\"' );
	const appleScript = `tell application "Terminal"
	do script "${ asEscaped }"
	activate
end tell`;
	const osa = spawn( 'osascript', [ '-e', appleScript ], {
		stdio: 'ignore',
		detached: true,
	} );
	osa.unref();
	console.log( 'opened Terminal window running npm start' );
}

function spawnDevDetached() {
	fs.mkdirSync( path.dirname( logPath ), { recursive: true } );
	const logFd = fs.openSync( logPath, 'a' );
	const child = spawn( 'npm', [ 'start' ], {
		cwd: projectRoot,
		detached: true,
		stdio: [ 'ignore', logFd, logFd ],
		env: process.env,
	} );
	child.unref();
	console.log(
		`spawned npm start detached (pid ${ child.pid }); logs: ${ logPath }`
	);
}

if ( process.platform === 'darwin' ) {
	spawnDevInTerminal();
} else {
	spawnDevDetached();
}

const boot = await waitForBoot( existingBoot?.bootId ?? null, 60_000 );
if ( ! boot ) {
	const hint =
		process.platform === 'darwin'
			? 'check the Terminal window that opened'
			: `check ${ logPath }`;
	console.error( `timed out waiting for boot marker. ${ hint }` );
	process.exit( 2 );
}
console.log( `dev up (pid ${ boot.pid }, cdp ${ boot.cdpPort })` );
process.exit( 0 );
