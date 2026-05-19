import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

test( 'shell: renders chat layout and gates composer on a linked project', async () => {
	const fixture = seedLinkedProjects( 1 );

	const app = await electron.launch( {
		executablePath: process.env.APP_EXECUTABLE,
		env: {
			...process.env,
			STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
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
	const transcript = win.locator( '[data-testid=draft-chat-transcript]' );
	const composer = win.locator( '[data-testid=draft-chat-composer]' );
	const input = win.locator( '[data-testid=draft-chat-input]' );
	const send = win.locator( '[data-testid=draft-chat-send]' );
	const sidebar = win.locator( '[data-testid=sidebar]' );
	const recentSection = win.locator( '[data-testid=sidebar-recent]' );

	await expect( titlebar ).toBeVisible();
	await expect( transcript ).toBeVisible();
	await expect( composer ).toBeVisible();
	await expect( input ).toBeVisible();
	await expect( send ).toBeVisible();
	await expect( sidebar ).toBeVisible();
	await expect( recentSection ).toBeVisible();
	// The Recent section is empty until the user sends a message.
	await expect(
		win.locator( '[data-testid=sidebar-recent-empty]' )
	).toBeVisible();

	// Layout: titlebar on top; transcript above composer; all inside the
	// viewport. With an open chat, the composer is pinned to the bottom.
	const viewport = await win.evaluate( () => ( {
		width: window.innerWidth,
		height: window.innerHeight,
	} ) );
	const tb = ( await titlebar.boundingBox() )!;
	const tr = ( await transcript.boundingBox() )!;
	const cp = ( await composer.boundingBox() )!;
	expect( tb.y ).toBeLessThan( 5 );
	expect( cp.y + cp.height ).toBeLessThanOrEqual( viewport.height + 1 );
	expect( tr.y ).toBeGreaterThanOrEqual( tb.y + tb.height - 1 );
	expect( cp.y ).toBeGreaterThanOrEqual( tr.y + tr.height - 1 );

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

test( 'shell: with no projects the app lands on Home, not the chat composer', async () => {
	const fixture = seedLinkedProjects( 0 );

	const app = await electron.launch( {
		executablePath: process.env.APP_EXECUTABLE,
		env: {
			...process.env,
			STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
		},
	} );
	const win = await app.firstWindow();

	const empty = win.locator( '[data-testid=sidebar-recent-empty]' );
	const homeNav = win.locator( '[data-testid=nav-home]' );
	const homeScreen = win.locator( '[data-testid=screen-home]' );
	const composer = win.locator( '[data-testid=draft-chat-composer]' );
	const input = win.locator( '[data-testid=draft-chat-input]' );

	await expect( empty ).toBeVisible();
	await expect( homeNav ).toHaveAttribute( 'data-active', 'true' );
	await expect( homeScreen ).toBeVisible();
	await expect( composer ).toHaveCount( 0 );
	await expect( input ).toHaveCount( 0 );

	await app.close();
	fixture.cleanup();
} );
