import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Always re-package before the e2e run. A full `TEST_BUILD=1` package takes
// ~5s on this project; trying to cache it behind markers / fuse checks was
// the source of flaky "tests pass only after `rm -rf out`" failures.
export default async function globalSetup() {
	const repoRoot = path.join( __dirname, '..' );
	const appDir = path.join(
		repoRoot,
		`out/Studio Write-darwin-${ process.arch }/Studio Write.app`
	);
	const executable = path.join( appDir, 'Contents/MacOS/Studio Write' );

	console.log( '[global-setup] Packaging Electron test build…' );
	execSync( 'npm run package', {
		cwd: repoRoot,
		stdio: 'inherit',
		env: { ...process.env, TEST_BUILD: '1' },
	} );

	if ( ! fs.existsSync( executable ) ) {
		throw new Error(
			`Packaged Electron executable not found at ${ executable }. ` +
				`Did 'npm run package' complete?`
		);
	}

	process.env.APP_EXECUTABLE = executable;

	// Headless by default; `HEADED=1 npm run test:e2e` keeps windows visible
	// for debugging. Every spec spreads `...process.env` into
	// `electron.launch({ env })`, so this propagates to the packaged child.
	if ( ! process.env.HEADED ) {
		process.env.STUDIO_WRITE_HEADLESS = '1';
	}
}
