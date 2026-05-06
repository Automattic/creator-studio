import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

test( 'settings: existing key is never displayed; saving replaces it; cancel preserves it', async () => {
	const fixture = seedLinkedProjects( 1 );
	const envDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-env-e2e-' ) );
	const envPath = path.join( envDir, '.env' );
	// Seed a pre-existing key + an unrelated var so we can prove (a) the
	// modal never reflects the saved value into the input, (b) Cancel does
	// not clobber it, (c) Save upserts and preserves other lines.
	fs.writeFileSync(
		envPath,
		'EXISTING=value\nANTHROPIC_API_KEY=sk-ant-original\n',
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

	const modal = win.locator( '[data-testid=settings-modal]' );
	const input = win.locator( '[data-testid=settings-input-api-key]' );
	const toggle = win.locator( '[data-testid=settings-toggle-visibility]' );
	const save = win.locator( '[data-testid=settings-save]' );
	const cancel = win.locator( '[data-testid=settings-cancel]' );

	await expect( modal ).toBeVisible();
	// Critical: the saved key is never reflected into the input.
	await expect( input ).toHaveValue( '' );
	await expect( input ).toHaveAttribute( 'type', 'password' );
	await expect( modal ).toHaveAttribute( 'data-key-set', 'true' );

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
	// Empty input → Save is disabled (so "open and immediately Save" can't
	// accidentally clear the saved key).
	await expect( save ).toBeDisabled();

	// Cancel without typing leaves the saved key alone.
	await cancel.click();
	await expect( modal ).toHaveCount( 0 );
	const afterCancel = await win.evaluate( () => window.api.settings.get() );
	expect( afterCancel.anthropicApiKey ).toBe( 'sk-ant-original' );

	// Re-open, type a new key, toggle visibility, save.
	await gear.click();
	await expect( modal ).toBeVisible();
	await expect( input ).toHaveValue( '' );
	// Show/Hide is disabled until the user types something — there's no
	// saved-key value behind the dots to reveal, so toggling on empty
	// input is just a foot-gun.
	await expect( toggle ).toBeDisabled();
	await input.fill( 'sk-ant-replacement' );
	await expect( toggle ).toBeEnabled();
	await toggle.click();
	await expect( input ).toHaveAttribute( 'type', 'text' );
	await expect( save ).toBeEnabled();
	await save.click();
	await expect( modal ).toHaveCount( 0 );

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
