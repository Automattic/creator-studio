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
	'title: Existing draft',
	'description: Stays untouched on title-only edits.',
	// Pin the filename so editing the title doesn't auto-rename the file
	// out from under the tests, which read it back by its seeded name.
	'autoRename: false',
	'---',
	'',
	'# Existing draft',
	'',
	'A short body to verify the editor flow.',
].join( '\n' );

test.describe( 'draft editor', () => {
	test( 'click row → editor opens with frontmatter title', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'existing.md', SAMPLE_BODY );

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
			.locator( `[data-testid="draft-row-${ project.id }-existing.md"]` )
			.click();
		await expect(
			win.locator( '[data-testid=screen-draft-editor]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=draft-editor-title-input]' )
		).toHaveValue( 'Existing draft' );
		await expect(
			win.locator( '[data-testid=draft-editor-host][data-status=ready]' )
		).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );

	test( 'editing the body auto-saves to disk and shows saved state', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'existing.md', SAMPLE_BODY );

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
			.locator( `[data-testid="draft-row-${ project.id }-existing.md"]` )
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();

		// Editor auto-focuses with cursor at end. Type a marker.
		await win.keyboard.type( ' EDITED-BODY' );
		await expect(
			win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', 'saved', { timeout: 5_000 } );

		const onDisk = fs.readFileSync(
			path.join( project.path, 'drafts', 'existing.md' ),
			'utf-8'
		);
		expect( onDisk ).toContain( 'EDITED-BODY' );
		expect( onDisk ).toContain( 'description: Stays untouched' );

		await app.close();
		fixture.cleanup();
	} );

	test( 'editing the title rewrites frontmatter, preserving other keys', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'existing.md', SAMPLE_BODY );

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
			.locator( `[data-testid="draft-row-${ project.id }-existing.md"]` )
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();

		const titleInput = win.locator(
			'[data-testid=draft-editor-title-input]'
		);
		await titleInput.click();
		// Replace the title contents.
		await titleInput.press( 'Meta+a' );
		await titleInput.press( 'Delete' );
		await titleInput.fill( 'Renamed draft' );
		await expect(
			win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', 'saved', { timeout: 5_000 } );

		const onDisk = fs.readFileSync(
			path.join( project.path, 'drafts', 'existing.md' ),
			'utf-8'
		);
		expect( onDisk ).toContain( 'title: Renamed draft' );
		expect( onDisk ).toContain( 'description: Stays untouched' );

		await app.close();
		fixture.cleanup();
	} );

	test( 'back button returns to the screen the user came from', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'existing.md', SAMPLE_BODY );

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
			.locator( `[data-testid="draft-row-${ project.id }-existing.md"]` )
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();
		const backButton = win.locator( '[data-testid=draft-editor-back]' );
		expect( ( await backButton.textContent() )?.trim() ).toBe( '←' );
		await expect( backButton ).toHaveAttribute( 'aria-label', 'Back' );
		await backButton.click();
		// Opened from the All Drafts library tab, so back should return there
		// — not silently drop the user into a project they never navigated
		// into. Regression guard for #201.
		await expect(
			win.locator( '[data-testid=screen-drafts]' )
		).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );

	test( 'reloads from disk when the file changes externally', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'existing.md', SAMPLE_BODY );

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
			.locator( `[data-testid="draft-row-${ project.id }-existing.md"]` )
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();

		// Confirm baseline body — the agent / external editor will replace it.
		await expect( win.locator( '.cm-content' ) ).toContainText(
			'A short body to verify the editor flow.'
		);

		// Simulate the agent (or any external tool) rewriting the file
		// directly. The watcher should pick this up and reload the editor.
		const externalBody = [
			'---',
			'title: Existing draft',
			'description: Stays untouched on title-only edits.',
			'---',
			'',
			'# Existing draft',
			'',
			'EXTERNAL CHANGE landed via the agent.',
		].join( '\n' );
		fs.writeFileSync(
			path.join( project.path, 'drafts', 'existing.md' ),
			externalBody,
			'utf-8'
		);

		await expect( win.locator( '.cm-content' ) ).toContainText(
			'EXTERNAL CHANGE landed via the agent.',
			{ timeout: 5_000 }
		);
		await expect( win.locator( '.cm-content' ) ).not.toContainText(
			'A short body to verify the editor flow.'
		);

		await app.close();
		fixture.cleanup();
	} );

	test( 'word count and AI menu placeholder', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'existing.md', SAMPLE_BODY );

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
			.locator( `[data-testid="draft-row-${ project.id }-existing.md"]` )
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();

		// Word count is visible and reads as "<n> words".
		await expect(
			win.locator( '[data-testid=draft-editor-word-count]' )
		).toContainText( /\d+ words/ );

		// Cmd+J opens the placeholder; Esc closes it without exiting the editor.
		// The editor opens with the title focused — click into the body first.
		await win.locator( '.cm-content' ).click();
		await win.keyboard.press( 'Meta+j' );
		await expect( win.locator( '[data-testid=ai-menu]' ) ).toBeVisible();
		await expect(
			win.locator( '[data-testid=ai-menu-input]' )
		).toBeDisabled();
		await win.keyboard.press( 'Escape' );
		await expect( win.locator( '[data-testid=ai-menu]' ) ).toHaveCount( 0 );
		await expect(
			win.locator( '[data-testid=screen-draft-editor]' )
		).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );
} );
