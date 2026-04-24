// Wrapper for the Playwright MCP server.
//
// Each worktree's Electron dev build binds CDP on a port derived from the
// project root (see src/main/main.ts). This wrapper computes the same port
// and spawns @playwright/mcp pointing at it, so the MCP config in
// .mcp.json doesn't have to hard-code a number that would cross-wire
// parallel worktrees.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const rootHash = crypto
	.createHash( 'sha1' )
	.update( process.cwd() )
	.digest( 'hex' );
const cdpPort = 9222 + ( parseInt( rootHash.slice( 0, 4 ), 16 ) % 1000 );

const child = spawn(
	'npx',
	[
		'-y',
		'@playwright/mcp@latest',
		'--cdp-endpoint',
		`http://localhost:${ cdpPort }`,
	],
	{ stdio: 'inherit' }
);

child.on( 'exit', ( code, signal ) => {
	process.exit( code ?? ( signal ? 1 : 0 ) );
} );
