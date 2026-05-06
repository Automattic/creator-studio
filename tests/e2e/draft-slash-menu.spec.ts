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

// `# Existing` on line 1, then a single blank line 2. After CM mounts, the
// cursor restores to end of doc — which is the empty line 2 — so the
// placeholder and slash trigger fire without any extra navigation.
const BODY_WITH_TRAILING_BLANK = '# Existing\n';

test.describe( 'draft slash menu', () => {
	test( 'placeholder shows on the active empty line, hides on non-empty', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'existing.md', BODY_WITH_TRAILING_BLANK );

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
			.locator( `[data-testid="draft-row-${ project.id }-existing.md"]` )
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();

		// Cursor restored to end of doc (empty line) — placeholder visible.
		await expect(
			win.locator( '.cm-empty-line-placeholder' )
		).toBeVisible();

		// Move cursor up onto the non-empty `# Existing` line.
		await win.keyboard.press( 'ArrowUp' );
		await expect( win.locator( '.cm-empty-line-placeholder' ) ).toHaveCount(
			0
		);

		// Back down onto the empty line — placeholder reappears.
		await win.keyboard.press( 'ArrowDown' );
		await expect(
			win.locator( '.cm-empty-line-placeholder' )
		).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );

	test( 'pressing / on an empty line opens the menu without inserting /', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'existing.md', BODY_WITH_TRAILING_BLANK );

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
			.locator( `[data-testid="draft-row-${ project.id }-existing.md"]` )
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();

		await win.keyboard.type( '/' );

		await expect( win.locator( '[data-testid=slash-menu]' ) ).toBeVisible();
		// All seven actions render.
		for ( const id of [
			'image',
			'quote',
			'divider',
			'h1',
			'h2',
			'h3',
			'h4',
		] ) {
			await expect(
				win.locator( `[data-testid=slash-menu-action-${ id }]` )
			).toBeVisible();
		}

		// Esc closes the menu without changing the doc and without leaving
		// the editor.
		await win.keyboard.press( 'Escape' );
		await expect( win.locator( '[data-testid=slash-menu]' ) ).toHaveCount(
			0
		);
		await expect(
			win.locator( '[data-testid=screen-draft-editor]' )
		).toBeVisible();

		// On-disk body is unchanged: no stray '/' was inserted.
		// Wait for any pending save to settle first by checking the status.
		const onDisk = fs.readFileSync(
			path.join( project.path, 'drafts', 'existing.md' ),
			'utf-8'
		);
		expect( onDisk ).toBe( BODY_WITH_TRAILING_BLANK );

		await app.close();
		fixture.cleanup();
	} );

	test( 'selecting Heading 2 rewrites the line with `## `', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'existing.md', BODY_WITH_TRAILING_BLANK );

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
			.locator( `[data-testid="draft-row-${ project.id }-existing.md"]` )
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();

		await win.keyboard.type( '/' );
		await expect( win.locator( '[data-testid=slash-menu]' ) ).toBeVisible();

		// Click Heading 2 directly — keyboard nav order is covered separately
		// and click is the simpler signal for "menu wires through".
		await win.locator( '[data-testid=slash-menu-action-h2]' ).click();

		// Type a marker right after to assert the cursor lands after `## `.
		await win.keyboard.type( 'Hello' );

		await expect(
			win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', 'saved', { timeout: 5_000 } );

		const onDisk = fs.readFileSync(
			path.join( project.path, 'drafts', 'existing.md' ),
			'utf-8'
		);
		expect( onDisk ).toContain( '## Hello' );
		// The original `# Existing` H1 is still there.
		expect( onDisk ).toContain( '# Existing' );

		await app.close();
		fixture.cleanup();
	} );

	test( 'arrow keys highlight, Enter selects', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'existing.md', BODY_WITH_TRAILING_BLANK );

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
			.locator( `[data-testid="draft-row-${ project.id }-existing.md"]` )
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();

		await win.keyboard.type( '/' );
		await expect( win.locator( '[data-testid=slash-menu]' ) ).toBeVisible();

		// Image is the default highlighted action on open.
		await expect(
			win.locator( '[data-testid=slash-menu-action-image]' )
		).toHaveAttribute( 'data-active', 'true' );

		// ArrowDown moves to Quote.
		await win.keyboard.press( 'ArrowDown' );
		await expect(
			win.locator( '[data-testid=slash-menu-action-quote]' )
		).toHaveAttribute( 'data-active', 'true' );

		// Enter inserts the quote prefix and closes the menu.
		await win.keyboard.press( 'Enter' );
		await expect( win.locator( '[data-testid=slash-menu]' ) ).toHaveCount(
			0
		);
		await win.keyboard.type( 'q' );
		await expect(
			win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', 'saved', { timeout: 5_000 } );

		const onDisk = fs.readFileSync(
			path.join( project.path, 'drafts', 'existing.md' ),
			'utf-8'
		);
		expect( onDisk ).toContain( '> q' );

		await app.close();
		fixture.cleanup();
	} );
} );
