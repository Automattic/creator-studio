import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

// Regression coverage for #201: the editor's back button used to always
// route to the draft's project view, regardless of where the user opened
// the draft from. Each test here exercises a different origin and asserts
// the user returns to the screen they came from.
//
// The "open from All Drafts" path lives in tests/e2e/draft-editor.spec.ts
// alongside the rest of that file's editor coverage; here we cover Home,
// the Project view, and the chain-through case.

const SAMPLE_BODY = [
	'---',
	'title: Back button draft',
	'---',
	'',
	'A short body so the editor opens cleanly.',
].join( '\n' );

function writeDraft(
	projectPath: string,
	fileName: string,
	body: string
): void {
	const dir = path.join( projectPath, 'drafts' );
	fs.mkdirSync( dir, { recursive: true } );
	fs.writeFileSync( path.join( dir, fileName ), body, 'utf-8' );
}

test.describe( 'back button from the draft editor', () => {
	test( 'opening from Home returns to Home', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'home.md', SAMPLE_BODY );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await expect(
			win.locator( '[data-testid=screen-home]' )
		).toBeVisible();
		await win
			.locator(
				`[data-testid="sidebar-recent-draft-${ project.id }-home.md"]`
			)
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();
		await win.locator( '[data-testid=draft-editor-back]' ).click();
		await expect(
			win.locator( '[data-testid=screen-home]' )
		).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );

	test( 'opening from the project view returns to that project', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'proj.md', SAMPLE_BODY );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await win.locator( '[data-testid=nav-projects]' ).click();
		await win
			.locator( `[data-testid="project-card-${ project.id }"]` )
			.click();
		await expect(
			win.locator( '[data-testid=screen-project]' )
		).toBeVisible();
		// Open from the sidebar recent link — origin should snap to the
		// project view we're currently on, not to "projects".
		await win
			.locator(
				`[data-testid="sidebar-recent-draft-${ project.id }-proj.md"]`
			)
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();
		await win.locator( '[data-testid=draft-editor-back]' ).click();
		await expect(
			win.locator( '[data-testid=screen-project]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=screen-project]' )
		).toHaveAttribute( 'data-project-id', project.id );

		await app.close();
		fixture.cleanup();
	} );

	test( 'opening another draft while already in the editor preserves the original origin', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'first.md', SAMPLE_BODY );
		writeDraft(
			project.path,
			'second.md',
			SAMPLE_BODY.replace( 'Back button draft', 'Second draft' )
		);

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await expect(
			win.locator( '[data-testid=screen-home]' )
		).toBeVisible();
		// First draft opens from Home.
		await win
			.locator(
				`[data-testid="sidebar-recent-draft-${ project.id }-first.md"]`
			)
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();
		// Already in the editor, open a second draft via sidebar — the editor
		// should re-render but the recorded origin must still be Home, not
		// 'draft-editor' (which would be a navigation loop).
		await win
			.locator(
				`[data-testid="sidebar-recent-draft-${ project.id }-second.md"]`
			)
			.click();
		await expect(
			win.locator( '[data-testid=draft-editor-title-input]' )
		).toHaveValue( 'Second draft' );
		await win.locator( '[data-testid=draft-editor-back]' ).click();
		await expect(
			win.locator( '[data-testid=screen-home]' )
		).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );
} );
