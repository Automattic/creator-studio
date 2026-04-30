import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

test.describe( 'projects UI + per-project state', () => {
	test( '+ dropdown renders "Link project" menu item and closes on escape', async () => {
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
		const menu = win.locator( '[data-testid=sidebar-add-menu]' );
		const linkItem = win.locator(
			'[data-testid=sidebar-add-menu-link-project]'
		);

		await expect( addBtn ).toBeVisible();
		await expect( menu ).toHaveCount( 0 );

		await addBtn.click();
		await expect( menu ).toBeVisible();
		await expect( linkItem ).toBeVisible();
		await expect( linkItem ).toContainText( 'Link project' );
		await expect( addBtn ).toHaveAttribute( 'aria-expanded', 'true' );

		await win.keyboard.press( 'Escape' );
		await expect( menu ).toHaveCount( 0 );
		await expect( addBtn ).toHaveAttribute( 'aria-expanded', 'false' );

		await app.close();
		fixture.cleanup();
	} );

	test( 'switching projects via the Recent list preserves each project transcript', async () => {
		const fixture = seedLinkedProjects( 2 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		// Seed persisted state for both projects so each shows up in "Recent"
		// (lastMessageAt is what makes a chat surface there).
		const seedProjectState = (
			projectPath: string,
			chatId: string,
			messages: Array< { kind: 'user' | 'assistant'; text: string } >
		): void => {
			const store = path.join( projectPath, '.studio-write' );
			const chatsDir = path.join( store, 'chats' );
			fs.mkdirSync( chatsDir, { recursive: true } );
			fs.writeFileSync(
				path.join( store, 'chats.json' ),
				JSON.stringify( {
					chats: [
						{
							id: chatId,
							sessionId: null,
							createdAt: 1,
							lastMessageAt: 1 + messages.length,
						},
					],
				} ),
				'utf-8'
			);
			const lines = messages.map( ( m, i ) =>
				JSON.stringify( {
					kind: m.kind,
					id: `${ m.kind }-${ i }`,
					text: m.text,
					at: 1 + i,
				} )
			);
			fs.writeFileSync(
				path.join( chatsDir, `${ chatId }.jsonl` ),
				lines.join( '\n' ) + '\n',
				'utf-8'
			);
		};

		const projectA = fixture.projects[ 0 ];
		const projectB = fixture.projects[ 1 ];
		// Project B is more recently active, so it leads the Recent list.
		seedProjectState( projectA.path, 'chat-a', [
			{ kind: 'user', text: 'hello A' },
			{ kind: 'assistant', text: 'reply A' },
		] );
		seedProjectState( projectB.path, 'chat-b', [
			{ kind: 'user', text: 'hello B' },
		] );
		// Project B's lastMessageAt (2) > project A's (3)? Adjust: bump B.
		const metaB = path.join( projectB.path, '.studio-write', 'chats.json' );
		fs.writeFileSync(
			metaB,
			JSON.stringify( {
				chats: [
					{
						id: 'chat-b',
						sessionId: null,
						createdAt: 1,
						lastMessageAt: 999,
					},
				],
			} ),
			'utf-8'
		);

		const recentA = win.locator( '[data-testid=sidebar-recent-chat-a]' );
		const recentB = win.locator( '[data-testid=sidebar-recent-chat-b]' );
		const transcript = win.locator( '[data-testid=transcript]' );

		// Project A auto-selected; persisted messages hydrated.
		await expect(
			transcript.locator( '[data-testid=bubble-user]' )
		).toContainText( 'hello A' );

		// Both recent entries render.
		await expect( recentA ).toBeVisible();
		await expect( recentB ).toBeVisible();

		// Click into project B's chat — transcript switches.
		await recentB.click();
		await expect( recentB ).toHaveAttribute( 'data-active', 'true' );
		await expect(
			transcript.locator( '[data-testid=bubble-user]' )
		).toContainText( 'hello B' );

		// Back to A — transcript restored.
		await recentA.click();
		await expect( recentA ).toHaveAttribute( 'data-active', 'true' );
		await expect(
			transcript.locator( '[data-testid=bubble-user]' )
		).toContainText( 'hello A' );

		await app.close();
		fixture.cleanup();
	} );

	test( 'empty-state shows starter prompts', async () => {
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

		await expect( emptyState ).toBeVisible();
		await expect( ideasCard ).toBeVisible();
		await expect( draftCard ).toBeVisible();

		// The auto-created chat means one tab is visible, so the chats toolbar
		// (and its + / history buttons) should be visible.
		await expect( chatTabs ).toHaveCount( 1 );
		await expect( chatSelector ).toBeVisible();

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

		// Wait for the auto-created chat tab.
		await expect( chatTabs ).toHaveCount( 1 );
		await expect( chatSelector ).toBeVisible();
		await expect( emptyState ).toBeVisible();

		// Close that chat — there are no visible chats left, so the toolbar
		// (the orphaned + / history icons in the original screenshot) should
		// disappear, but the empty state is still up since there are no
		// messages.
		const closeBtn = win.locator( '[data-testid^=chat-close-]' ).first();
		await closeBtn.click();

		await expect( chatTabs ).toHaveCount( 0 );
		await expect( chatSelector ).toHaveCount( 0 );
		await expect( emptyState ).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );
} );
