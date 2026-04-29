import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

function writeDraft(
	projectPath: string,
	fileName: string,
	body: string,
	mtime?: Date
): void {
	const dir = path.join( projectPath, 'drafts' );
	fs.mkdirSync( dir, { recursive: true } );
	const filePath = path.join( dir, fileName );
	fs.writeFileSync( filePath, body, 'utf-8' );
	if ( mtime ) {
		fs.utimesSync( filePath, mtime, mtime );
	}
}

test.describe( 'drafts view', () => {
	test( 'aggregates drafts across projects, newest first, with parsed metadata', async () => {
		const fixture = seedLinkedProjects( 2 );
		const [ projectA, projectB ] = fixture.projects;

		// Newer file in project B — should lead the list.
		writeDraft(
			projectB.path,
			'newer.md',
			[
				'---',
				'title: Newer post',
				'description: From frontmatter.',
				'---',
				'',
				'one two three four five',
			].join( '\n' ),
			new Date( '2026-04-29T10:00:00Z' )
		);
		// Older file in project A, no frontmatter — title from filename, description from first paragraph.
		writeDraft(
			projectA.path,
			'older-note.md',
			[
				'First paragraph of the older note.',
				'',
				'Second paragraph that should be ignored.',
			].join( '\n' ),
			new Date( '2026-04-20T10:00:00Z' )
		);

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await win.locator( '[data-testid=nav-drafts]' ).click();

		const screen = win.locator( '[data-testid=screen-drafts]' );
		await expect( screen ).toBeVisible();

		const rows = win.locator( '[data-testid^=draft-row-]' );
		await expect( rows ).toHaveCount( 2 );

		// Sort order: newest first.
		await expect( rows.nth( 0 ) ).toContainText( 'Newer post' );
		await expect( rows.nth( 0 ) ).toContainText( 'From frontmatter.' );
		await expect( rows.nth( 0 ) ).toContainText( '5 words' );
		await expect( rows.nth( 0 ) ).toContainText( projectB.label );

		await expect( rows.nth( 1 ) ).toContainText( 'older-note' );
		await expect( rows.nth( 1 ) ).toContainText(
			'First paragraph of the older note.'
		);
		await expect( rows.nth( 1 ) ).toContainText( projectA.label );

		// Click the project link on the first row → project view opens.
		await win
			.locator( `[data-testid="draft-from-${ projectB.id }-newer.md"]` )
			.click();
		await expect( win.locator( '[data-testid=project-title]' ) ).toHaveText(
			projectB.label
		);
		await expect( win.locator( '[data-testid=transcript]' ) ).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );

	test( 'empty state when no projects have any drafts', async () => {
		const fixture = seedLinkedProjects( 1 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await win.locator( '[data-testid=nav-drafts]' ).click();
		await expect(
			win.locator( '[data-testid=drafts-empty]' )
		).toBeVisible();
		await expect( win.locator( '[data-testid^=draft-row-]' ) ).toHaveCount(
			0
		);

		await app.close();
		fixture.cleanup();
	} );
} );
