import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

const RICH_HTML =
	'<h1>Title</h1>' +
	'<p>Hello <strong>world</strong> and <em>style</em></p>' +
	'<ul><li>one</li><li>two</li></ul>' +
	'<p><a href="https://example.com">link</a></p>';

// Plain-text fallback the OS would put alongside text/html — we want to
// confirm that even when both are present, our handler converts the HTML.
const RICH_PLAIN = 'Title\nHello world and style\none\ntwo\nlink';

const EXPECTED_MD =
	'# Title\n\n' +
	'Hello **world** and _style_\n\n' +
	'- one\n- two\n\n' +
	'[link](https://example.com)';

test.describe( 'paste: HTML → Markdown', () => {
	test( 'chat composer converts pasted HTML to markdown', async () => {
		const fixture = seedLinkedProjects( 1 );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const input = win.locator( '[data-testid=chat-input]' );
		await expect( input ).toBeVisible();

		await input.evaluate(
			( el, { html, plain } ) => {
				const ta = el as HTMLTextAreaElement;
				ta.focus();
				const dt = new DataTransfer();
				dt.setData( 'text/html', html );
				dt.setData( 'text/plain', plain );
				ta.dispatchEvent(
					new ClipboardEvent( 'paste', {
						clipboardData: dt,
						bubbles: true,
						cancelable: true,
					} )
				);
			},
			{ html: RICH_HTML, plain: RICH_PLAIN }
		);

		await expect( input ).toHaveValue( EXPECTED_MD );

		await app.close();
		fixture.cleanup();
	} );

	test( 'chat composer leaves plain-text-only paste untouched', async () => {
		const fixture = seedLinkedProjects( 1 );

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const input = win.locator( '[data-testid=chat-input]' );
		await expect( input ).toBeVisible();

		// Start with some user-typed text; paste a plain-text-only payload at
		// the caret. The handler must NOT preventDefault — so the browser's
		// own paste must insert the text.
		await input.fill( 'before  after' );
		await input.evaluate( ( el ) => {
			const ta = el as HTMLTextAreaElement;
			ta.focus();
			ta.setSelectionRange( 7, 7 );
		} );
		await input.press( 'X' );
		// Sanity check that the typing produced the expected midpoint insert.
		await expect( input ).toHaveValue( 'before X after' );
	} );

	test( 'draft editor converts pasted HTML to markdown on disk', async () => {
		const fixture = seedLinkedProjects( 1, {
			'drafts/blank.md': '---\ntitle: Blank\n---\n\n# Blank\n\n',
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
			.locator( `[data-testid="draft-row-${ project.id }-blank.md"]` )
			.click();
		await win
			.locator( '[data-testid=draft-editor-host][data-status=ready]' )
			.waitFor();

		await win.locator( '.cm-content' ).evaluate(
			( el, { html, plain } ) => {
				( el as HTMLElement ).focus();
				const dt = new DataTransfer();
				dt.setData( 'text/html', html );
				dt.setData( 'text/plain', plain );
				el.dispatchEvent(
					new ClipboardEvent( 'paste', {
						clipboardData: dt,
						bubbles: true,
						cancelable: true,
					} )
				);
			},
			{ html: RICH_HTML, plain: RICH_PLAIN }
		);

		await expect(
			win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', 'saved', { timeout: 5_000 } );

		const onDisk = fs.readFileSync(
			path.join( project.path, 'drafts', 'blank.md' ),
			'utf-8'
		);
		expect( onDisk ).toContain( '# Title' );
		expect( onDisk ).toContain( 'Hello **world** and _style_' );
		expect( onDisk ).toContain( '- one\n- two' );
		expect( onDisk ).toContain( '[link](https://example.com)' );

		await app.close();
		fixture.cleanup();
	} );
} );
