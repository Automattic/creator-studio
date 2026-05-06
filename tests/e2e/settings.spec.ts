import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

test( 'settings: gear opens the modal, save persists the API key to .env and process.env', async () => {
	const fixture = seedLinkedProjects( 1 );
	const envDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-env-e2e-' ) );
	const envPath = path.join( envDir, '.env' );
	// Seed an unrelated var so we can prove writeApiKey preserves other lines.
	fs.writeFileSync( envPath, 'EXISTING=value\n', 'utf-8' );

	const app = await electron.launch( {
		executablePath: process.env.APP_EXECUTABLE,
		env: {
			...process.env,
			STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			STUDIO_WRITE_ENV_FILE: envPath,
			// Start with no key so we can assert the value flows from the modal
			// all the way into the main process and the .env file.
			ANTHROPIC_API_KEY: '',
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

	await expect( modal ).toBeVisible();
	await expect( input ).toHaveValue( '' );
	await expect( input ).toHaveAttribute( 'type', 'password' );

	await toggle.click();
	await expect( input ).toHaveAttribute( 'type', 'text' );

	await input.fill( 'sk-ant-test-key-123' );
	await save.click();

	await expect( modal ).toHaveCount( 0 );

	// The renderer's view of the value matches what we typed.
	const fromRenderer = await win.evaluate( () => window.api.settings.get() );
	expect( fromRenderer.anthropicApiKey ).toBe( 'sk-ant-test-key-123' );

	// The .env file picked up the new key and kept the existing var.
	const envContents = fs.readFileSync( envPath, 'utf-8' );
	expect( envContents ).toBe(
		'EXISTING=value\nANTHROPIC_API_KEY=sk-ant-test-key-123\n'
	);

	await app.close();
	fixture.cleanup();
	fs.rmSync( envDir, { recursive: true, force: true } );
} );
