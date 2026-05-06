import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted( () => ( {
	saveDialogResult: { canceled: false, filePath: '' } as {
		canceled: boolean;
		filePath: string;
	},
	saveDialogCalls: [] as Array< unknown >,
	downloadsDir: '',
} ) );

vi.mock( 'electron', () => ( {
	app: {
		getPath: ( name: string ) => {
			if ( name === 'downloads' ) {
				return mocks.downloadsDir;
			}
			throw new Error( `Unexpected app.getPath(${ name })` );
		},
	},
	BrowserWindow: {
		fromWebContents: (): null => null,
	},
	dialog: {
		showSaveDialog: (
			...args: unknown[]
		): Promise< {
			canceled: boolean;
			filePath: string;
		} > => {
			mocks.saveDialogCalls.push( args );
			return Promise.resolve( mocks.saveDialogResult );
		},
	},
} ) );

import { draftsExport } from '../../src/main/channels/drafts-export';

beforeEach( () => {
	mocks.downloadsDir = fs.mkdtempSync(
		path.join( os.tmpdir(), 'sw-drafts-export-downloads-' )
	);
	mocks.saveDialogCalls = [];
	mocks.saveDialogResult = { canceled: false, filePath: '' };
} );

describe( 'drafts:export', () => {
	test( 'cancelled dialog returns status: cancelled and writes nothing', async () => {
		mocks.saveDialogResult = { canceled: true, filePath: '' };

		const result = ( await draftsExport.invoke( {} as never, {
			relPath: 'note.md',
			body: 'Hello world.',
		} ) ) as { status: string };

		expect( result.status ).toBe( 'cancelled' );
		expect( fs.readdirSync( mocks.downloadsDir ) ).toHaveLength( 0 );
	} );

	test( 'saved dialog writes the body to the chosen path', async () => {
		const target = path.join( mocks.downloadsDir, 'picked.md' );
		mocks.saveDialogResult = { canceled: false, filePath: target };

		const result = ( await draftsExport.invoke( {} as never, {
			relPath: 'note.md',
			body: '# Heading\n\nBody.\n',
		} ) ) as { status: string; filePath: string };

		expect( result.status ).toBe( 'saved' );
		expect( result.filePath ).toBe( target );
		expect( fs.readFileSync( target, 'utf-8' ) ).toBe(
			'# Heading\n\nBody.\n'
		);
	} );

	test( 'defaultPath uses basename of relPath under app downloads dir', async () => {
		const target = path.join( mocks.downloadsDir, 'whatever.md' );
		mocks.saveDialogResult = { canceled: false, filePath: target };

		await draftsExport.invoke( {} as never, {
			relPath: 'nested/folder/my-draft.md',
			body: 'x',
		} );

		const args = mocks.saveDialogCalls[ 0 ] as Array< {
			defaultPath: string;
			filters: Array< { name: string; extensions: string[] } >;
		} >;
		// Without a parent BrowserWindow, electron is called as showSaveDialog(opts).
		const opts = args[ 0 ];
		expect( opts.defaultPath ).toBe(
			path.join( mocks.downloadsDir, 'my-draft.md' )
		);
		expect( opts.filters[ 0 ] ).toEqual( {
			name: 'Markdown',
			extensions: [ 'md' ],
		} );
	} );

	test( 'IO error surfaces as status: error / io-error', async () => {
		// Point the picker at a path whose parent directory does not exist.
		mocks.saveDialogResult = {
			canceled: false,
			filePath: path.join( mocks.downloadsDir, 'missing-dir', 'x.md' ),
		};

		const result = ( await draftsExport.invoke( {} as never, {
			relPath: 'note.md',
			body: 'Hi',
		} ) ) as { status: string; reason?: string };

		expect( result.status ).toBe( 'error' );
		expect( result.reason ).toBe( 'io-error' );
	} );

	test( 'rejects oversize body via zod cap', () => {
		const oversize = 'a'.repeat( 26_000_000 );
		expect( () =>
			draftsExport.invoke( {} as never, {
				relPath: 'big.md',
				body: oversize,
			} )
		).toThrow();
	} );
} );
