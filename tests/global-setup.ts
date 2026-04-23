import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

	// Re-package if the binary or marker is missing, OR if the binary was
	// rebuilt outside of this setup (plain `npm run package` overwrites the
	// executable but leaves the marker behind — the resulting release build
	// has EnableNodeCliInspectArguments disabled and Playwright's debugger
	// can't attach, so `firstWindow()` hangs).
	const executableNewerThanMarker =
		fs.existsSync( executable ) &&
		fs.existsSync( marker ) &&
		fs.statSync( executable ).mtimeMs > fs.statSync( marker ).mtimeMs;
	const needsPackage =
		! fs.existsSync( executable ) ||
		! fs.existsSync( marker ) ||
		executableNewerThanMarker;

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
