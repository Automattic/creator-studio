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
	'title: Existing draft',
	'description: Stays untouched on title-only edits.',
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

		await win.locator( '[data-testid=nav-drafts]' ).click();
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

		await win.locator( '[data-testid=nav-drafts]' ).click();
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

		await win.locator( '[data-testid=nav-drafts]' ).click();
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

	test( "back button returns to the draft's project", async () => {
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

		await win.locator( '[data-testid=nav-drafts]' ).click();
		await win
			.locator( `[data-testid="draft-row-${ project.id }-existing.md"]` )
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();
		const backLabel = await win
			.locator( '[data-testid=draft-editor-back]' )
			.textContent();
		expect( backLabel?.trim() ).toBe( '← Project' );
		await win.locator( '[data-testid=draft-editor-back]' ).click();
		await expect(
			win.locator( '[data-testid=screen-project]' )
		).toBeVisible();
		await expect( win.locator( '[data-testid=project-title]' ) ).toHaveText(
			project.label
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

		await win.locator( '[data-testid=nav-drafts]' ).click();
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
