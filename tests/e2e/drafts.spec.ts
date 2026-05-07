import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';
import { gotoDrafts } from '../helpers/nav';

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

		await gotoDrafts( win );

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
		await expect(
			win.locator( '[data-testid=screen-project]' )
		).toHaveAttribute( 'data-project-id', projectB.id );
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

		await gotoDrafts( win );
		await expect(
			win.locator( '[data-testid=drafts-empty]' )
		).toBeVisible();
		await expect( win.locator( '[data-testid^=draft-row-]' ) ).toHaveCount(
			0
		);

		await app.close();
		fixture.cleanup();
	} );

	test( 'tabs swap between Drafts and Done views in place', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;

		writeDraft(
			project.path,
			'live.md',
			'---\ntitle: Live\n---\n\nbody\n'
		);
		const doneDir = path.join( project.path, 'done' );
		fs.mkdirSync( doneDir, { recursive: true } );
		fs.writeFileSync(
			path.join( doneDir, 'archived.md' ),
			'---\ntitle: Archived\n---\n\nbody\n',
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

		await gotoDrafts( win );

		const draftsTab = win.locator( '[data-testid=library-tab-drafts]' );
		const doneTab = win.locator( '[data-testid=library-tab-done]' );

		await expect( draftsTab ).toHaveAttribute( 'data-active', 'true' );
		await expect( doneTab ).not.toHaveAttribute( 'data-active', 'true' );
		await expect(
			win.locator( `[data-testid="draft-row-${ project.id }-live.md"]` )
		).toBeVisible();

		await doneTab.click();
		await expect( doneTab ).toHaveAttribute( 'data-active', 'true' );
		await expect( draftsTab ).not.toHaveAttribute( 'data-active', 'true' );
		await expect(
			win.locator( '[data-testid=screen-done]' )
		).toBeVisible();
		await expect(
			win.locator(
				`[data-testid="draft-row-${ project.id }-archived.md"]`
			)
		).toBeVisible();
		await expect(
			win.locator( `[data-testid="draft-row-${ project.id }-live.md"]` )
		).toHaveCount( 0 );

		await draftsTab.click();
		await expect( draftsTab ).toHaveAttribute( 'data-active', 'true' );
		await expect(
			win.locator( '[data-testid=screen-drafts]' )
		).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );
} );
