import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

const NEW_DRAFT = [
	'---',
	'title: Untitled',
	'autoSlug: true',
	'---',
	'',
].join( '\n' );

const LEGACY_DRAFT = [ '---', 'title: Untitled', '---', '' ].join( '\n' );

const MANUALLY_NAMED = [
	'---',
	'title: Pinned name',
	'autoSlug: false',
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

		await win.locator( '[data-testid=nav-drafts]' ).click();
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

		// autoSlug remains true after auto-rename so subsequent title edits
		// keep tracking the slug.
		const renamed = fs.readFileSync(
			path.join( project.path, 'drafts/sunny-bear.md' ),
			'utf-8'
		);
		expect( renamed ).toContain( 'autoSlug: true' );
		expect( renamed ).toContain( 'title: Sunny Bear' );

		await app.close();
		fixture.cleanup();
	} );

	test( 'manual rename via the action menu flips autoSlug to false', async () => {
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

		await win.locator( '[data-testid=nav-drafts]' ).click();
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
		expect( renamed ).toContain( 'autoSlug: false' );

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

		await win.locator( '[data-testid=nav-drafts]' ).click();
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

	test( 'legacy drafts (no autoSlug field) auto-rename on first title edit', async () => {
		const fixture = seedLinkedProjects( 1, {
			'drafts/untitled.md': LEGACY_DRAFT,
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

		await win.locator( '[data-testid=nav-drafts]' ).click();
		await win
			.locator( `[data-testid="draft-row-${ project.id }-untitled.md"]` )
			.click();

		const titleInput = win.locator(
			'[data-testid=draft-editor-title-input]'
		);
		await titleInput.click();
		await titleInput.fill( 'Picked Up' );
		await win.keyboard.press( 'Tab' );

		await expect
			.poll(
				() =>
					fs.existsSync(
						path.join( project.path, 'drafts/picked-up.md' )
					),
				{ timeout: 5000 }
			)
			.toBe( true );

		await app.close();
		fixture.cleanup();
	} );
} );
