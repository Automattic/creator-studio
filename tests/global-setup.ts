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
		`out/CreatorsStudio-darwin-${ process.arch }/CreatorsStudio.app`
	);
	const executable = path.join( appDir, 'Contents/MacOS/CreatorsStudio' );

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
}
