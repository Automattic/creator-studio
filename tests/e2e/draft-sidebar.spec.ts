import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';
import { gotoDone, gotoDrafts } from '../helpers/nav';

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
			win.locator( '[data-testid=draft-sidebar-tab-share]' )
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

	test( 'chat tab + button creates a new chat; history popover lets you switch and delete', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'multi.md', SAMPLE_BODY );

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
			.locator( `[data-testid="draft-row-${ project.id }-multi.md"]` )
			.click();
		// Editor opens with the chat tab active by default — don't click it,
		// that would toggle the panel closed.
		await expect(
			win.locator( '[data-testid=draft-chat-panel]' )
		).toBeVisible();

		const addBtn = win.locator( '[data-testid=draft-chat-add]' );
		const historyBtn = win.locator( '[data-testid=draft-chat-history]' );
		await expect( addBtn ).toBeVisible();
		await expect( historyBtn ).toBeVisible();

		// Open history once — bootstrap should have ensured exactly one chat.
		await historyBtn.click();
		const popover = win.locator(
			'[data-testid=draft-chat-history-popover]'
		);
		await expect( popover ).toBeVisible();
		await expect(
			win.locator(
				'[data-testid^=draft-chat-history-item-]:not([data-testid*=item-delete-])'
			)
		).toHaveCount( 1 );

		// Close the popover, click + to make a second chat.
		await win
			.locator( '[data-testid=draft-chat-history-search]' )
			.press( 'Escape' );
		await expect( popover ).toHaveCount( 0 );
		await addBtn.click();

		// History should now show two chats; capture both ids and delete the one
		// that isn't currently active.
		await historyBtn.click();
		await expect( popover ).toBeVisible();
		const items = win.locator(
			'[data-testid^=draft-chat-history-item-]:not([data-testid*=item-delete-])'
		);
		await expect( items ).toHaveCount( 2 );
		const itemTestIds = await items.evaluateAll( ( els ) =>
			els.map( ( el ) => el.getAttribute( 'data-testid' ) )
		);
		const idA = itemTestIds[ 0 ]?.replace( 'draft-chat-history-item-', '' );
		const idB = itemTestIds[ 1 ]?.replace( 'draft-chat-history-item-', '' );
		expect( idA ).toBeTruthy();
		expect( idB ).toBeTruthy();
		expect( idA ).not.toBe( idB );

		// Switch to the first chat (assert it becomes active by re-opening).
		await win
			.locator( `[data-testid=draft-chat-history-item-${ idA }]` )
			.click();
		await expect( popover ).toHaveCount( 0 );
		await historyBtn.click();
		const activeItem = win.locator(
			'.chat-history-item[data-active="true"]'
		);
		await expect( activeItem ).toHaveCount( 1 );
		await expect(
			activeItem.locator(
				'[data-testid^=draft-chat-history-item-]:not([data-testid*=item-delete-])'
			)
		).toHaveAttribute( 'data-testid', `draft-chat-history-item-${ idA }` );

		// Delete the other (non-active) chat. The list shrinks to one.
		await win
			.locator( `[data-testid=draft-chat-history-item-delete-${ idB }]` )
			.click();
		await expect( items ).toHaveCount( 1 );

		await app.close();
		fixture.cleanup();
	} );

	test( 'project view rail: chat + checks are enabled, outline/share are hidden', async () => {
		const fixture = seedLinkedProjects( 1 );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await expect(
			win.locator( '[data-testid=screen-project]' )
		).toBeVisible();

		const chat = win.locator( '[data-testid=draft-sidebar-tab-chat]' );
		const checks = win.locator( '[data-testid=draft-sidebar-tab-checks]' );
		await expect( chat ).toBeVisible();
		await expect( chat ).toBeEnabled();
		// Checks are project-scoped resources (rules in <project>/checks/),
		// so the tab is editable from project view too — even without an
		// open draft.
		await expect( checks ).toBeVisible();
		await expect( checks ).toBeEnabled();
		// Outline + share need a draft body / headings, so they stay hidden
		// until a draft or done doc is opened in the editor.
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-outline]' )
		).toHaveCount( 0 );
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-share]' )
		).toHaveCount( 0 );

		await app.close();
		fixture.cleanup();
	} );

	test( 'done editor rail: all four tabs are enabled', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		const doneDir = path.join( project.path, 'done' );
		fs.mkdirSync( doneDir, { recursive: true } );
		fs.writeFileSync(
			path.join( doneDir, 'shipped.md' ),
			SAMPLE_BODY,
			'utf-8'
		);

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await gotoDone( win );
		await win
			.locator( `[data-testid="draft-row-${ project.id }-shipped.md"]` )
			.click();
		await expect(
			win.locator( '[data-testid=screen-draft-editor]' )
		).toBeVisible();

		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-chat]' )
		).toBeEnabled();
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-outline]' )
		).toBeEnabled();
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-share]' )
		).toBeEnabled();
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-checks]' )
		).toBeEnabled();

		await app.close();
		fixture.cleanup();
	} );
} );
