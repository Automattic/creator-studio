import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';
import { gotoDrafts } from '../helpers/nav';

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
	test( 'rail shows four icons, panel opens, switches, and closes', async () => {
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

		await gotoDrafts( win );
		await win
			.locator( `[data-testid="draft-row-${ project.id }-sidebar.md"]` )
			.click();
		await expect(
			win.locator( '[data-testid=screen-draft-editor]' )
		).toBeVisible();

		const sidebar = win.locator( '[data-testid=draft-sidebar]' );
		await expect( sidebar ).toBeVisible();

		// All four rail icons exist.
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-chat]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-checks]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-outline]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-same-project]' )
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

	test( 'Same project tab lists peer drafts and swaps the editor in place', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'sidebar.md', SAMPLE_BODY );
		writeDraft(
			project.path,
			'peer.md',
			[
				'---',
				'title: Peer draft',
				'---',
				'',
				'# Peer draft',
				'',
				'Different body.',
			].join( '\n' )
		);

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await gotoDrafts( win );
		await win
			.locator( `[data-testid="draft-row-${ project.id }-sidebar.md"]` )
			.click();
		await expect(
			win.locator( '[data-testid=screen-draft-editor]' )
		).toBeVisible();

		await win
			.locator( '[data-testid=draft-sidebar-tab-same-project]' )
			.click();
		await expect(
			win.locator( '[data-testid=draft-same-panel]' )
		).toBeVisible();

		// Both drafts surface; the open one is marked current.
		const rows = win.locator( '[data-testid=draft-same-row]' );
		await expect( rows ).toHaveCount( 2 );
		await expect(
			rows.filter( { has: win.locator( 'text=Sidebar draft' ) } )
		).toHaveAttribute( 'data-current', 'true' );

		// Clicking the peer swaps the editor; the new row becomes current.
		await rows.filter( { has: win.locator( 'text=Peer draft' ) } ).click();
		await expect(
			rows.filter( { has: win.locator( 'text=Peer draft' ) } )
		).toHaveAttribute( 'data-current', 'true' );
		// Sidebar tab survived the swap.
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-same-project]' )
		).toHaveAttribute( 'data-active', 'true' );

		// "Open project canvas" exits the editor.
		await win.locator( '[data-testid=draft-same-open-canvas]' ).click();
		await expect(
			win.locator( '[data-testid=draft-sidebar]' )
		).toHaveCount( 0 );

		await app.close();
		fixture.cleanup();
	} );

	test( 'opening the draft chat tab does not add a chat row to the sidebar recents', async () => {
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

		await gotoDrafts( win );
		await win
			.locator( `[data-testid="draft-row-${ project.id }-sidebar.md"]` )
			.click();
		await win.locator( '[data-testid=draft-sidebar-tab-chat]' ).click();
		// Force-create the draft chat record on disk by waiting for the panel.
		await expect(
			win.locator( '[data-testid=draft-chat-panel]' )
		).toBeVisible();

		// Bounce back to the project view. The sidebar Recents is drafts-only,
		// so it should show exactly the seeded draft and no chat row.
		await win.locator( '[data-testid=draft-editor-back]' ).click();
		const recentRows = win.locator(
			'[data-testid^="sidebar-recent-draft-"]'
		);
		await expect( recentRows ).toHaveCount( 1 );
		await expect(
			win.locator(
				`[data-testid="sidebar-recent-draft-${ project.id }-sidebar.md"]`
			)
		).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );
} );
