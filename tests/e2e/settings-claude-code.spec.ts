import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

// These tests drive the Settings Sign-in-with-Claude flow without touching a
// real OAuth session. The main process honors STUDIO_WRITE_FAKE_AUTH_STATUS
// in claude-auth-status.ts: when set, the probe parses the env value instead
// of spawning the bundled binary, so we can fake every state (signed-in,
// signed-out, expired) deterministically.

test.describe.configure( { timeout: 60_000 } );

test( 'settings: fake signed-in session renders email + plan in claude-code mode', async () => {
	const fixture = seedLinkedProjects( 1 );
	const envDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-cc-' ) );
	const envPath = path.join( envDir, '.env' );

	const app = await electron.launch( {
		executablePath: process.env.APP_EXECUTABLE,
		env: {
			...process.env,
			STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			STUDIO_WRITE_ENV_FILE: envPath,
			ANTHROPIC_API_KEY: '',
			STUDIO_WRITE_FAKE_AUTH_STATUS: JSON.stringify( {
				signedIn: true,
				email: 'test@example.com',
				subscriptionType: 'max',
				authMethod: 'claude.ai',
			} ),
		},
	} );
	const win = await app.firstWindow();

	// Zero-config: first launch with no ui-prefs.json and a signed-in fake
	// status should land in claude-code mode automatically.
	await win.locator( '[data-testid=sidebar-settings]' ).click();
	const screen = win.locator( '[data-testid=screen-settings]' );
	await expect( screen ).toBeVisible();
	await expect( screen ).toHaveAttribute( 'data-auth-mode', 'claude-code' );

	const status = win.locator( '[data-testid=settings-claude-status]' );
	await expect( status ).toHaveAttribute( 'data-state', 'signed-in', {
		timeout: 10_000,
	} );
	await expect(
		win.locator( '[data-testid=settings-claude-email]' )
	).toHaveText( 'test@example.com' );
	await expect(
		win.locator( '[data-testid=settings-claude-plan]' )
	).toContainText( /max/i );

	// Switching to api-key mode reveals the API-key input + help link.
	await win.locator( '[data-testid=settings-auth-mode-api-key]' ).click();
	await expect( screen ).toHaveAttribute( 'data-auth-mode', 'api-key' );
	await expect(
		win.locator( '[data-testid=settings-input-api-key]' )
	).toBeVisible();

	await app.close();
	fixture.cleanup();
	fs.rmSync( envDir, { recursive: true, force: true } );
} );

test( 'settings: fake signed-out session shows the sign-in affordance in claude-code mode', async () => {
	const fixture = seedLinkedProjects( 1 );
	const envDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-cc-out-' ) );
	const envPath = path.join( envDir, '.env' );

	// Pre-seed authMode=claude-code so Settings opens straight into it even
	// though the fake probe will say signed-out.
	fs.writeFileSync(
		path.join( fixture.userDataDir, 'ui-prefs.json' ),
		JSON.stringify( { authMode: 'claude-code' } ),
		'utf-8'
	);

	const app = await electron.launch( {
		executablePath: process.env.APP_EXECUTABLE,
		env: {
			...process.env,
			STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			STUDIO_WRITE_ENV_FILE: envPath,
			ANTHROPIC_API_KEY: '',
			STUDIO_WRITE_FAKE_AUTH_STATUS: JSON.stringify( {
				signedIn: false,
			} ),
		},
	} );
	const win = await app.firstWindow();

	await win.locator( '[data-testid=sidebar-settings]' ).click();
	const screen = win.locator( '[data-testid=screen-settings]' );
	await expect( screen ).toBeVisible();
	await expect( screen ).toHaveAttribute( 'data-auth-mode', 'claude-code' );
	await expect(
		win.locator( '[data-testid=settings-claude-status]' )
	).toHaveAttribute( 'data-state', 'signed-out', { timeout: 10_000 } );

	// Sign-in button is present; we never click it (would spawn a Terminal).
	await expect(
		win.locator( '[data-testid=settings-claude-signin]' )
	).toBeVisible();

	await app.close();
	fixture.cleanup();
	fs.rmSync( envDir, { recursive: true, force: true } );
} );

test( 'settings: zero-config default writes authMode=api-key when no fake session', async () => {
	const fixture = seedLinkedProjects( 1 );
	const envDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-cc-api-' ) );
	const envPath = path.join( envDir, '.env' );

	const app = await electron.launch( {
		executablePath: process.env.APP_EXECUTABLE,
		env: {
			...process.env,
			STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			STUDIO_WRITE_ENV_FILE: envPath,
			ANTHROPIC_API_KEY: '',
			STUDIO_WRITE_FAKE_AUTH_STATUS: JSON.stringify( {
				signedIn: false,
			} ),
		},
	} );
	const win = await app.firstWindow();

	await win.locator( '[data-testid=sidebar-settings]' ).click();
	const screen = win.locator( '[data-testid=screen-settings]' );
	await expect( screen ).toBeVisible();
	// First-launch resolver saw signed-out → defaults to api-key.
	await expect( screen ).toHaveAttribute( 'data-auth-mode', 'api-key' );

	await app.close();

	// And the resolver actually persisted that choice to ui-prefs.json so
	// the next launch is a no-op.
	const persisted = JSON.parse(
		fs.readFileSync(
			path.join( fixture.userDataDir, 'ui-prefs.json' ),
			'utf-8'
		)
	);
	expect( persisted.authMode ).toBe( 'api-key' );

	fixture.cleanup();
	fs.rmSync( envDir, { recursive: true, force: true } );
} );
