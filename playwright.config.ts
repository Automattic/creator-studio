import { defineConfig } from '@playwright/test';

// .env (ANTHROPIC_API_KEY etc.) is loaded by tests/global-setup.ts: it runs
// in the runner process before any worker spawns, so the values propagate to
// workers the same way APP_EXECUTABLE does. Mutating process.env here in the
// config module is not reliable — workers don't observe it.

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
