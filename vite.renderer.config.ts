import crypto from 'node:crypto';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Same per-worktree port derivation `src/main/main.ts` uses for CDP and
// `scripts/dev.mjs` uses for its reload socket: hash the project root so
// parallel worktrees land on distinct, deterministic Vite ports instead of
// racing for the 5173 → 5174 → 5175 sequential fallback. Without this, the
// first worktree to boot grabs 5173 and a second one ends up on whatever
// Vite finds free — which means `main.ts` gets injected with one port at
// build time and the renderer ends up served from another, and Playwright
// MCP attached to the wrong worktree's app silently. `strictPort: true`
// fails loud if our derived port is somehow taken (e.g. an old dev process
// is wedged) instead of silently falling back.
const rootHash = crypto
	.createHash( 'sha1' )
	.update( process.cwd() )
	.digest( 'hex' );
const port = 5173 + ( parseInt( rootHash.slice( 0, 4 ), 16 ) % 100 );

// https://vitejs.dev/config
export default defineConfig( {
	plugins: [ react() ],
	resolve: {
		dedupe: [ 'react', 'react-dom' ],
	},
	optimizeDeps: {
		include: [ 'react', 'react-dom', '@base-ui/react/menu' ],
	},
	server: {
		port,
		strictPort: true,
	},
} );
