import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

function writeDraft(
	projectPath: string,
	fileName: string,
	body: string
): void {
	const dir = path.join( projectPath, 'drafts' );
	fs.mkdirSync( dir, { recursive: true } );
	fs.writeFileSync( path.join( dir, fileName ), body, 'utf-8' );
}

const SAMPLE = [
	'---',
	'title: Toolbar test',
	'---',
	'',
	'First paragraph for selection tests.',
	'',
	'Second paragraph here.',
].join( '\n' );

async function openDraft(): Promise< {
	app: Awaited< ReturnType< typeof electron.launch > >;
	win: Awaited<
		ReturnType<
			Awaited< ReturnType< typeof electron.launch > >[ 'firstWindow' ]
		>
	>;
	project: ReturnType< typeof seedLinkedProjects >[ 'projects' ][ number ];
	cleanup: () => void;
} > {
	const fixture = seedLinkedProjects( 1 );
	const [ project ] = fixture.projects;
	writeDraft( project.path, 'extras.md', SAMPLE );
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
		.locator( `[data-testid="draft-row-${ project.id }-extras.md"]` )
		.click();
	await win
		.locator( '[data-testid=draft-editor-host][data-status=ready]' )
		.waitFor();
	return {
		app,
		win,
		project,
		cleanup: async () => {
			await app.close();
			fixture.cleanup();
		},
	};
}

test.describe( 'formatting toolbar', () => {
	test( 'title input lives in the writing column, not the header', async () => {
		const ctx = await openDraft();
		const titleInsideContainer = await ctx.win.evaluate( () => {
			const input = document.querySelector(
				'[data-testid=draft-editor-title-input]'
			);
			return !! input?.closest( '.draft-editor-title-container' );
		} );
		const titleInsideHeader = await ctx.win.evaluate( () => {
			const input = document.querySelector(
				'[data-testid=draft-editor-title-input]'
			);
			return !! input?.closest( '.draft-editor-header' );
		} );
		expect( titleInsideContainer ).toBe( true );
		expect( titleInsideHeader ).toBe( false );
		await ctx.cleanup();
	} );

	test( 'arrow traversal between title and body', async () => {
		const ctx = await openDraft();
		// title + ArrowDown -> body offset 0
		await ctx.win
			.locator( '[data-testid=draft-editor-title-input]' )
			.focus();
		await ctx.win.keyboard.press( 'End' );
		await ctx.win.keyboard.press( 'ArrowDown' );
		const inEditor = await ctx.win.evaluate(
			() => !! window.document.activeElement?.closest( '.cm-editor' )
		);
		expect( inEditor ).toBe( true );

		// body + ArrowUp -> title (caret at end)
		await ctx.win.keyboard.press( 'ArrowUp' );
		const back = await ctx.win.evaluate( () => {
			const a = window.document.activeElement as HTMLInputElement | null;
			return {
				isInput:
					a?.getAttribute( 'data-testid' ) ===
					'draft-editor-title-input',
				caret: a?.selectionStart,
				len: a?.value.length,
			};
		} );
		expect( back.isInput ).toBe( true );
		expect( back.caret ).toBe( back.len );

		await ctx.cleanup();
	} );

	test( 'toolbar visibility tied to selection', async () => {
		const ctx = await openDraft();
		const visibleEmpty = await ctx.win
			.locator( '[data-testid=draft-editor-toolbar]' )
			.getAttribute( 'data-visible' );
		expect( visibleEmpty ).toBe( 'false' );

		// Select a word
		await ctx.win.locator( '.cm-content' ).click();
		await ctx.win.keyboard.press( 'Meta+a' );
		await ctx.win.waitForTimeout( 100 );
		const visibleSel = await ctx.win
			.locator( '[data-testid=draft-editor-toolbar]' )
			.getAttribute( 'data-visible' );
		expect( visibleSel ).toBe( 'true' );

		await ctx.cleanup();
	} );

	test( 'bold button wraps selection on disk', async () => {
		const ctx = await openDraft();
		await ctx.win.locator( '.cm-content' ).click();
		// Select "First" word
		await ctx.win.keyboard.press( 'Meta+Home' );
		await ctx.win.keyboard.press( 'ArrowDown' );
		await ctx.win.keyboard.press( 'Shift+End' );
		await ctx.win.locator( '[data-testid=toolbar-bold]' ).click();
		await expect(
			ctx.win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', 'saved', { timeout: 5_000 } );
		const onDisk = fs.readFileSync(
			path.join( ctx.project.path, 'drafts', 'extras.md' ),
			'utf-8'
		);
		expect( onDisk ).toContain(
			'**First paragraph for selection tests.**'
		);
		await ctx.cleanup();
	} );

	test( 'block dropdown shows current style and toggles heading', async () => {
		const ctx = await openDraft();
		// Click into the editor and select a whole paragraph line so the
		// toolbar reveals.
		await ctx.win.locator( '.cm-content' ).click();
		await ctx.win.keyboard.press( 'Meta+Home' );
		await ctx.win.keyboard.press( 'ArrowDown' ); // move to line 1
		await ctx.win.keyboard.press( 'Home' );
		await ctx.win.keyboard.press( 'Shift+End' );
		await ctx.win.waitForTimeout( 150 );
		await expect(
			ctx.win.locator( '[data-testid=toolbar-block-trigger]' )
		).toContainText( 'Paragraph' );
		await ctx.win.locator( '[data-testid=toolbar-block-trigger]' ).click();
		await expect(
			ctx.win.locator( '[data-testid=toolbar-block-menu]' )
		).toBeVisible();
		await ctx.win.locator( '[data-testid=toolbar-block-h2]' ).click();
		await expect(
			ctx.win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', 'saved', { timeout: 5_000 } );
		const onDisk = fs.readFileSync(
			path.join( ctx.project.path, 'drafts', 'extras.md' ),
			'utf-8'
		);
		expect( onDisk ).toContain( '## First paragraph for selection tests.' );
		await ctx.cleanup();
	} );

	test( 'bold toggles off on second press (no marker stacking)', async () => {
		const ctx = await openDraft();
		await ctx.win.locator( '.cm-content' ).click();
		await ctx.win.keyboard.press( 'Meta+Home' );
		await ctx.win.keyboard.press( 'ArrowDown' );
		await ctx.win.keyboard.press( 'Home' );
		await ctx.win.keyboard.press( 'Shift+End' );
		// First press: wrap. Wait for save to settle.
		await ctx.win.locator( '[data-testid=toolbar-bold]' ).click();
		await expect(
			ctx.win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', 'saved', { timeout: 5_000 } );
		const afterFirst = fs.readFileSync(
			path.join( ctx.project.path, 'drafts', 'extras.md' ),
			'utf-8'
		);
		expect( afterFirst ).toContain(
			'**First paragraph for selection tests.**'
		);
		// Second press: should unwrap (NOT produce ****…****). The status
		// pill is already "saved" from the first save, so wait for it to
		// transition through dirty/saving and back to saved before reading
		// disk — otherwise we'd race the debounced auto-save.
		await ctx.win.locator( '[data-testid=toolbar-bold]' ).click();
		await expect(
			ctx.win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', /dirty|saving/, { timeout: 2_000 } );
		await expect(
			ctx.win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', 'saved', { timeout: 5_000 } );
		const afterSecond = fs.readFileSync(
			path.join( ctx.project.path, 'drafts', 'extras.md' ),
			'utf-8'
		);
		expect( afterSecond ).toContain(
			'First paragraph for selection tests.'
		);
		expect( afterSecond ).not.toMatch( /\*{4}/ );
		expect( afterSecond ).not.toMatch( /\*\*First paragraph/ );
		await ctx.cleanup();
	} );

	test( 'bold on a sub-range splits the bold (partial unwrap)', async () => {
		const ctx = await openDraft();
		// Build "1234567" at the end of the doc, bold it, then select
		// "345" inside the bold and bold again — only the middle should
		// lose bold; "12" and "67" remain bold.
		await ctx.win.locator( '.cm-content' ).click();
		await ctx.win.keyboard.press( 'Meta+End' );
		await ctx.win.keyboard.press( 'Enter' );
		await ctx.win.keyboard.type( '1234567' );
		await ctx.win.keyboard.press( 'Shift+Home' );
		await ctx.win.locator( '[data-testid=toolbar-bold]' ).click();
		await expect(
			ctx.win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', 'saved', { timeout: 5_000 } );
		// Move cursor to where "3" is and select 3 chars (345).
		await ctx.win.keyboard.press( 'Home' );
		// Caret is now at start of the line, before `**`. Step over the
		// opening `**` and over `12` to land on `3`.
		for ( let i = 0; i < 4; i++ ) {
			await ctx.win.keyboard.press( 'ArrowRight' );
		}
		await ctx.win.keyboard.press( 'Shift+ArrowRight' );
		await ctx.win.keyboard.press( 'Shift+ArrowRight' );
		await ctx.win.keyboard.press( 'Shift+ArrowRight' );
		await ctx.win.locator( '[data-testid=toolbar-bold]' ).click();
		await expect(
			ctx.win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', /dirty|saving/, { timeout: 2_000 } );
		await expect(
			ctx.win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', 'saved', { timeout: 5_000 } );
		const onDisk = fs.readFileSync(
			path.join( ctx.project.path, 'drafts', 'extras.md' ),
			'utf-8'
		);
		expect( onDisk ).toContain( '**12**345**67**' );
		await ctx.cleanup();
	} );

	test( 'inline marks hide unless cursor touches the formatting span', async () => {
		const ctx = await openDraft();
		// Add a paragraph with mixed inline marks and plenty of plain text
		// before/after so we can park the cursor far from the spans.
		await ctx.win.locator( '.cm-content' ).click();
		await ctx.win.keyboard.press( 'Meta+End' );
		await ctx.win.keyboard.press( 'Enter' );
		await ctx.win.keyboard.type(
			'plain start **bolded** plain middle *italicized* plain end'
		);
		// Click into the very last "plain end" so the selection collapses
		// far from any markup span.
		await ctx.win.keyboard.press( 'End' );
		await ctx.win.waitForTimeout( 100 );
		const visibleAway = await ctx.win.evaluate( () => {
			const lines = Array.from(
				window.document.querySelectorAll( '.cm-line' )
			);
			const last = lines[ lines.length - 1 ];
			return last?.textContent ?? '';
		} );
		// Marks for the bold and italic spans should NOT appear when the
		// cursor is in plain prose on the same line.
		expect( visibleAway ).not.toContain( '**' );
		expect( visibleAway ).not.toMatch( /\*italicized\*/ );

		// Move the cursor inside the bold span: marks reappear.
		await ctx.win.keyboard.press( 'Home' );
		// Step over "plain start " (12 chars) then over the opening `**`
		// (2 chars) plus 2 chars of "bolded" so we land inside.
		for ( let i = 0; i < 16; i++ ) {
			await ctx.win.keyboard.press( 'ArrowRight' );
		}
		await ctx.win.waitForTimeout( 100 );
		const visibleInsideBold = await ctx.win.evaluate( () => {
			const lines = Array.from(
				window.document.querySelectorAll( '.cm-line' )
			);
			const last = lines[ lines.length - 1 ];
			return last?.textContent ?? '';
		} );
		expect( visibleInsideBold ).toContain( '**bolded**' );
		// Italic span is still elsewhere on the same line, so its marks
		// remain hidden.
		expect( visibleInsideBold ).not.toMatch( /\*italicized\*/ );

		await ctx.cleanup();
	} );

	test( 'clear formatting strips inline markers', async () => {
		const ctx = await openDraft();
		// Type **bold** at end then select it
		await ctx.win.locator( '.cm-content' ).click();
		await ctx.win.keyboard.press( 'Meta+End' );
		await ctx.win.keyboard.press( 'Enter' );
		await ctx.win.keyboard.type( 'extra' );
		await ctx.win.keyboard.press( 'Shift+Home' );
		await ctx.win.locator( '[data-testid=toolbar-bold]' ).click();
		await ctx.win.waitForTimeout( 200 );
		// Selection is now "**extra**" — wrap-around-the-marker selection.
		// Re-select it precisely:
		await ctx.win.keyboard.press( 'Home' );
		await ctx.win.keyboard.press( 'Shift+End' );
		await ctx.win.locator( '[data-testid=toolbar-clear]' ).click();
		await expect(
			ctx.win.locator( '[data-testid=draft-editor-status]' )
		).toHaveAttribute( 'data-state', 'saved', { timeout: 5_000 } );
		const onDisk = fs.readFileSync(
			path.join( ctx.project.path, 'drafts', 'extras.md' ),
			'utf-8'
		);
		expect( onDisk ).toContain( 'extra' );
		expect( onDisk ).not.toMatch( /\*\*extra\*\*/ );
		await ctx.cleanup();
	} );
} );
