import { test, expect, _electron as electron } from '@playwright/test';

test( 'shell: renders chat layout with sidebar and empty transcript', async () => {
	const app = await electron.launch( {
		executablePath: process.env.APP_EXECUTABLE,
		timeout: 10_000,
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

	// --- Presence: sidebar, main regions, and controls render. ---
	const sidebar = win.locator( '[data-testid=sidebar]' );
	const sidebarTop = win.locator( '[data-testid=sidebar-top]' );
	const navChat = win.locator( '[data-testid=nav-chat]' );
	const navSettings = win.locator( '[data-testid=nav-settings]' );
	const navSkills = win.locator( '[data-testid=nav-skills]' );
	const titlebar = win.locator( '[data-testid=titlebar]' );
	const transcript = win.locator( '[data-testid=transcript]' );
	const composer = win.locator( '[data-testid=composer]' );
	const input = win.locator( '[data-testid=chat-input]' );
	const send = win.locator( '[data-testid=send-button]' );

	await expect( sidebar ).toBeVisible();
	await expect( sidebarTop ).toBeVisible();
	await expect( navChat ).toBeVisible();
	await expect( navSettings ).toBeVisible();
	await expect( navSkills ).toBeVisible();
	await expect( titlebar ).toBeVisible();
	await expect( transcript ).toBeVisible();
	await expect( composer ).toBeVisible();
	await expect( input ).toBeVisible();
	await expect( send ).toBeVisible();

	// --- Default state: sidebar open, Chat active. ---
	await expect( sidebar ).toHaveAttribute( 'data-open', 'true' );
	await expect( navChat ).toHaveAttribute( 'data-active', 'true' );
	await expect( navSettings ).not.toHaveAttribute( 'data-active', 'true' );
	await expect( navSkills ).not.toHaveAttribute( 'data-active', 'true' );

	// --- Layout: sidebar on the left, main column stacks top-bar/transcript/composer. ---
	const viewport = await win.evaluate( () => ( {
		width: window.innerWidth,
		height: window.innerHeight,
	} ) );
	const sb = ( await sidebar.boundingBox() )!;
	const tb = ( await titlebar.boundingBox() )!;
	const tr = ( await transcript.boundingBox() )!;
	const cp = ( await composer.boundingBox() )!;

	expect( sb.x ).toBeLessThan( 5 );
	expect( sb.width ).toBeGreaterThan( 200 );
	expect( tb.x ).toBeGreaterThanOrEqual( sb.x + sb.width - 1 );
	expect( tb.y ).toBeLessThan( 5 );
	expect( cp.y + cp.height ).toBeGreaterThanOrEqual( viewport.height - 2 );
	expect( tr.y ).toBeGreaterThanOrEqual( tb.y + tb.height - 1 );
	expect( tr.y + tr.height ).toBeLessThanOrEqual( cp.y + 1 );
	expect( tr.height ).toBeGreaterThan( 100 );

	// --- Titlebar areas (sidebar-top + main-top) are draggable, composer is not. ---
	const sidebarTopDrag = await sidebarTop.evaluate( ( el ) =>
		getComputedStyle( el ).getPropertyValue( '-webkit-app-region' ).trim()
	);
	const titlebarDrag = await titlebar.evaluate( ( el ) =>
		getComputedStyle( el ).getPropertyValue( '-webkit-app-region' ).trim()
	);
	const composerDrag = await composer.evaluate( ( el ) =>
		getComputedStyle( el ).getPropertyValue( '-webkit-app-region' ).trim()
	);
	expect( sidebarTopDrag ).toBe( 'drag' );
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

test( 'shell: sidebar collapses and reopens via toggle buttons', async () => {
	const app = await electron.launch( {
		executablePath: process.env.APP_EXECUTABLE,
	} );
	const win = await app.firstWindow();

	const pageErrors: string[] = [];
	win.on( 'pageerror', ( e ) => pageErrors.push( e.message ) );

	const sidebar = win.locator( '[data-testid=sidebar]' );
	const sidebarToggle = win.locator( '[data-testid=sidebar-toggle]' );
	const sidebarToggleMain = win.locator(
		'[data-testid=sidebar-toggle-main]'
	);

	// Open by default → main-top toggle is present but inert (aria-hidden, not
	// focusable); clicking the sidebar's toggle should collapse the pane.
	await expect( sidebar ).toHaveAttribute( 'data-open', 'true' );
	await expect( sidebarToggleMain ).toHaveAttribute( 'aria-hidden', 'true' );
	await expect( sidebarToggleMain ).toHaveAttribute( 'tabindex', '-1' );

	const openWidth = ( await sidebar.boundingBox() )!.width;
	expect( openWidth ).toBeGreaterThan( 200 );

	await sidebarToggle.click();

	await expect( sidebar ).toHaveAttribute( 'data-open', 'false' );
	await expect( sidebar ).toHaveAttribute( 'aria-hidden', 'true' );

	// Wait for the collapse transition to settle, then assert the sidebar has
	// no layout width and the main-top toggle has become interactive.
	await expect
		.poll( async () => ( await sidebar.boundingBox() )?.width ?? -1 )
		.toBeLessThanOrEqual( 1 );
	await expect( sidebarToggleMain ).not.toHaveAttribute(
		'aria-hidden',
		'true'
	);
	await expect( sidebarToggleMain ).toHaveAttribute( 'tabindex', '0' );

	// Clicking the main-top toggle reopens the pane.
	await sidebarToggleMain.click();

	await expect( sidebar ).toHaveAttribute( 'data-open', 'true' );
	await expect
		.poll( async () => ( await sidebar.boundingBox() )?.width ?? 0 )
		.toBeGreaterThan( 200 );

	expect( pageErrors ).toEqual( [] );

	await app.close();
} );
