import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses';
import { FuseState } from '@electron/fuses/dist/constants';

const TEST_BUILD_MARKER = 'out/.test-build';

export default async function globalSetup() {
	const repoRoot = path.join( __dirname, '..' );
	const arch = process.arch; // 'arm64' | 'x64'
	const appDir = path.join(
		repoRoot,
		`out/CreatorsStudio-darwin-${ arch }/CreatorsStudio.app`
	);
	const executable = path.join( appDir, 'Contents/MacOS/CreatorsStudio' );
	const marker = path.join( repoRoot, TEST_BUILD_MARKER );

	// Re-package if any of:
	//  - binary is missing
	//  - marker is missing (never packaged, or manually invalidated)
	//  - binary exists but its fuses don't match a TEST_BUILD=1 build.
	// The fuse check catches the footgun of a plain `npm run package`
	// overwriting a prior test build while leaving the marker untouched —
	// without it, Playwright's `--inspect=0` is silently ignored and
	// `electron.launch` hangs until the 180s test timeout.
	let needsPackage =
		! fs.existsSync( executable ) || ! fs.existsSync( marker );
	if ( ! needsPackage ) {
		try {
			const wire = await getCurrentFuseWire( appDir );
			if (
				wire[ FuseV1Options.EnableNodeCliInspectArguments ] !==
				FuseState.ENABLE
			) {
				console.log(
					'[global-setup] Existing build has EnableNodeCliInspectArguments disabled; re-packaging.'
				);
				needsPackage = true;
			}
		} catch ( err ) {
			console.log(
				`[global-setup] Could not read fuses from existing build (${
					err instanceof Error ? err.message : String( err )
				}); re-packaging.`
			);
			needsPackage = true;
		}
	}

	if ( needsPackage ) {
		console.log( '[global-setup] Packaging Electron test build…' );
		execSync( 'npm run package', {
			cwd: repoRoot,
			stdio: 'inherit',
			env: { ...process.env, TEST_BUILD: '1' },
		} );
		fs.mkdirSync( path.dirname( marker ), { recursive: true } );
		fs.writeFileSync( marker, new Date().toISOString() );
	}

	if ( ! fs.existsSync( executable ) ) {
		throw new Error(
			`Packaged Electron executable not found at ${ executable }. ` +
				`Did 'npm run package' complete?`
		);
	}

	process.env.APP_EXECUTABLE = executable;
}
