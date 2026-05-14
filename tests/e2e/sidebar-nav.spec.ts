import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

test( 'sidebar nav: Projects toggles the Projects screen; Tasks is a disabled placeholder', async () => {
	const fixture = seedLinkedProjects( 1 );
	const project = fixture.projects[ 0 ];

	const app = await electron.launch( {
		executablePath: process.env.APP_EXECUTABLE,
		env: {
			...process.env,
			STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
		},
	} );
	const win = await app.firstWindow();

	const projectsNav = win.locator( '[data-testid=nav-projects]' );
	const tasksNav = win.locator( '[data-testid=nav-tasks]' );
	const projectsScreen = win.locator( '[data-testid=screen-projects]' );
	const transcript = win.locator( '[data-testid=draft-chat-transcript]' );
	const composer = win.locator( '[data-testid=draft-chat-composer]' );
	const projectCard = win.locator(
		`[data-testid=project-card-${ project.id }]`
	);

	// With at least one project seeded the app auto-enters chat — the
	// transcript + composer are visible.
	await expect( transcript ).toBeVisible();
	await expect( composer ).toBeVisible();
	await expect( projectsNav ).not.toHaveAttribute( 'data-active', 'true' );

	// Projects → right pane swaps; chat view tears down.
	await projectsNav.click();
	await expect( projectsScreen ).toBeVisible();
	await expect( projectsNav ).toHaveAttribute( 'data-active', 'true' );
	await expect( transcript ).toHaveCount( 0 );
	await expect( composer ).toHaveCount( 0 );

	// Tasks is visible but disabled — clicks are no-ops.
	await expect( tasksNav ).toBeDisabled();

	// Click into the project card — chat view returns.
	await projectCard.click();
	await expect( transcript ).toBeVisible();
	await expect( composer ).toBeVisible();
	await expect( projectsNav ).not.toHaveAttribute( 'data-active', 'true' );

	await app.close();
	fixture.cleanup();
} );
