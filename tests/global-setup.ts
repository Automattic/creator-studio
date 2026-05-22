import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Load .env (ANTHROPIC_API_KEY etc.) into the runner's process.env so the
// values reach the test workers — the same path APP_EXECUTABLE below takes.
// We parse it by hand rather than process.loadEnvFile(): on Node 20.19 that
// built-in silently drops the file's first line, so a .env containing only
// `ANTHROPIC_API_KEY=…` never loads and every agent spec aborts on the
// missing-key guard. Ambient shell env always wins over the file.
function loadDotEnv( repoRoot: string ): void {
	const envPath = path.join( repoRoot, '.env' );
	if ( ! fs.existsSync( envPath ) ) {
		return;
	}
	for ( const line of fs.readFileSync( envPath, 'utf8' ).split( /\r?\n/ ) ) {
		const trimmed = line.trim();
		if ( ! trimmed || trimmed.startsWith( '#' ) ) {
			continue;
		}
		const eq = trimmed.indexOf( '=' );
		if ( eq <= 0 ) {
			continue;
		}
		const key = trimmed.slice( 0, eq ).trim();
		let value = trimmed.slice( eq + 1 ).trim();
		if (
			value.length >= 2 &&
			( ( value.startsWith( '"' ) && value.endsWith( '"' ) ) ||
				( value.startsWith( "'" ) && value.endsWith( "'" ) ) )
		) {
			value = value.slice( 1, -1 );
		}
		// Fill in absent *and* empty vars — some shells export
		// `ANTHROPIC_API_KEY=` (empty), which must not shadow the .env value.
		// A non-empty ambient value still wins.
		if ( ! process.env[ key ] ) {
			process.env[ key ] = value;
		}
	}
}

// A spec that throws before its `app.close()` leaves the packaged Electron
// app running. Its memory-mapped framework files then make the postPackage
// ad-hoc `codesign` fail with EPERM ("Operation not permitted"), which aborts
// `npm run package` and every subsequent run. Kill any process launched from
// this worktree's build before repackaging so one leaked app can't poison the
// next run.
function killStaleAppProcesses( appDir: string ): void {
	if ( process.platform === 'win32' ) {
		return;
	}
	try {
		execSync( `pkill -f ${ JSON.stringify( appDir ) }`, {
			stdio: 'ignore',
		} );
		console.log( '[global-setup] Killed stale processes from out/.' );
	} catch {
		// pkill exits non-zero when nothing matched — the common, healthy case.
	}
}

// Always re-package before the e2e run. A full `TEST_BUILD=1` package takes
// ~5s on this project; trying to cache it behind markers / fuse checks was
// the source of flaky "tests pass only after `rm -rf out`" failures.
export default async function globalSetup() {
	const repoRoot = path.join( __dirname, '..' );
	loadDotEnv( repoRoot );
	const appDir = path.join(
		repoRoot,
		`out/Studio Write-darwin-${ process.arch }/Studio Write.app`
	);
	const executable = path.join( appDir, 'Contents/MacOS/Studio Write' );

	killStaleAppProcesses( appDir );
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
