import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import matter from 'gray-matter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// All channels go through `getProject` which reads from the persistent
// project store. We mock it so tests can declare a synthetic project
// pointing at a tmp directory without standing up the real Electron app.
let mockProject: { id: string; path: string } | null = null;
vi.mock( '../../src/main/channels/utils/project-get', () => ( {
	getProject: ( id: string ) =>
		mockProject && mockProject.id === id ? mockProject : null,
} ) );

// Reset-defaults reads bundled files from the repo's `resources/checks-defaults/`
// dir at runtime. The resolver normally checks the packaged path first; in
// unit tests neither path matches Electron's runtime, so we point it at the
// real repo path directly.
vi.mock( '../../src/main/channels/utils/resource-paths', () => ( {
	resolveBundledChecksDefaultsDir: () =>
		path.join( process.cwd(), 'resources', 'checks-defaults' ),
} ) );

import { checksCreate } from '../../src/main/channels/checks-create';
import { checksDelete } from '../../src/main/channels/checks-delete';
import { checksList } from '../../src/main/channels/checks-list';
import { checksRead } from '../../src/main/channels/checks-read';
import { checksResetDefaults } from '../../src/main/channels/checks-reset-defaults';
import { checksWrite } from '../../src/main/channels/checks-write';

function asInvoke< T >( channel: { invoke: ( e: unknown, p: unknown ) => T } ) {
	return ( payload: unknown ) => channel.invoke( {} as never, payload );
}

let projectDir: string;

beforeEach( () => {
	projectDir = fs.mkdtempSync(
		path.join( os.tmpdir(), 'checks-channels-test-' )
	);
	mockProject = { id: 'p1', path: projectDir };
} );

afterEach( () => {
	mockProject = null;
	try {
		fs.rmSync( projectDir, { recursive: true, force: true } );
	} catch {
		// best effort
	}
} );

describe( 'checks:list', () => {
	const list = asInvoke( checksList );

	it( 'returns [] when checks/ does not exist', () => {
		expect( list( { projectId: 'p1' } ) ).toEqual( [] );
	} );

	it( 'returns [] when the project is unknown', () => {
		expect( list( { projectId: 'nope' } ) ).toEqual( [] );
	} );

	it( 'lists markdown files with parsed title + enabled', () => {
		fs.mkdirSync( path.join( projectDir, 'checks' ) );
		fs.writeFileSync(
			path.join( projectDir, 'checks', 'a.md' ),
			'---\ntitle: Alpha\nenabled: true\n---\nbody'
		);
		fs.writeFileSync(
			path.join( projectDir, 'checks', 'b.md' ),
			'---\ntitle: Beta\nenabled: false\n---\nbody'
		);
		const out = list( { projectId: 'p1' } ) as Array< {
			relPath: string;
			title: string;
			enabled: boolean;
			parseError: string | null;
		} >;
		expect( out.map( ( o ) => o.relPath ).sort() ).toEqual( [
			'a.md',
			'b.md',
		] );
		const a = out.find( ( o ) => o.relPath === 'a.md' )!;
		const b = out.find( ( o ) => o.relPath === 'b.md' )!;
		expect( a.title ).toBe( 'Alpha' );
		expect( a.enabled ).toBe( true );
		expect( a.parseError ).toBeNull();
		expect( b.enabled ).toBe( false );
	} );

	it( 'skips dotfiles and non-markdown', () => {
		fs.mkdirSync( path.join( projectDir, 'checks' ) );
		fs.writeFileSync( path.join( projectDir, 'checks', '.hidden.md' ), '' );
		fs.writeFileSync( path.join( projectDir, 'checks', 'note.txt' ), '' );
		fs.writeFileSync(
			path.join( projectDir, 'checks', 'real.md' ),
			'---\ntitle: Real\nenabled: true\n---\nbody'
		);
		const out = list( { projectId: 'p1' } ) as Array< { relPath: string } >;
		expect( out.map( ( o ) => o.relPath ) ).toEqual( [ 'real.md' ] );
	} );

	it( 'surfaces invalid frontmatter via parseError instead of aborting', () => {
		fs.mkdirSync( path.join( projectDir, 'checks' ) );
		fs.writeFileSync(
			path.join( projectDir, 'checks', 'broken.md' ),
			'---\ntitle: [unbalanced\n---\nbody'
		);
		fs.writeFileSync(
			path.join( projectDir, 'checks', 'good.md' ),
			'---\ntitle: Good\nenabled: true\n---\nbody'
		);
		const out = list( { projectId: 'p1' } ) as Array< {
			relPath: string;
			parseError: string | null;
		} >;
		const broken = out.find( ( o ) => o.relPath === 'broken.md' )!;
		const good = out.find( ( o ) => o.relPath === 'good.md' )!;
		expect( broken.parseError ).toBe( 'yaml-syntax' );
		expect( good.parseError ).toBeNull();
	} );

	it( 'sorts by order ascending, then alphabetically for entries without order', () => {
		fs.mkdirSync( path.join( projectDir, 'checks' ) );
		// Deliberately mix: small `order`, large `order`, two orderless files
		// whose alphabetical relative order matters.
		fs.writeFileSync(
			path.join( projectDir, 'checks', 'mid.md' ),
			'---\ntitle: Mid\nenabled: true\norder: 50\n---\nbody'
		);
		fs.writeFileSync(
			path.join( projectDir, 'checks', 'first.md' ),
			'---\ntitle: First\nenabled: true\norder: 5\n---\nbody'
		);
		fs.writeFileSync(
			path.join( projectDir, 'checks', 'zebra-user.md' ),
			'---\ntitle: Zebra\nenabled: true\n---\nbody'
		);
		fs.writeFileSync(
			path.join( projectDir, 'checks', 'apple-user.md' ),
			'---\ntitle: Apple\nenabled: true\n---\nbody'
		);
		const out = list( { projectId: 'p1' } ) as Array< {
			relPath: string;
			order: number | null;
		} >;
		expect( out.map( ( o ) => o.relPath ) ).toEqual( [
			'first.md',
			'mid.md',
			'apple-user.md',
			'zebra-user.md',
		] );
		expect( out.map( ( o ) => o.order ) ).toEqual( [ 5, 50, null, null ] );
	} );
} );

describe( 'checks:create + checks:read + checks:write', () => {
	const create = asInvoke( checksCreate );
	const read = asInvoke( checksRead );
	const write = asInvoke( checksWrite );

	it( 'creates an Untitled check with enabled: true', () => {
		const result = create( { projectId: 'p1' } ) as {
			ok: boolean;
			relPath: string;
			title: string;
		};
		expect( result.ok ).toBe( true );
		expect( result.relPath ).toBe( 'untitled-check.md' );
		expect( result.title ).toBe( 'Untitled check' );
		const onDisk = fs.readFileSync(
			path.join( projectDir, 'checks', 'untitled-check.md' ),
			'utf-8'
		);
		const fm = matter( onDisk ).data as Record< string, unknown >;
		expect( fm.title ).toBe( 'Untitled check' );
		expect( fm.enabled ).toBe( true );
	} );

	it( 'creates unique sibling names on collision', () => {
		create( { projectId: 'p1' } );
		const second = create( { projectId: 'p1' } ) as { relPath: string };
		expect( second.relPath ).toBe( 'untitled-check-2.md' );
	} );

	it( 'round-trips title, enabled, body, frontmatter via write -> read', () => {
		create( { projectId: 'p1' } );
		const initial = read( {
			projectId: 'p1',
			relPath: 'untitled-check.md',
		} ) as { mtime: number };
		const writeResult = write( {
			projectId: 'p1',
			relPath: 'untitled-check.md',
			title: 'Vague words',
			enabled: false,
			body: 'Flag vague hedging.',
			frontmatter: { extra: 'value' },
			expectedMtime: initial.mtime,
		} ) as { ok: boolean };
		expect( writeResult.ok ).toBe( true );
		const after = read( {
			projectId: 'p1',
			relPath: 'untitled-check.md',
		} ) as {
			title: string;
			enabled: boolean;
			body: string;
			frontmatter: Record< string, unknown >;
		};
		expect( after.title ).toBe( 'Vague words' );
		expect( after.enabled ).toBe( false );
		expect( after.body.trim() ).toBe( 'Flag vague hedging.' );
		expect( after.frontmatter.extra ).toBe( 'value' );
	} );

	it( 'write rejects mtime drift', () => {
		create( { projectId: 'p1' } );
		const result = write( {
			projectId: 'p1',
			relPath: 'untitled-check.md',
			title: 'X',
			enabled: true,
			body: 'b',
			frontmatter: {},
			// Wrong mtime — should refuse.
			expectedMtime: 123456,
		} ) as { ok: false; reason: string };
		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'mtime-conflict' );
	} );

	it( 'read refuses paths that escape the checks/ root', () => {
		fs.writeFileSync( path.join( projectDir, 'sneaky.md' ), 'oops' );
		const result = read( {
			projectId: 'p1',
			relPath: '../sneaky.md',
		} );
		expect( result ).toBeNull();
	} );
} );

describe( 'checks:delete', () => {
	const create = asInvoke( checksCreate );
	const del = asInvoke( checksDelete );

	it( 'removes the file', () => {
		create( { projectId: 'p1' } );
		const result = del( {
			projectId: 'p1',
			relPath: 'untitled-check.md',
		} ) as { ok: boolean };
		expect( result.ok ).toBe( true );
		expect(
			fs.existsSync(
				path.join( projectDir, 'checks', 'untitled-check.md' )
			)
		).toBe( false );
	} );

	it( 'reports not-found for a missing file', () => {
		fs.mkdirSync( path.join( projectDir, 'checks' ) );
		const result = del( {
			projectId: 'p1',
			relPath: 'nope.md',
		} ) as { ok: false; reason: string };
		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'not-found' );
	} );

	it( 'refuses escape paths', () => {
		fs.writeFileSync( path.join( projectDir, 'sneaky.md' ), 'oops' );
		const result = del( {
			projectId: 'p1',
			relPath: '../sneaky.md',
		} ) as { ok: false };
		expect( result.ok ).toBe( false );
		expect( fs.existsSync( path.join( projectDir, 'sneaky.md' ) ) ).toBe(
			true
		);
	} );
} );

describe( 'checks:resetDefaults', () => {
	const reset = asInvoke( checksResetDefaults );

	it( 'creates checks/ and writes the bundled defaults', () => {
		const result = reset( { projectId: 'p1' } ) as {
			ok: boolean;
			written: string[];
		};
		expect( result.ok ).toBe( true );
		expect( result.written.sort() ).toEqual( [
			'bezos.md',
			'brevity.md',
			'grammar-spelling.md',
			'orwell.md',
			'passive-voice.md',
			'strunk-white.md',
			'voice.md',
			'zinsser.md',
		] );
		const enabledByDefault = new Set( [
			'brevity.md',
			'grammar-spelling.md',
			'passive-voice.md',
			'voice.md',
		] );
		for ( const name of result.written ) {
			const raw = fs.readFileSync(
				path.join( projectDir, 'checks', name ),
				'utf-8'
			);
			const fm = matter( raw ).data as Record< string, unknown >;
			expect( typeof fm.title ).toBe( 'string' );
			expect( fm.enabled ).toBe( enabledByDefault.has( name ) );
		}
	} );

	it( 'overwrites user edits to the default files', () => {
		fs.mkdirSync( path.join( projectDir, 'checks' ) );
		fs.writeFileSync(
			path.join( projectDir, 'checks', 'brevity.md' ),
			'---\ntitle: My custom\nenabled: false\n---\ncustom body'
		);
		reset( { projectId: 'p1' } );
		const raw = fs.readFileSync(
			path.join( projectDir, 'checks', 'brevity.md' ),
			'utf-8'
		);
		const fm = matter( raw ).data as Record< string, unknown >;
		expect( fm.title ).toBe( 'Brevity' );
		expect( fm.enabled ).toBe( true );
		expect( raw ).not.toContain( 'custom body' );
	} );

	it( 'leaves non-default user checks untouched', () => {
		reset( { projectId: 'p1' } );
		fs.writeFileSync(
			path.join( projectDir, 'checks', 'mine.md' ),
			'---\ntitle: Mine\nenabled: true\n---\nmy criteria'
		);
		reset( { projectId: 'p1' } );
		expect(
			fs.existsSync( path.join( projectDir, 'checks', 'mine.md' ) )
		).toBe( true );
		const raw = fs.readFileSync(
			path.join( projectDir, 'checks', 'mine.md' ),
			'utf-8'
		);
		expect( raw ).toContain( 'my criteria' );
	} );

	it( 'removes stale-named duplicates of a bundled default', () => {
		// Older app versions (or manual renames) left bundled defaults under
		// title-derived filenames. Reset should fold them back into the
		// canonical filename instead of writing a second copy.
		fs.mkdirSync( path.join( projectDir, 'checks' ) );
		fs.writeFileSync(
			path.join( projectDir, 'checks', 'amazon-writing-2.md' ),
			'---\ntitle: Amazon Writing\nenabled: false\n---\nstale body'
		);
		reset( { projectId: 'p1' } );
		expect(
			fs.existsSync(
				path.join( projectDir, 'checks', 'amazon-writing-2.md' )
			)
		).toBe( false );
		expect(
			fs.existsSync( path.join( projectDir, 'checks', 'bezos.md' ) )
		).toBe( true );
	} );

	it( 'removes stub duplicates whose only title is a filename slug', () => {
		// After opening an older title-less file in the inline editor the
		// editor saves the filename slug back as the frontmatter title. Two
		// of those (one with a `-N` create disambiguator) plus a bundled
		// canonical copy must collapse to just the canonical on reset.
		fs.mkdirSync( path.join( projectDir, 'checks' ) );
		fs.writeFileSync(
			path.join( projectDir, 'checks', 'elements-of-style.md' ),
			'---\ntitle: elements-of-style\n---\n'
		);
		fs.writeFileSync(
			path.join( projectDir, 'checks', 'elements-of-style-2.md' ),
			'---\ntitle: elements-of-style-2\n---\n'
		);
		reset( { projectId: 'p1' } );
		expect(
			fs.existsSync(
				path.join( projectDir, 'checks', 'elements-of-style.md' )
			)
		).toBe( false );
		expect(
			fs.existsSync(
				path.join( projectDir, 'checks', 'elements-of-style-2.md' )
			)
		).toBe( false );
		expect(
			fs.existsSync(
				path.join( projectDir, 'checks', 'strunk-white.md' )
			)
		).toBe( true );
	} );
} );
