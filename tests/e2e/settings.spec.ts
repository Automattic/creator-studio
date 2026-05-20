import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

test( 'settings: existing key is never displayed; inline save replaces it; leaving without saving preserves it', async () => {
	const fixture = seedLinkedProjects( 1 );
	const envDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-env-e2e-' ) );
	const envPath = path.join( envDir, '.env' );
	// Seed a pre-existing key + an unrelated var so we can prove (a) the
	// screen never reflects the saved value into the input, (b) leaving
	// without saving does not clobber it, (c) Save upserts and preserves
	// other lines.
	fs.writeFileSync(
		envPath,
		'EXISTING=value\nANTHROPIC_API_KEY=sk-ant-original\n',
		'utf-8'
	);
	// Pin api-key auth mode so the API-key section is shown deterministically
	// (otherwise resolveInitialAuthMode probes the local claude binary).
	fs.writeFileSync(
		path.join( fixture.userDataDir, 'ui-prefs.json' ),
		JSON.stringify( { authMode: 'api-key' } ),
		'utf-8'
	);

	const app = await electron.launch( {
		executablePath: process.env.APP_EXECUTABLE,
		env: {
			...process.env,
			STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			STUDIO_WRITE_ENV_FILE: envPath,
			ANTHROPIC_API_KEY: 'sk-ant-original',
		},
	} );
	const win = await app.firstWindow();

	const gear = win.locator( '[data-testid=sidebar-settings]' );
	await expect( gear ).toBeVisible();
	await gear.click();

	const screen = win.locator( '[data-testid=screen-settings]' );
	const input = win.locator( '[data-testid=settings-input-api-key]' );
	const toggle = win.locator( '[data-testid=settings-toggle-visibility]' );
	const save = win.locator( '[data-testid=settings-save-key]' );

	await expect( screen ).toBeVisible();
	await expect( screen ).toHaveAttribute( 'data-auth-mode', 'api-key' );
	// Critical: the saved key is never reflected into the input.
	await expect( input ).toHaveValue( '' );
	await expect( input ).toHaveAttribute( 'type', 'password' );
	await expect( screen ).toHaveAttribute( 'data-key-set', 'true' );

	// "Get one at console.anthropic.com" links to the keys page. The link
	// uses shell.openExternal at click time; the URL is mirrored onto a
	// data-href attribute fed by the same constant, which we assert here so
	// a typo in either the visible link or the click handler is caught.
	const link = win.locator( '[data-testid=settings-get-key-link]' );
	await expect( link ).toHaveText( 'console.anthropic.com' );
	await expect( link ).toHaveAttribute(
		'data-href',
		'https://console.anthropic.com/settings/keys'
	);
	// Empty input → Save is disabled (so there's no way to accidentally
	// clear the saved key) and Show has nothing to reveal.
	await expect( save ).toBeDisabled();
	await expect( toggle ).toBeDisabled();

	// Leaving Settings without typing leaves the saved key alone.
	await win.locator( '[data-testid=nav-home]' ).click();
	await expect( screen ).toHaveCount( 0 );
	const afterLeave = await win.evaluate( () => window.api.settings.get() );
	expect( afterLeave.anthropicApiKey ).toBe( 'sk-ant-original' );

	// Re-open, type a new key, toggle visibility, save inline.
	await gear.click();
	await expect( screen ).toBeVisible();
	await expect( input ).toHaveValue( '' );
	await expect( toggle ).toBeDisabled();
	await input.fill( 'sk-ant-replacement' );
	await expect( toggle ).toBeEnabled();
	await toggle.click();
	await expect( input ).toHaveAttribute( 'type', 'text' );
	await expect( save ).toBeEnabled();
	await save.click();

	// Inline save: the screen stays put — the input clears and a
	// confirmation appears in place of the help text.
	await expect( input ).toHaveValue( '' );
	await expect(
		win.locator( '[data-testid=settings-key-saved]' )
	).toBeVisible();

	const afterSave = await win.evaluate( () => window.api.settings.get() );
	expect( afterSave.anthropicApiKey ).toBe( 'sk-ant-replacement' );

	const envContents = fs.readFileSync( envPath, 'utf-8' );
	expect( envContents ).toBe(
		'EXISTING=value\nANTHROPIC_API_KEY=sk-ant-replacement\n'
	);

	await app.close();
	fixture.cleanup();
	fs.rmSync( envDir, { recursive: true, force: true } );
} );
