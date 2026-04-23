import { defineConfig } from '@playwright/test';

// Load .env so ANTHROPIC_API_KEY set in the repo file (same convention the
// main process uses via process.loadEnvFile()) propagates to the test
// runner and its worker processes. Harmless if no .env exists.
try {
	process.loadEnvFile();
} catch {
	// no .env — rely on ambient shell env
}

export default defineConfig( {
	testDir: './tests/e2e',
	workers: 1,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	globalSetup: './tests/global-setup.ts',
	reporter: [ [ 'list' ] ],
	use: {
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
} );
