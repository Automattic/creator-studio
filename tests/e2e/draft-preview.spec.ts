import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

// Verifies the click-on-draft-card behavior without depending on the agent
// finishing its turn. The chat is created and the preview is shown before
// `agent:send` even starts streaming, so the UI assertions resolve quickly
// even if no API key is set (the assistant bubble will just error out).
test.describe( 'draft cards: preview on click, chat via menu', () => {
	test.describe.configure( { retries: 1, timeout: 60_000 } );

	test( 'click → preview only; menu Chat creates linked chat; second card click reuses preview', async () => {
		const fixture = seedLinkedProjects( 1, {
			'drafts/foo.md': '# Foo draft\n\nSome body text.\n',
		} );
		const project = fixture.projects[ 0 ];

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		// Wait for the auto-created default chat tab so we can baseline the
		// count before clicking the draft card.
		const realChatTabs = win.locator(
			'[data-testid^=chat-tab-]:not([data-testid^="chat-tab-running-"])'
		);
		await expect( realChatTabs ).toHaveCount( 1 );

		// The drafts group is collapsed by default — expand it so the cards
		// render.
		const draftsGroup = win.locator(
			'[data-testid=resources-group-drafts]'
		);
		await expect( draftsGroup ).toBeVisible();
		await win
			.locator( '[data-testid=resources-group-collapse-drafts]' )
			.click();
		const draftCard = win.locator(
			'[data-testid="resources-card-drafts-foo.md"]'
		);
		await expect( draftCard ).toBeVisible();

		// Card click → preview only, no new chat tab.
		await draftCard.click();
		const preview = win.locator( '[data-testid=draft-preview]' );
		await expect( preview ).toBeVisible();
		await expect(
			win.locator( '[data-testid=draft-preview-title]' )
		).toHaveText( 'foo.md' );
		await expect(
			win.locator( '[data-testid=draft-preview-body]' )
		).toContainText( 'Some body text' );
		// Resources grid should no longer be in the DOM while previewing.
		await expect(
			win.locator( '[data-testid=resources-grid]' )
		).toHaveCount( 0 );
		// No new chat created from a plain card click.
		await expect( realChatTabs ).toHaveCount( 1 );

		// Back button restores the resources grid.
		await win.locator( '[data-testid=draft-preview-back]' ).click();
		await expect( preview ).toHaveCount( 0 );
		await expect(
			win.locator( '[data-testid=resources-grid]' )
		).toBeVisible();
		await expect( draftCard ).toBeVisible();

		// Open the per-card action menu and pick "Chat".
		await win
			.locator(
				'[data-testid="resources-card-drafts-foo.md-menu-button"]'
			)
			.click();
		await win.locator( '[data-testid=draft-action-chat]' ).click();
		await expect( preview ).toBeVisible();

		// Now the second chat tab should appear and become active.
		await expect( realChatTabs ).toHaveCount( 2 );
		const activeTab = win.locator(
			'[data-testid^=chat-tab-]:not([data-testid^="chat-tab-running-"])[data-active="true"]'
		);
		await expect( activeTab ).toContainText( 'foo' );

		// chats.json should record the draftPath link.
		const chatsJsonPath = path.join(
			project.path,
			'.studio-write',
			'chats.json'
		);
		await expect
			.poll(
				() => {
					if ( ! fs.existsSync( chatsJsonPath ) ) {
						return null;
					}
					const parsed = JSON.parse(
						fs.readFileSync( chatsJsonPath, 'utf-8' )
					) as { chats: Array< { draftPath?: string } > };
					return parsed.chats.some(
						( c ) => c.draftPath === 'foo.md'
					);
				},
				{ timeout: 10_000 }
			)
			.toBe( true );

		// Go back to the grid and re-click the card — preview returns,
		// existing draft chat still in place (count stays at 2).
		await win.locator( '[data-testid=draft-preview-back]' ).click();
		await draftCard.click();
		await expect( preview ).toBeVisible();
		await expect( realChatTabs ).toHaveCount( 2 );

		await app.close();
		fixture.cleanup();
	} );

	test( 'cards in non-drafts groups stay inert (rendered as <article>)', async () => {
		const fixture = seedLinkedProjects( 1, {
			'published/already.md': '# Already published\n',
			'notes/random.md': '# Random note\n',
			'drafts/clickable.md': '# Clickable\n',
		} );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		// All three groups start collapsed; expand them.
		await win
			.locator( '[data-testid=resources-group-collapse-drafts]' )
			.click();
		await win
			.locator( '[data-testid=resources-group-collapse-published]' )
			.click();
		await win
			.locator( '[data-testid=resources-group-collapse-notes]' )
			.click();

		// Drafts card is a <button> (clickable); other groups stay <article>.
		const draftsCard = win.locator(
			'[data-testid="resources-card-drafts-clickable.md"]'
		);
		await expect( draftsCard ).toBeVisible();
		await expect( draftsCard ).toHaveJSProperty( 'tagName', 'BUTTON' );

		const publishedCard = win.locator(
			'[data-testid="resources-card-published-already.md"]'
		);
		await expect( publishedCard ).toBeVisible();
		await expect( publishedCard ).toHaveJSProperty( 'tagName', 'ARTICLE' );

		const notesCard = win.locator(
			'[data-testid="resources-card-notes-random.md"]'
		);
		await expect( notesCard ).toBeVisible();
		await expect( notesCard ).toHaveJSProperty( 'tagName', 'ARTICLE' );

		await app.close();
		fixture.cleanup();
	} );
} );
