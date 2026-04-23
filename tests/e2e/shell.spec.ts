import { test, expect, _electron as electron } from '@playwright/test';

test( 'shell: renders chat layout with empty transcript', async () => {
	const app = await electron.launch( {
		executablePath: process.env.APP_EXECUTABLE,
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

	// --- Presence: regions and controls render. ---
	const titlebar = win.locator( '[data-testid=titlebar]' );
	const transcript = win.locator( '[data-testid=transcript]' );
	const composer = win.locator( '[data-testid=composer]' );
	const input = win.locator( '[data-testid=chat-input]' );
	const send = win.locator( '[data-testid=send-button]' );

	await expect( titlebar ).toBeVisible();
	await expect( transcript ).toBeVisible();
	await expect( composer ).toBeVisible();
	await expect( input ).toBeVisible();
	await expect( send ).toBeVisible();

	// --- Layout: titlebar on top, composer pinned to bottom. ---
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
	expect( tr.height ).toBeGreaterThan( 100 );

	// --- Titlebar is draggable, composer is not. ---
	const titlebarDrag = await titlebar.evaluate( ( el ) =>
		getComputedStyle( el ).getPropertyValue( '-webkit-app-region' ).trim()
	);
	const composerDrag = await composer.evaluate( ( el ) =>
		getComputedStyle( el ).getPropertyValue( '-webkit-app-region' ).trim()
	);
	expect( titlebarDrag ).toBe( 'drag' );
	expect( composerDrag ).not.toBe( 'drag' );

	// --- Initial state: no messages, send disabled (empty input). ---
	await expect( transcript.locator( '> *' ) ).toHaveCount( 0 );
	await expect( send ).toBeDisabled();

	// --- Typing enables Send. ---
	await input.click();
	await input.fill( 'hello' );
	await expect( input ).toHaveValue( 'hello' );
	await expect( send ).toBeEnabled();

	expect( pageErrors ).toEqual( [] );
	expect( consoleErrors ).toEqual( [] );

	await app.close();
} );
