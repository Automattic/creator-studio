// Agent-friendly Electron restart.
//
// Connects to the dev wrapper's local socket (see scripts/dev.mjs) and
// asks it to restart the Electron main/preload bundles. Blocks until the
// new process writes a fresh boot id to .vite/dev-boot.json, so callers
// can treat exit 0 as "app is back up with your changes".

import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const socketPath = path.join(
	os.tmpdir(),
	`studio-write-${ crypto
		.createHash( 'sha1' )
		.update( process.cwd() )
		.digest( 'hex' )
		.slice( 0, 12 ) }.sock`
);

const client = net.createConnection( socketPath );
let buf = '';

client.setEncoding( 'utf8' );
client.on( 'connect', () => {
	client.write( 'reload\n' );
} );
client.on( 'data', ( chunk ) => {
	buf += chunk;
} );
client.on( 'end', () => {
	const response = buf.trim();
	if ( response.startsWith( 'ok' ) ) {
		process.stdout.write( `${ response }\n` );
		process.exit( 0 );
	}
	process.stderr.write( `${ response || 'no response' }\n` );
	process.exit( 1 );
} );
client.on( 'error', ( err ) => {
	if ( err.code === 'ENOENT' || err.code === 'ECONNREFUSED' ) {
		process.stderr.write(
			`dev wrapper not running (no ${ socketPath }). start it with: npm start\n`
		);
	} else {
		process.stderr.write( `${ err.message }\n` );
	}
	process.exit( 1 );
} );
