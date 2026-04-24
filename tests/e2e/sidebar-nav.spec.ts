import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedFolders } from '../helpers/linked-folders';

test( 'sidebar nav: Projects / Tasks / Drafts each route to a blank screen, folder returns to chat', async () => {
	const fixture = seedLinkedFolders( 1 );
	const folder = fixture.folders[ 0 ];

	const app = await electron.launch( {
		executablePath: process.env.APP_EXECUTABLE,
		env: {
			...process.env,
			CREATOR_STUDIO_USER_DATA_DIR: fixture.userDataDir,
		},
	} );
	const win = await app.firstWindow();

	const projectsNav = win.locator( '[data-testid=nav-projects]' );
	const tasksNav = win.locator( '[data-testid=nav-tasks]' );
	const draftsNav = win.locator( '[data-testid=nav-drafts]' );
	const projectsScreen = win.locator( '[data-testid=screen-projects]' );
	const tasksScreen = win.locator( '[data-testid=screen-tasks]' );
	const draftsScreen = win.locator( '[data-testid=screen-drafts]' );
	const transcript = win.locator( '[data-testid=transcript]' );
	const composer = win.locator( '[data-testid=composer]' );
	const seededFolder = win.locator(
		`[data-testid=sidebar-folder-${ folder.id }]`
	);

	// With at least one folder seeded the app auto-enters chat — the
	// transcript + composer are visible and the folder is active.
	await expect( transcript ).toBeVisible();
	await expect( composer ).toBeVisible();
	await expect( seededFolder ).toHaveAttribute( 'data-active', 'true' );
	await expect( projectsNav ).not.toHaveAttribute( 'data-active', 'true' );

	// Projects → right pane swaps, folder goes inactive.
	await projectsNav.click();
	await expect( projectsScreen ).toBeVisible();
	await expect( projectsNav ).toHaveAttribute( 'data-active', 'true' );
	await expect( transcript ).toHaveCount( 0 );
	await expect( composer ).toHaveCount( 0 );
	await expect( seededFolder ).not.toHaveAttribute( 'data-active', 'true' );

	// Tasks → previous screen unmounts, Tasks active.
	await tasksNav.click();
	await expect( tasksScreen ).toBeVisible();
	await expect( projectsScreen ).toHaveCount( 0 );
	await expect( tasksNav ).toHaveAttribute( 'data-active', 'true' );
	await expect( projectsNav ).not.toHaveAttribute( 'data-active', 'true' );

	// Drafts → same pattern.
	await draftsNav.click();
	await expect( draftsScreen ).toBeVisible();
	await expect( tasksScreen ).toHaveCount( 0 );
	await expect( draftsNav ).toHaveAttribute( 'data-active', 'true' );

	// Clicking the seeded folder reverts to chat view: transcript +
	// composer are back, the three nav items are all inactive.
	await seededFolder.click();
	await expect( transcript ).toBeVisible();
	await expect( composer ).toBeVisible();
	await expect( seededFolder ).toHaveAttribute( 'data-active', 'true' );
	await expect( projectsNav ).not.toHaveAttribute( 'data-active', 'true' );
	await expect( tasksNav ).not.toHaveAttribute( 'data-active', 'true' );
	await expect( draftsNav ).not.toHaveAttribute( 'data-active', 'true' );
	await expect( draftsScreen ).toHaveCount( 0 );

	await app.close();
	fixture.cleanup();
} );
