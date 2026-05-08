import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

test.describe( 'projects UI + per-project state', () => {
	test( 'Import button opens the link-project modal', async () => {
		const fixture = seedLinkedProjects( 0 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const addBtn = win.locator( '[data-testid=sidebar-add]' );
		const dialog = win.locator( '[data-testid=create-project-modal]' );

		await expect( addBtn ).toBeVisible();
		await expect( addBtn ).toContainText( 'Import' );
		await expect( dialog ).toHaveCount( 0 );

		await addBtn.click();
		await expect( dialog ).toBeVisible();

		await win.keyboard.press( 'Escape' );
		await expect( dialog ).toHaveCount( 0 );

		await app.close();
		fixture.cleanup();
	} );

	test( 'sidebar Recents lists drafts from all projects and opens them', async () => {
		const fixture = seedLinkedProjects( 2 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const seedDraft = (
			projectPath: string,
			fileName: string,
			title: string,
			mtime: number
		): void => {
			const draftsDir = path.join( projectPath, 'drafts' );
			fs.mkdirSync( draftsDir, { recursive: true } );
			const filePath = path.join( draftsDir, fileName );
			fs.writeFileSync(
				filePath,
				`---\ntitle: ${ title }\n---\n\nbody\n`,
				'utf-8'
			);
			fs.utimesSync( filePath, mtime / 1000, mtime / 1000 );
		};

		const projectA = fixture.projects[ 0 ];
		const projectB = fixture.projects[ 1 ];
		// Project B's draft is newer, so it leads the Recents list.
		seedDraft( projectA.path, 'alpha.md', 'Alpha', 1_700_000_000_000 );
		seedDraft( projectB.path, 'bravo.md', 'Bravo', 1_700_000_001_000 );

		const recentA = win.locator(
			`[data-testid="sidebar-recent-draft-${ projectA.id }-alpha.md"]`
		);
		const recentB = win.locator(
			`[data-testid="sidebar-recent-draft-${ projectB.id }-bravo.md"]`
		);

		await expect( recentA ).toBeVisible();
		await expect( recentB ).toBeVisible();

		// Click project A's draft — opens the draft editor for it.
		await recentA.click();
		await expect(
			win.locator( '[data-testid=screen-draft-editor]' )
		).toBeVisible();
		await expect( recentA ).toHaveAttribute( 'data-active', 'true' );

		await app.close();
		fixture.cleanup();
	} );

	test( 'sidebar Recents caps at 6 drafts, View all opens the Drafts view', async () => {
		const fixture = seedLinkedProjects( 2 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const seedDraft = (
			projectPath: string,
			fileName: string,
			mtime: number
		): void => {
			const draftsDir = path.join( projectPath, 'drafts' );
			fs.mkdirSync( draftsDir, { recursive: true } );
			const filePath = path.join( draftsDir, fileName );
			fs.writeFileSync(
				filePath,
				`---\ntitle: ${ fileName }\n---\n\nbody\n`,
				'utf-8'
			);
			fs.utimesSync( filePath, mtime / 1000, mtime / 1000 );
		};

		const [ projectA, projectB ] = fixture.projects;
		// Seed 7 drafts split across the two projects with strictly increasing
		// mtimes so we know exactly which six survive the slice.
		const base = 1_700_000_000_000;
		for ( let i = 0; i < 4; i++ ) {
			seedDraft( projectA.path, `a${ i }.md`, base + i * 1000 );
		}
		for ( let i = 0; i < 3; i++ ) {
			seedDraft( projectB.path, `b${ i }.md`, base + 4_000 + i * 1000 );
		}

		const rows = win.locator( '[data-testid^="sidebar-recent-draft-"]' );
		await expect( rows ).toHaveCount( 6 );

		// Oldest draft (a0.md) should be excluded by the slice.
		await expect(
			win.locator(
				`[data-testid="sidebar-recent-draft-${ projectA.id }-a0.md"]`
			)
		).toHaveCount( 0 );

		const viewAll = win.locator( '[data-testid=sidebar-recent-view-all]' );

		// Hidden by default (still in the DOM, just transparent). The
		// hover-driven reveal is a pure CSS rule; the click path is the
		// observable behavior we exercise here.
		await expect( viewAll ).toHaveCSS( 'opacity', '0' );

		await viewAll.dispatchEvent( 'click' );
		await expect(
			win.locator( '[data-testid=screen-drafts]' )
		).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );

	test( 'empty-state shows starter prompts when no chat is open', async () => {
		const fixture = seedLinkedProjects( 1 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const emptyState = win.locator( '[data-testid=empty-state]' );
		const ideasCard = win.locator(
			'[data-testid=empty-state-prompt-ideas]'
		);
		const draftCard = win.locator(
			'[data-testid=empty-state-prompt-draft]'
		);
		const chatTabs = win.locator( '[data-testid^=chat-tab-]' );
		const chatSelector = win.locator( '[data-testid=chat-selector]' );

		// The auto-created chat is open, so the empty-state suggestions stay
		// hidden while a chat is active.
		await expect( chatTabs ).toHaveCount( 1 );
		await expect( chatSelector ).toBeVisible();
		await expect( emptyState ).toHaveCount( 0 );

		// Close the only chat so there's no active chat — the empty-state
		// with starter prompts should appear.
		await win.locator( '[data-testid^=chat-close-]' ).first().click();
		await expect( chatTabs ).toHaveCount( 0 );
		await expect( emptyState ).toBeVisible();
		await expect( ideasCard ).toBeVisible();
		await expect( draftCard ).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );

	test( 'closed chats stay closed across app restarts', async () => {
		const fixture = seedLinkedProjects( 1 );
		const launch = (): ReturnType< typeof electron.launch > =>
			electron.launch( {
				executablePath: process.env.APP_EXECUTABLE,
				env: {
					...process.env,
					STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
				},
			} );

		// First session: close the auto-created chat.
		const app1 = await launch();
		const win1 = await app1.firstWindow();
		const tabs1 = win1.locator( '[data-testid^=chat-tab-]' );
		await expect( tabs1 ).toHaveCount( 1 );
		const tabTestId = await tabs1.first().getAttribute( 'data-testid' );
		expect( tabTestId ).toMatch( /^chat-tab-/ );
		const chatId = tabTestId!.replace( 'chat-tab-', '' );

		await win1.locator( `[data-testid=chat-close-${ chatId }]` ).click();
		await expect( tabs1 ).toHaveCount( 0 );

		// Wait for the renderer's persistence write to land. The IPC fire is
		// asynchronous, so polling the file is the deterministic gate before
		// shutting the app down.
		const prefsPath = path.join( fixture.userDataDir, 'ui-prefs.json' );
		await expect
			.poll( () => {
				try {
					const json = JSON.parse(
						fs.readFileSync( prefsPath, 'utf-8' )
					) as {
						closedChatIdsByProject?: Record< string, string[] >;
					};
					return json.closedChatIdsByProject?.[ 'seed-0' ] ?? null;
				} catch {
					return null;
				}
			} )
			.toEqual( [ chatId ] );

		await app1.close();

		// Second session: same userData dir, the closed chat should not
		// reappear and no auto-create should fire (the chat still exists on
		// disk, just hidden).
		const app2 = await launch();
		const win2 = await app2.firstWindow();
		const tabs2 = win2.locator( '[data-testid^=chat-tab-]' );
		const emptyState2 = win2.locator( '[data-testid=empty-state]' );
		const composerInput = win2.locator( '[data-testid=chat-input]' );

		await expect( emptyState2 ).toBeVisible();
		// Tabs should never appear on this run — assert via the negative.
		await expect( tabs2 ).toHaveCount( 0 );
		// And the composer must stay disabled, since there's no active chat
		// (the previously-only chat is closed and shouldn't be re-picked).
		await expect( composerInput ).toBeDisabled();

		await app2.close();
		fixture.cleanup();
	} );

	test( 'closing the only chat hides the chats toolbar but keeps the empty-state', async () => {
		const fixture = seedLinkedProjects( 1 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const emptyState = win.locator( '[data-testid=empty-state]' );
		const chatSelector = win.locator( '[data-testid=chat-selector]' );
		const chatTabs = win.locator( '[data-testid^=chat-tab-]' );

		// Wait for the auto-created chat tab. With a chat open the empty-state
		// stays hidden.
		await expect( chatTabs ).toHaveCount( 1 );
		await expect( chatSelector ).toBeVisible();
		await expect( emptyState ).toHaveCount( 0 );

		// Close that chat — there are no visible chats left, so the toolbar
		// (the orphaned + / history icons in the original screenshot) should
		// disappear, and now the empty state appears since no chat is open.
		const closeBtn = win.locator( '[data-testid^=chat-close-]' ).first();
		await closeBtn.click();

		await expect( chatTabs ).toHaveCount( 0 );
		await expect( chatSelector ).toHaveCount( 0 );
		await expect( emptyState ).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );
} );
