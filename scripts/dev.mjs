// Dev wrapper around `electron-forge start`.
//
// electron-forge rebuilds main/preload on save but only respawns Electron
// when the human types `rs` at its prompt. Agents can't do that from
// another terminal, so this wrapper keeps forge as a child process and
// exposes a Unix socket (`.vite/dev.sock`) any caller can poke to trigger
// the same restart. `npm run reload` is the intended caller.
//
// Socket path is project-relative so parallel worktrees don't collide.

import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const projectRoot = process.cwd();
const viteDir = path.join( projectRoot, '.vite' );
const bootPath = path.join( viteDir, 'dev-boot.json' );
// Socket lives under os.tmpdir() — electron-forge's vite plugin wipes
// `.vite/` on startup, which would unlink a socket binding placed in
// there even though the listening FD stays open. A stable per-worktree
// path (hashed project root) keeps parallel worktrees from colliding.
const socketPath = path.join(
	os.tmpdir(),
	`studio-write-${ crypto
		.createHash( 'sha1' )
		.update( projectRoot )
		.digest( 'hex' )
		.slice( 0, 12 ) }.sock`
);

fs.mkdirSync( viteDir, { recursive: true } );
try {
	fs.unlinkSync( socketPath );
} catch {}

const forgeBin = path.join(
	projectRoot,
	'node_modules',
	'.bin',
	'electron-forge'
);

const forge = spawn( forgeBin, [ 'start' ], {
	stdio: [ 'pipe', 'inherit', 'inherit' ],
	env: process.env,
} );

// Forward the user's keystrokes to forge so `rs` still works manually if
// the human wants it. `end: false` keeps forge's stdin open when our own
// process.stdin closes (e.g. on piped invocations).
process.stdin.pipe( forge.stdin, { end: false } );
process.stdin.on( 'error', () => {} );
forge.stdin.on( 'error', () => {} );

let forgeExited = false;
forge.on( 'exit', ( code, signal ) => {
	forgeExited = true;
	cleanup();
	process.exit( code ?? ( signal ? 1 : 0 ) );
} );

function cleanup() {
	try {
		fs.unlinkSync( socketPath );
	} catch {}
}

function readBootId() {
	try {
		return JSON.parse( fs.readFileSync( bootPath, 'utf8' ) ).bootId ?? null;
	} catch {
		return null;
	}
}

function waitForBootIdChange( oldId, timeoutMs = 30_000 ) {
	return new Promise( ( resolve ) => {
		const start = Date.now();
		const timer = setInterval( () => {
			const current = readBootId();
			if ( current && current !== oldId ) {
				clearInterval( timer );
				resolve( { ok: true, bootId: current } );
			} else if ( Date.now() - start > timeoutMs ) {
				clearInterval( timer );
				resolve( { ok: false, bootId: current } );
			}
		}, 100 );
	} );
}

// Vite rebuilds main/preload in the background; sending `rs` before the
// rebuild lands would restart Electron with stale code. Wait until both
// bundles have been idle for a moment.
function settleBundles( settleMs = 300, timeoutMs = 5_000 ) {
	const bundles = [
		path.join( viteDir, 'build', 'main.js' ),
		path.join( viteDir, 'build', 'preload.js' ),
	];
	return new Promise( ( resolve ) => {
		const start = Date.now();
		const check = () => {
			const now = Date.now();
			const recent = bundles.some( ( p ) => {
				try {
					return now - fs.statSync( p ).mtimeMs < settleMs;
				} catch {
					return false;
				}
			} );
			if ( ! recent || now - start > timeoutMs ) {
				resolve();
			} else {
				setTimeout( check, 100 );
			}
		};
		check();
	} );
}

async function handleReload( socket ) {
	if ( forgeExited ) {
		socket.end( 'error: forge-exited\n' );
		return;
	}
	const before = readBootId();
	await settleBundles();
	forge.stdin.write( 'rs\n' );
	const result = await waitForBootIdChange( before );
	if ( result.ok ) {
		socket.end( `ok ${ result.bootId }\n` );
	} else {
		socket.end( 'timeout\n' );
	}
}

const server = net.createServer( ( socket ) => {
	let buf = '';
	socket.setEncoding( 'utf8' );
	socket.on( 'data', ( chunk ) => {
		buf += chunk;
		if ( ! buf.includes( '\n' ) ) {
			return;
		}
		const cmd = buf.split( '\n' )[ 0 ].trim();
		if ( cmd === 'reload' ) {
			handleReload( socket );
		} else {
			socket.end( `error: unknown-command ${ cmd }\n` );
		}
	} );
	socket.on( 'error', () => {} );
} );

server.on( 'error', ( err ) => {
	console.error( `[dev] socket server error: ${ err.message }` );
} );

server.listen( socketPath, () => {
	console.log( `[dev] reload socket: ${ socketPath }` );
} );

const shutdown = () => {
	cleanup();
	if ( ! forgeExited ) {
		forge.kill();
	}
};
process.on( 'SIGINT', shutdown );
process.on( 'SIGTERM', shutdown );
process.on( 'exit', cleanup );
