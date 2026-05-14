import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { WebContents } from 'electron';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
	subscribe,
	unsubscribe,
} from '../../src/main/channels/utils/note-watcher';

// Minimal WebContents stand-in. The watcher only reads isDestroyed() and
// hooks the 'destroyed' event for cleanup. We never fire 'destroyed' in
// these tests; callers explicitly call unsubscribe() to tear down.
function makeWebContents(): WebContents {
	let destroyed = false;
	const destroyedHandlers: Array< () => void > = [];
	return {
		isDestroyed: () => destroyed,
		// once is the only listener API the watcher uses.
		once: ( ev: string, fn: () => void ) => {
			if ( ev === 'destroyed' ) {
				destroyedHandlers.push( fn );
			}
		},
		// Test-only escape hatch so we can simulate a window close.
		destroy: () => {
			destroyed = true;
			for ( const fn of destroyedHandlers ) {
				fn();
			}
		},
	} as unknown as WebContents;
}

let workDir: string;

beforeEach( () => {
	workDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-note-watcher-' ) );
} );

afterEach( () => {
	fs.rmSync( workDir, { recursive: true, force: true } );
} );

// fs.watch fires events on its own event loop tick; the watcher then
// schedules a 50 ms debounce. 250 ms is generous enough to be reliable on
// CI without making the suite drag.
function delay( ms: number ): Promise< void > {
	return new Promise( ( r ) => setTimeout( r, ms ) );
}

describe( 'note-watcher', () => {
	test( 'fires onChange with the new mtime when the watched file changes', async () => {
		const filePath = path.join( workDir, 'note.md' );
		fs.writeFileSync( filePath, 'v1' );
		const wc = makeWebContents();
		const calls: Array< number | null > = [];
		subscribe( wc, filePath, ( m ) => calls.push( m ) );

		// Bump mtime explicitly — same-content writes within the 1 ms
		// resolution can be invisible to fs.stat on coarse-grained FSes.
		fs.writeFileSync( filePath, 'v2' );
		fs.utimesSync(
			filePath,
			new Date( Date.now() + 1000 ),
			new Date( Date.now() + 1000 )
		);

		await delay( 250 );
		unsubscribe( wc );

		expect( calls.length ).toBeGreaterThanOrEqual( 1 );
		expect( calls[ calls.length - 1 ] ).not.toBeNull();
	} );

	test( 'debounces multiple rapid writes into one onChange call', async () => {
		const filePath = path.join( workDir, 'note.md' );
		fs.writeFileSync( filePath, 'v1' );
		const wc = makeWebContents();
		const calls: Array< number | null > = [];
		subscribe( wc, filePath, ( m ) => calls.push( m ) );

		// Three writes inside the 50 ms debounce window — all fold into one.
		fs.writeFileSync( filePath, 'v2' );
		fs.writeFileSync( filePath, 'v3' );
		fs.writeFileSync( filePath, 'v4' );

		await delay( 250 );
		unsubscribe( wc );

		expect( calls.length ).toBe( 1 );
	} );

	test( 'ignores writes to other files in the same directory', async () => {
		const watched = path.join( workDir, 'watched.md' );
		const sibling = path.join( workDir, 'sibling.md' );
		fs.writeFileSync( watched, 'v1' );
		fs.writeFileSync( sibling, 's1' );
		const wc = makeWebContents();
		const calls: Array< number | null > = [];
		subscribe( wc, watched, ( m ) => calls.push( m ) );

		fs.writeFileSync( sibling, 's2' );
		await delay( 250 );

		expect( calls.length ).toBe( 0 );

		// Sanity: writing to the watched file still fires.
		fs.writeFileSync( watched, 'v2' );
		await delay( 250 );
		unsubscribe( wc );

		expect( calls.length ).toBeGreaterThanOrEqual( 1 );
	} );

	test( 'fires onChange(null) when the watched file is deleted', async () => {
		const filePath = path.join( workDir, 'note.md' );
		fs.writeFileSync( filePath, 'v1' );
		const wc = makeWebContents();
		const calls: Array< number | null > = [];
		subscribe( wc, filePath, ( m ) => calls.push( m ) );

		fs.unlinkSync( filePath );
		await delay( 250 );
		unsubscribe( wc );

		expect( calls.length ).toBeGreaterThanOrEqual( 1 );
		expect( calls[ calls.length - 1 ] ).toBeNull();
	} );

	test( 'subscribe replaces a prior subscription on the same webContents', async () => {
		const fileA = path.join( workDir, 'a.md' );
		const fileB = path.join( workDir, 'b.md' );
		fs.writeFileSync( fileA, 'a1' );
		fs.writeFileSync( fileB, 'b1' );
		const wc = makeWebContents();
		const callsA: Array< number | null > = [];
		const callsB: Array< number | null > = [];

		subscribe( wc, fileA, ( m ) => callsA.push( m ) );
		// Switch — prior watcher must be torn down.
		subscribe( wc, fileB, ( m ) => callsB.push( m ) );

		fs.writeFileSync( fileA, 'a2' );
		fs.writeFileSync( fileB, 'b2' );
		await delay( 250 );
		unsubscribe( wc );

		expect( callsA.length ).toBe( 0 );
		expect( callsB.length ).toBeGreaterThanOrEqual( 1 );
	} );

	test( 'unsubscribe stops further onChange calls', async () => {
		const filePath = path.join( workDir, 'note.md' );
		fs.writeFileSync( filePath, 'v1' );
		const wc = makeWebContents();
		const calls: Array< number | null > = [];
		subscribe( wc, filePath, ( m ) => calls.push( m ) );
		unsubscribe( wc );

		fs.writeFileSync( filePath, 'v2' );
		await delay( 250 );

		expect( calls.length ).toBe( 0 );
	} );
} );
