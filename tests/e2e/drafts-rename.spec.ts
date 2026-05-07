import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';
import { gotoDrafts } from '../helpers/nav';

// New drafts have no `autoRename` field — its absence means "auto-rename
// on", which is the default we want for fresh drafts.
const NEW_DRAFT = [ '---', 'title: Untitled', '---', '' ].join( '\n' );

// A manually-renamed draft has `autoRename: false` to pin the filename.
const MANUALLY_NAMED = [
	'---',
	'title: Pinned name',
	'autoRename: false',
	'---',
	'',
].join( '\n' );

test.describe( 'draft renaming', () => {
	test( 'auto-renames the file when the title is edited and blurred', async () => {
		const fixture = seedLinkedProjects( 1, {
			'drafts/untitled.md': NEW_DRAFT,
		} );
		const [ project ] = fixture.projects;

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
			.locator( `[data-testid="draft-row-${ project.id }-untitled.md"]` )
			.click();

		const titleInput = win.locator(
			'[data-testid=draft-editor-title-input]'
		);
		await titleInput.click();
		await titleInput.fill( 'Sunny Bear' );
		await win.keyboard.press( 'Tab' );

		// Wait for the rename round-trip to land. The blur fires the rename
		// IPC; we poll the filesystem until the new path appears.
		await expect
			.poll(
				() =>
					fs.existsSync(
						path.join( project.path, 'drafts/sunny-bear.md' )
					),
				{ timeout: 5000 }
			)
			.toBe( true );
		expect(
			fs.existsSync( path.join( project.path, 'drafts/untitled.md' ) )
		).toBe( false );

		// Auto-rename leaves frontmatter clean of the autoRename field so the
		// "auto-rename on" default keeps tracking subsequent title edits.
		const renamed = fs.readFileSync(
			path.join( project.path, 'drafts/sunny-bear.md' ),
			'utf-8'
		);
		expect( renamed ).not.toContain( 'autoRename' );
		expect( renamed ).toContain( 'title: Sunny Bear' );

		await app.close();
		fixture.cleanup();
	} );

	test( 'manual rename via the action menu pins the filename with autoRename: false', async () => {
		const fixture = seedLinkedProjects( 1, {
			'drafts/sunny-bear.md': NEW_DRAFT,
		} );
		const [ project ] = fixture.projects;

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
			.locator(
				`[data-testid="draft-row-${ project.id }-sunny-bear.md"]`
			)
			.click();

		await win.locator( '[data-testid=draft-editor-more-button]' ).click();
		await win.locator( '[data-testid=draft-editor-action-rename]' ).click();

		const renameInput = win.locator( '[data-testid=rename-draft-input]' );
		await expect( renameInput ).toBeVisible();
		await renameInput.fill( 'My Pinned Name' );
		await expect(
			win.locator( '[data-testid=rename-draft-helper]' )
		).toHaveText( /Saves as my-pinned-name\.md/ );
		await win.locator( '[data-testid=rename-draft-confirm]' ).click();

		await expect
			.poll(
				() =>
					fs.existsSync(
						path.join( project.path, 'drafts/my-pinned-name.md' )
					),
				{ timeout: 5000 }
			)
			.toBe( true );
		const renamed = fs.readFileSync(
			path.join( project.path, 'drafts/my-pinned-name.md' ),
			'utf-8'
		);
		expect( renamed ).toContain( 'autoRename: false' );

		// And after manual rename, editing the title should NOT trigger a
		// further rename — the file stays put.
		const titleInput = win.locator(
			'[data-testid=draft-editor-title-input]'
		);
		await titleInput.click();
		await titleInput.fill( 'Different Now' );
		await win.keyboard.press( 'Tab' );
		// Give autosave (1s) + a generous slack a chance to land before
		// confirming the absence of a slug-rename.
		await win.waitForTimeout( 1500 );
		expect(
			fs.existsSync(
				path.join( project.path, 'drafts/my-pinned-name.md' )
			)
		).toBe( true );
		expect(
			fs.existsSync(
				path.join( project.path, 'drafts/different-now.md' )
			)
		).toBe( false );

		await app.close();
		fixture.cleanup();
	} );

	test( 'collision suffixes -2 on auto-rename', async () => {
		const fixture = seedLinkedProjects( 1, {
			'drafts/untitled.md': NEW_DRAFT,
			'drafts/sunny-bear.md': MANUALLY_NAMED,
		} );
		const [ project ] = fixture.projects;

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
			.locator( `[data-testid="draft-row-${ project.id }-untitled.md"]` )
			.click();

		const titleInput = win.locator(
			'[data-testid=draft-editor-title-input]'
		);
		await titleInput.click();
		await titleInput.fill( 'Sunny Bear' );
		await win.keyboard.press( 'Tab' );

		await expect
			.poll(
				() =>
					fs.existsSync(
						path.join( project.path, 'drafts/sunny-bear-2.md' )
					),
				{ timeout: 5000 }
			)
			.toBe( true );
		// The pre-existing sunny-bear.md is untouched.
		expect(
			fs.existsSync( path.join( project.path, 'drafts/sunny-bear.md' ) )
		).toBe( true );

		await app.close();
		fixture.cleanup();
	} );
} );
