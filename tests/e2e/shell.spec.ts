import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedFolders } from '../helpers/linked-folders';

test( 'shell: renders chat layout and gates composer on a linked folder', async () => {
	const fixture = seedLinkedFolders( 1 );

	const app = await electron.launch( {
		executablePath: process.env.APP_EXECUTABLE,
		env: {
			...process.env,
			CREATOR_STUDIO_USER_DATA_DIR: fixture.userDataDir,
		},
	} );
	const win = await app.firstWindow();

	const pageErrors: string[] = [];
	win.on( 'pageerror', ( e ) => pageErrors.push( e.message ) );
	const consoleErrors: string[] = [];
	win.on( 'console', ( msg ) => {
		if ( msg.type() === 'error' ) {
			consoleErrors.push( msg.text() );
		}
	} );

	const titlebar = win.locator( '[data-testid=titlebar]' );
	const transcript = win.locator( '[data-testid=transcript]' );
	const composer = win.locator( '[data-testid=composer]' );
	const input = win.locator( '[data-testid=chat-input]' );
	const send = win.locator( '[data-testid=send-button]' );
	const sidebar = win.locator( '[data-testid=sidebar]' );
	const foldersSection = win.locator( '[data-testid=sidebar-folders]' );
	const seededFolder = win.locator(
		`[data-testid=sidebar-folder-${ fixture.folders[ 0 ].id }]`
	);

	await expect( titlebar ).toBeVisible();
	await expect( transcript ).toBeVisible();
	await expect( composer ).toBeVisible();
	await expect( input ).toBeVisible();
	await expect( send ).toBeVisible();
	await expect( sidebar ).toBeVisible();
	await expect( foldersSection ).toBeVisible();

	// The seeded folder is rendered and auto-selected.
	await expect( seededFolder ).toHaveAttribute( 'data-active', 'true' );
	await expect( seededFolder ).toContainText( fixture.folders[ 0 ].label );

	// Layout: titlebar on top, composer pinned to bottom.
	const viewport = await win.evaluate( () => ( {
		width: window.innerWidth,
		height: window.innerHeight,
	} ) );
	const tb = ( await titlebar.boundingBox() )!;
	const tr = ( await transcript.boundingBox() )!;
	const cp = ( await composer.boundingBox() )!;
	expect( tb.y ).toBeLessThan( 5 );
	expect( cp.y + cp.height ).toBeGreaterThanOrEqual( viewport.height - 2 );
	expect( tr.y ).toBeGreaterThanOrEqual( tb.y + tb.height - 1 );
	expect( tr.y + tr.height ).toBeLessThanOrEqual( cp.y + 1 );

	// Titlebar draggable, composer not.
	const titlebarDrag = await titlebar.evaluate( ( el ) =>
		getComputedStyle( el ).getPropertyValue( '-webkit-app-region' ).trim()
	);
	const composerDrag = await composer.evaluate( ( el ) =>
		getComputedStyle( el ).getPropertyValue( '-webkit-app-region' ).trim()
	);
	expect( titlebarDrag ).toBe( 'drag' );
	expect( composerDrag ).not.toBe( 'drag' );

	await expect( transcript.locator( '> *' ) ).toHaveCount( 0 );
	await expect( send ).toBeDisabled();

	await input.click();
	await input.fill( 'hello' );
	await expect( input ).toHaveValue( 'hello' );
	await expect( send ).toBeEnabled();

	expect( pageErrors ).toEqual( [] );
	expect( consoleErrors ).toEqual( [] );

	await app.close();
	fixture.cleanup();
} );

test( 'shell: with no folders the app lands on Projects, not the chat composer', async () => {
	const fixture = seedLinkedFolders( 0 );

	const app = await electron.launch( {
		executablePath: process.env.APP_EXECUTABLE,
		env: {
			...process.env,
			CREATOR_STUDIO_USER_DATA_DIR: fixture.userDataDir,
		},
	} );
	const win = await app.firstWindow();

	const empty = win.locator( '[data-testid=sidebar-folders-empty]' );
	const projectsNav = win.locator( '[data-testid=nav-projects]' );
	const projectsScreen = win.locator( '[data-testid=screen-projects]' );
	const composer = win.locator( '[data-testid=composer]' );
	const input = win.locator( '[data-testid=chat-input]' );

	await expect( empty ).toBeVisible();
	await expect( projectsNav ).toHaveAttribute( 'data-active', 'true' );
	await expect( projectsScreen ).toBeVisible();
	await expect( composer ).toHaveCount( 0 );
	await expect( input ).toHaveCount( 0 );

	await app.close();
	fixture.cleanup();
} );
