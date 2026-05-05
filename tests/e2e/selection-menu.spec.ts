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
	'title: Selection menu test',
	'---',
	'',
	'First paragraph for selection menu tests.',
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
	cleanup: () => void;
} > {
	const fixture = seedLinkedProjects( 1 );
	const [ project ] = fixture.projects;
	writeDraft( project.path, 'sel.md', SAMPLE );
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
		.locator( `[data-testid="draft-row-${ project.id }-sel.md"]` )
		.click();
	await win
		.locator( '[data-testid=draft-editor-host][data-status=ready]' )
		.waitFor();
	return {
		app,
		win,
		cleanup: async () => {
			await app.close();
			fixture.cleanup();
		},
	};
}

test.describe( 'selection menu', () => {
	test( 'hidden when selection is empty', async () => {
		const ctx = await openDraft();
		await ctx.win.locator( '.cm-content' ).click();
		await ctx.win.waitForTimeout( 100 );
		await expect(
			ctx.win.locator( '[data-testid=selection-menu]' )
		).toHaveCount( 0 );
		await ctx.cleanup();
	} );

	test( 'appears with Edit and Chat when text is selected, hides on collapse', async () => {
		const ctx = await openDraft();
		await ctx.win.locator( '.cm-content' ).click();
		await ctx.win.keyboard.press( 'Meta+Home' );
		await ctx.win.keyboard.press( 'ArrowDown' );
		await ctx.win.keyboard.press( 'Home' );
		await ctx.win.keyboard.press( 'Shift+End' );

		const menu = ctx.win.locator( '[data-testid=selection-menu]' );
		await expect( menu ).toBeVisible();
		await expect(
			ctx.win.locator( '[data-testid=selection-menu-edit]' )
		).toBeVisible();
		await expect(
			ctx.win.locator( '[data-testid=selection-menu-chat]' )
		).toBeVisible();

		// Pinned to the right edge of the scroll container with a gutter.
		const placement = await ctx.win.evaluate( () => {
			const m = document.querySelector( '[data-testid=selection-menu]' );
			const s = document.querySelector(
				'[data-testid=draft-editor-scroll]'
			);
			if ( ! m || ! s ) {
				return null;
			}
			const mr = m.getBoundingClientRect();
			const sr = s.getBoundingClientRect();
			return { gutter: sr.right - mr.right, menuLeft: mr.left };
		} );
		expect( placement ).not.toBeNull();
		expect( placement!.gutter ).toBeGreaterThan( 0 );
		expect( placement!.gutter ).toBeLessThan( 64 );

		// Collapse the selection — menu should disappear.
		await ctx.win.keyboard.press( 'ArrowRight' );
		await expect( menu ).toHaveCount( 0 );
		await ctx.cleanup();
	} );

	test( 'clicking Edit preserves the selection', async () => {
		const ctx = await openDraft();
		await ctx.win.locator( '.cm-content' ).click();
		await ctx.win.keyboard.press( 'Meta+Home' );
		await ctx.win.keyboard.press( 'ArrowDown' );
		await ctx.win.keyboard.press( 'Home' );
		await ctx.win.keyboard.press( 'Shift+End' );
		await expect(
			ctx.win.locator( '[data-testid=selection-menu]' )
		).toBeVisible();

		await ctx.win.locator( '[data-testid=selection-menu-edit]' ).click();

		// Menu still on screen and selection still non-empty (button mousedown
		// preventDefault holds the selection).
		await expect(
			ctx.win.locator( '[data-testid=selection-menu]' )
		).toBeVisible();
		const selectionLen = await ctx.win.evaluate( () => {
			const view = document.defaultView;
			return view?.getSelection()?.toString().length ?? 0;
		} );
		expect( selectionLen ).toBeGreaterThan( 0 );
		await ctx.cleanup();
	} );
} );
