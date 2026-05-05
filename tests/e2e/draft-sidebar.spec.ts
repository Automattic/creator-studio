import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

function writeDraft(
	projectPath: string,
	fileName: string,
	body: string
): void {
	const dir = path.join( projectPath, 'drafts' );
	fs.mkdirSync( dir, { recursive: true } );
	fs.writeFileSync( path.join( dir, fileName ), body, 'utf-8' );
}

const SAMPLE_BODY = [
	'---',
	'title: Sidebar draft',
	'---',
	'',
	'# Sidebar draft',
	'',
	'Body for the sidebar e2e.',
].join( '\n' );

test.describe( 'draft editor right sidebar', () => {
	test( 'rail shows three icons, panel opens, switches, and closes', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'sidebar.md', SAMPLE_BODY );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await win.locator( '[data-testid=nav-drafts]' ).click();
		await win
			.locator( `[data-testid="draft-row-${ project.id }-sidebar.md"]` )
			.click();
		await expect(
			win.locator( '[data-testid=screen-draft-editor]' )
		).toBeVisible();

		const sidebar = win.locator( '[data-testid=draft-sidebar]' );
		await expect( sidebar ).toBeVisible();

		// All three rail icons exist.
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-chat]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-checks]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-outline]' )
		).toBeVisible();

		// Open Checks tab. Panel renders the placeholder for that section.
		await win.locator( '[data-testid=draft-sidebar-tab-checks]' ).click();
		await expect( sidebar ).toHaveAttribute( 'data-open', 'true' );
		await expect(
			win.locator( '[data-testid=draft-checks-panel]' )
		).toBeVisible();

		// Switch to Outline.
		await win.locator( '[data-testid=draft-sidebar-tab-outline]' ).click();
		await expect(
			win.locator( '[data-testid=draft-outline-panel]' )
		).toBeVisible();

		// Close via the × button.
		await win.locator( '[data-testid=draft-sidebar-close]' ).click();
		await expect( sidebar ).toHaveAttribute( 'data-open', 'false' );

		await app.close();
		fixture.cleanup();
	} );

	test( 'chat tab does not surface the draft chat in the project recent list', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'sidebar.md', SAMPLE_BODY );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await win.locator( '[data-testid=nav-drafts]' ).click();
		await win
			.locator( `[data-testid="draft-row-${ project.id }-sidebar.md"]` )
			.click();
		await win.locator( '[data-testid=draft-sidebar-tab-chat]' ).click();
		// Force-create the draft chat record on disk by waiting for the panel.
		await expect(
			win.locator( '[data-testid=draft-chat-panel]' )
		).toBeVisible();

		// Bounce back to the project view; the sidebar's "Recent" list should
		// still be empty — the draft chat must not surface there.
		await win.locator( '[data-testid=draft-editor-back]' ).click();
		await expect(
			win.locator( '[data-testid=sidebar-recent-empty]' )
		).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );
} );
