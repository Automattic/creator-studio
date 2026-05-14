import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

test.describe( 'projects UI + per-project state', () => {
	test( 'Add project button opens the link-project modal', async () => {
		const fixture = seedLinkedProjects( 0 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const addBtn = win.locator( '[data-testid=sidebar-add]' );
		const dialog = win.locator( '[data-testid=create-project-modal]' );

		await expect( addBtn ).toBeVisible();
		await expect( addBtn ).toContainText( 'Add project' );
		await expect( dialog ).toHaveCount( 0 );

		await addBtn.click();
		await expect( dialog ).toBeVisible();

		// Defaults to New mode with the segmented control reflecting the selection.
		await expect(
			win.locator( '[data-testid=project-mode-new]' )
		).toHaveAttribute( 'data-active', 'true' );
		await expect(
			win.locator( '[data-testid=project-pick-folder]' )
		).toHaveCount( 0 );
		await expect(
			win.locator( '[data-testid=project-advanced-toggle]' )
		).toBeVisible();

		// Switching to Import swaps the body and reveals the folder picker.
		await win.locator( '[data-testid=project-mode-import]' ).click();
		await expect(
			win.locator( '[data-testid=project-pick-folder]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=project-advanced-toggle]' )
		).toHaveCount( 0 );

		await win.keyboard.press( 'Escape' );
		await expect( dialog ).toHaveCount( 0 );

		await app.close();
		fixture.cleanup();
	} );

	test( 'New mode creates a folder under the chosen parent and lists the project', async () => {
		const fixture = seedLinkedProjects( 0 );
		const parentDir = fs.mkdtempSync(
			path.join( fixture.userDataDir, 'projects-parent-' )
		);
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		// Drive the new flow through the IPC bridge: the parent picker uses a
		// native dialog we can't script reliably from Playwright, so we pass
		// parentDir directly. The renderer covers the same channel.
		const result = await win.evaluate( async ( parent: string ) => {
			return await window.api.project.createNew( {
				name: 'New From E2E',
				parentDir: parent,
			} );
		}, parentDir );

		expect( result ).toMatchObject( { status: 'ok' } );
		const ok = result as {
			status: 'ok';
			project: { id: string; path: string };
		};
		expect( ok.project.path ).toBe(
			path.join( parentDir, 'New From E2E' )
		);
		expect( fs.existsSync( ok.project.path ) ).toBe( true );

		const list = await win.evaluate( () => window.api.projects.list() );
		expect( list.map( ( p ) => p.id ) ).toContain( ok.project.id );

		await app.close();
		fixture.cleanup();
	} );

	test( 'sidebar Recents lists drafts from all projects and opens them', async () => {
		const fixture = seedLinkedProjects( 2 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const seedDraft = (
			projectPath: string,
			fileName: string,
			title: string,
			mtime: number
		): void => {
			const draftsDir = path.join( projectPath, 'drafts' );
			fs.mkdirSync( draftsDir, { recursive: true } );
			const filePath = path.join( draftsDir, fileName );
			fs.writeFileSync(
				filePath,
				`---\ntitle: ${ title }\n---\n\nbody\n`,
				'utf-8'
			);
			fs.utimesSync( filePath, mtime / 1000, mtime / 1000 );
		};

		const projectA = fixture.projects[ 0 ];
		const projectB = fixture.projects[ 1 ];
		// Project B's draft is newer, so it leads the Recents list.
		seedDraft( projectA.path, 'alpha.md', 'Alpha', 1_700_000_000_000 );
		seedDraft( projectB.path, 'bravo.md', 'Bravo', 1_700_000_001_000 );

		const recentA = win.locator(
			`[data-testid="sidebar-recent-draft-${ projectA.id }-alpha.md"]`
		);
		const recentB = win.locator(
			`[data-testid="sidebar-recent-draft-${ projectB.id }-bravo.md"]`
		);

		await expect( recentA ).toBeVisible();
		await expect( recentB ).toBeVisible();

		// Click project A's draft — opens the draft editor for it.
		await recentA.click();
		await expect(
			win.locator( '[data-testid=screen-draft-editor]' )
		).toBeVisible();
		await expect( recentA ).toHaveAttribute( 'data-active', 'true' );

		await app.close();
		fixture.cleanup();
	} );

	test( 'sidebar Recents caps at 6 drafts, View all opens the Drafts view', async () => {
		const fixture = seedLinkedProjects( 2 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const seedDraft = (
			projectPath: string,
			fileName: string,
			mtime: number
		): void => {
			const draftsDir = path.join( projectPath, 'drafts' );
			fs.mkdirSync( draftsDir, { recursive: true } );
			const filePath = path.join( draftsDir, fileName );
			fs.writeFileSync(
				filePath,
				`---\ntitle: ${ fileName }\n---\n\nbody\n`,
				'utf-8'
			);
			fs.utimesSync( filePath, mtime / 1000, mtime / 1000 );
		};

		const [ projectA, projectB ] = fixture.projects;
		// Seed 7 drafts split across the two projects with strictly increasing
		// mtimes so we know exactly which six survive the slice.
		const base = 1_700_000_000_000;
		for ( let i = 0; i < 4; i++ ) {
			seedDraft( projectA.path, `a${ i }.md`, base + i * 1000 );
		}
		for ( let i = 0; i < 3; i++ ) {
			seedDraft( projectB.path, `b${ i }.md`, base + 4_000 + i * 1000 );
		}

		const rows = win.locator( '[data-testid^="sidebar-recent-draft-"]' );
		await expect( rows ).toHaveCount( 6 );

		// Oldest draft (a0.md) should be excluded by the slice.
		await expect(
			win.locator(
				`[data-testid="sidebar-recent-draft-${ projectA.id }-a0.md"]`
			)
		).toHaveCount( 0 );

		const viewAll = win.locator( '[data-testid=sidebar-recent-view-all]' );

		// Hidden by default (still in the DOM, just transparent). The
		// hover-driven reveal is a pure CSS rule; the click path is the
		// observable behavior we exercise here.
		await expect( viewAll ).toHaveCSS( 'opacity', '0' );

		await viewAll.dispatchEvent( 'click' );
		await expect(
			win.locator( '[data-testid=screen-drafts]' )
		).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );
} );
