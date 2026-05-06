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

// Headings span three levels and include a fenced code block whose `#`
// lines must be ignored by the lezer-based extractor.
const OUTLINE_BODY = [
	'---',
	'title: Outline draft',
	'---',
	'',
	'# Origin Shot',
	'',
	'Intro paragraph.',
	'',
	'## Why this exists',
	'',
	'```',
	'# not a heading',
	'## also not',
	'```',
	'',
	'### Public demo',
	'',
	'Body.',
].join( '\n' );

test.describe( 'draft editor outline panel', () => {
	test( 'lists headings, jumps to line on click, and tracks active row', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'outline.md', OUTLINE_BODY );

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
			.locator( `[data-testid="draft-row-${ project.id }-outline.md"]` )
			.click();
		await expect(
			win.locator( '[data-testid=screen-draft-editor]' )
		).toBeVisible();

		await win.locator( '[data-testid=draft-sidebar-tab-outline]' ).click();
		const panel = win.locator( '[data-testid=draft-outline-panel]' );
		await expect( panel ).toBeVisible();

		// Three headings: H1, H2, H3 — code-block fakes are skipped.
		const items = win.locator( '[data-testid=draft-outline-item]' );
		await expect( items ).toHaveCount( 3 );
		await expect( items.nth( 0 ) ).toHaveAttribute( 'data-level', '1' );
		await expect( items.nth( 0 ) ).toHaveText( 'Origin Shot' );
		await expect( items.nth( 1 ) ).toHaveAttribute( 'data-level', '2' );
		await expect( items.nth( 1 ) ).toHaveText( 'Why this exists' );
		await expect( items.nth( 2 ) ).toHaveAttribute( 'data-level', '3' );
		await expect( items.nth( 2 ) ).toHaveText( 'Public demo' );

		// Click the H2 entry. Editor takes focus, the cursor lands on that
		// line, and the H2 row becomes active.
		await items.nth( 1 ).click();
		await expect( items.nth( 1 ) ).toHaveAttribute( 'data-active', 'true' );
		await expect( items.nth( 0 ) ).toHaveAttribute(
			'data-active',
			'false'
		);
		await expect( items.nth( 2 ) ).toHaveAttribute(
			'data-active',
			'false'
		);

		// Live updates: type a new heading, the panel grows.
		await win.locator( '.cm-content' ).press( 'Meta+End' );
		await win
			.locator( '.cm-content' )
			.pressSequentially( '\n\n# Newcomer\n', {
				delay: 5,
			} );
		await expect( items ).toHaveCount( 4 );
		await expect( items.nth( 3 ) ).toHaveText( 'Newcomer' );

		await app.close();
		fixture.cleanup();
	} );

	test( 'shows empty placeholder when the draft has no headings', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft(
			project.path,
			'no-headings.md',
			'Just plain prose, no headings here.\n'
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
		await win
			.locator(
				`[data-testid="draft-row-${ project.id }-no-headings.md"]`
			)
			.click();
		await win.locator( '[data-testid=draft-sidebar-tab-outline]' ).click();

		const panel = win.locator( '[data-testid=draft-outline-panel]' );
		await expect( panel ).toHaveText( 'No headings yet.' );
		await expect(
			win.locator( '[data-testid=draft-outline-item]' )
		).toHaveCount( 0 );

		await app.close();
		fixture.cleanup();
	} );
} );
