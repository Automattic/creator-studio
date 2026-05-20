import { defineConfig } from 'vite';

export default defineConfig( {
	build: {
		// turndown's ESM build (`turndown.es.js`, picked via its `module`
		// field) contains a bare `require('@mixmark-io/domino')` for the
		// Node DOM fallback. Rollup leaves `require()` in ES modules
		// untouched, so domino was externalized and missing from the
		// packaged asar (dev worked only because node_modules was on disk).
		// Transforming require() in mixed modules bundles domino inline.
		commonjsOptions: {
			transformMixedEsModules: true,
		},
	},
} );
