import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { loadPrompt } from '../../src/main/channels/utils/prompts';

describe( 'loadPrompt', () => {
	let tmpDir: string;

	beforeEach( () => {
		tmpDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-prompts-' ) );
	} );

	afterEach( () => {
		fs.rmSync( tmpDir, { recursive: true, force: true } );
	} );

	const write = ( name: string, content: string ): string => {
		const p = path.join( tmpDir, name );
		fs.writeFileSync( p, content, 'utf-8' );
		return p;
	};

	test( 'substitutes a single {{project}} occurrence', () => {
		const file = write( 'single.txt', 'working on {{project}} today' );
		expect( loadPrompt( file, { project: '/Users/jane/docs' } ) ).toBe(
			'working on /Users/jane/docs today'
		);
	} );

	test( 'substitutes every occurrence of {{project}}', () => {
		const file = write(
			'multi.txt',
			'scope: {{project}}; read {{project}}; write {{project}}'
		);
		expect( loadPrompt( file, { project: '/a/b' } ) ).toBe(
			'scope: /a/b; read /a/b; write /a/b'
		);
	} );

	test( 'substitutes multiple distinct placeholders', () => {
		const file = write(
			'multi-vars.txt',
			'open {{file}} inside {{project}}'
		);
		expect(
			loadPrompt( file, {
				project: '/p',
				file: '/p/drafts/foo.md',
			} )
		).toBe( 'open /p/drafts/foo.md inside /p' );
	} );

	test( 'leaves unused placeholders literal', () => {
		// `{{file}}` is not in the vars map, so it should stay verbatim — that
		// way starter prompts (which only know `project`) don't break when the
		// helper signature gains new keys.
		const file = write( 'unused.txt', 'p={{project}} f={{file}}' );
		expect( loadPrompt( file, { project: '/x' } ) ).toBe(
			'p=/x f={{file}}'
		);
	} );

	test( 'leaves text without any placeholder untouched', () => {
		const file = write( 'plain.txt', 'just a prompt\nwith no vars.' );
		expect( loadPrompt( file, { project: '/anything' } ) ).toBe(
			'just a prompt\nwith no vars.'
		);
	} );

	test( 'preserves special characters in substituted values', () => {
		const file = write( 'vars.txt', '-> {{project}}' );
		const p = '/Users/jane/$weird (folder)/with spaces';
		expect( loadPrompt( file, { project: p } ) ).toBe( `-> ${ p }` );
	} );

	test( 'throws a readable error when the file is missing', () => {
		expect( () =>
			loadPrompt( path.join( tmpDir, 'does-not-exist.txt' ), {
				project: '/x',
			} )
		).toThrow( /ENOENT|no such file/i );
	} );
} );

// Content guards for the shipped prompts. These don't exercise behavior; they
// pin the anchor phrases the agent relies on. A rewrite that drops any of
// them is almost certainly a behavior change and should fail here loudly.
describe( 'shipped prompt files', () => {
	const promptsDir = path.join( process.cwd(), 'resources', 'prompts' );

	test( 'writing-assistant.txt keeps the {{project}} scope placeholder', () => {
		const text = loadPrompt(
			path.join( promptsDir, 'writing-assistant.txt' ),
			{ project: '/tmp/TEST_PROJECT' }
		);
		expect( text.length ).toBeGreaterThan( 0 );
		expect( text ).toContain( '/tmp/TEST_PROJECT' );
		expect( text ).not.toContain( '{{project}}' );
	} );

	test( 'ideas.md keeps the "content ideas" anchor', () => {
		const text = loadPrompt( path.join( promptsDir, 'ideas.md' ), {
			project: '/tmp/x',
		} );
		expect( text.length ).toBeGreaterThan( 0 );
		expect( text ).toContain( 'content ideas' );
	} );

	test( 'draft.md lays out the format / topic / draft / save flow', () => {
		const text = loadPrompt( path.join( promptsDir, 'draft.md' ), {
			project: '/tmp/x',
		} );
		expect( text.length ).toBeGreaterThan( 0 );
		expect( text ).toContain( 'format' );
		expect( text ).toContain( 'topic' );
		expect( text ).toContain( 'draft' );
		expect( text.toLowerCase() ).toContain( 'save' );
	} );

	// Per-kind import prompts. Each must substitute {{url}}, {{project}},
	// {{importedAt}}, and {{sourcesFolder}} — the renderer routes URL imports
	// at the active subfolder by passing a resolved path for `sourcesFolder`.
	const importPromptCases: ReadonlyArray< { file: string; anchor: string } > =
		[
			{ file: 'import-url/website.md', anchor: 'website' },
			{ file: 'import-url/youtube.md', anchor: 'youtube' },
			{ file: 'import-url/tweet.md', anchor: 'tweet' },
		];
	for ( const { file, anchor } of importPromptCases ) {
		test( `${ file } substitutes the import placeholders`, () => {
			const text = loadPrompt( path.join( promptsDir, file ), {
				project: '/tmp/PROJ',
				url: 'https://example.test/the-page',
				importedAt: '2026-05-06',
				sourcesFolder: '/tmp/PROJ/sources/notes',
			} );
			expect( text.length ).toBeGreaterThan( 0 );
			expect( text ).toContain( '/tmp/PROJ' );
			expect( text ).toContain( 'https://example.test/the-page' );
			expect( text ).toContain( '2026-05-06' );
			expect( text ).not.toContain( '{{project}}' );
			expect( text ).not.toContain( '{{url}}' );
			expect( text ).not.toContain( '{{importedAt}}' );
			expect( text ).not.toContain( '{{sourcesFolder}}' );
			// The save instruction must point at the resolved sources folder
			// (potentially a nested subdirectory) — not a hardcoded `sources/`.
			expect( text ).toContain( '/tmp/PROJ/sources/notes/' );
			expect( text.toLowerCase() ).toContain( anchor );
		} );
	}
} );
