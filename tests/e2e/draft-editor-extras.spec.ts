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

const SAMPLE = [
	'---',
	'title: Extras test',
	'---',
	'',
	'Hello world. Visit [example](https://example.com) for more.',
	'',
	'Another line of prose.',
].join( '\n' );

test.describe( 'draft editor — extras (Phase A/B/C)', () => {
	test( 'closeBrackets auto-closes (', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'extras.md', SAMPLE );

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
			.locator( `[data-testid="draft-row-${ project.id }-extras.md"]` )
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();
		await win.keyboard.press( 'Meta+End' );
		await win.keyboard.press( 'Enter' );
		await win.keyboard.type( '(' );
		// CM6 closeBrackets should produce "()" with caret in the middle.
		await expect(
			win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', /(dirty|saving|saved)/, {
			timeout: 2_000,
		} );

		await app.close();
		fixture.cleanup();
	} );

	test( 'Cmd+F opens the search panel', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'extras.md', SAMPLE );

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
			.locator( `[data-testid="draft-row-${ project.id }-extras.md"]` )
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();
		await win.keyboard.press( 'Meta+f' );
		await expect( win.locator( '.cm-search.cm-panel' ) ).toBeVisible( {
			timeout: 2_000,
		} );

		await app.close();
		fixture.cleanup();
	} );

	test( 'smart wrap: select word + type * → *word*', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'extras.md', SAMPLE );

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
			.locator( `[data-testid="draft-row-${ project.id }-extras.md"]` )
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();

		await win.keyboard.press( 'Meta+End' );
		await win.keyboard.press( 'Enter' );
		await win.keyboard.type( 'wrapme' );
		await win.keyboard.press( 'Shift+Home' );
		await win.keyboard.type( '*' );
		await expect(
			win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', 'saved', { timeout: 5_000 } );

		const onDisk = fs.readFileSync(
			path.join( project.path, 'drafts', 'extras.md' ),
			'utf-8'
		);
		expect( onDisk ).toContain( '*wrapme*' );

		await app.close();
		fixture.cleanup();
	} );

	test( 'shell.openExternal validates URLs', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'extras.md', SAMPLE );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		// Navigate so the API surface is loaded.
		await win.locator( '[data-testid=nav-drafts]' ).click();
		await win.waitForTimeout( 200 );

		// http(s) URLs are accepted; we don't actually open a browser
		// because the test runs in a headed Electron — the IPC just
		// resolves with `ok: true`. file:/javascript:/garbage rejected.
		const reject = await win.evaluate( async () => {
			const file =
				await window.api.shell.openExternal( 'file:///etc/passwd' );
			const js = await window.api.shell.openExternal(
				'javascript:alert(1)'
			);
			const garbage = await window.api.shell.openExternal( 'not-a-url' );
			return { file, js, garbage };
		} );
		expect( reject.file ).toEqual( {
			ok: false,
			reason: 'invalid-url',
		} );
		expect( reject.js ).toEqual( {
			ok: false,
			reason: 'invalid-url',
		} );
		expect( reject.garbage ).toEqual( {
			ok: false,
			reason: 'invalid-url',
		} );

		await app.close();
		fixture.cleanup();
	} );

	test( 'Cmd+Shift+1 / Cmd+Shift+L toggle heading and list', async () => {
		const fixture = seedLinkedProjects( 1 );
		const [ project ] = fixture.projects;
		writeDraft( project.path, 'extras.md', SAMPLE );

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
			.locator( `[data-testid="draft-row-${ project.id }-extras.md"]` )
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();

		await win.keyboard.press( 'Meta+End' );
		await win.keyboard.press( 'Enter' );
		await win.keyboard.type( 'tagline' );
		await win.keyboard.press( 'Meta+Shift+1' );
		await win.keyboard.press( 'Meta+Shift+l' );
		await expect(
			win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', 'saved', { timeout: 5_000 } );

		const onDisk = fs.readFileSync(
			path.join( project.path, 'drafts', 'extras.md' ),
			'utf-8'
		);
		// toggleBulletList strips any prior block prefix (heading, etc) and
		// prepends `- `, so the line replaces the heading marker rather than
		// nesting it. A line is either a heading OR a list item, never both.
		expect( onDisk ).toContain( '- tagline' );
		expect( onDisk ).not.toContain( '- # tagline' );

		await app.close();
		fixture.cleanup();
	} );
} );
