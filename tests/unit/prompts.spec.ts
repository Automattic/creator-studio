import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { loadPromptWithProjectPath } from '../../src/main/services/utils/prompts';

describe( 'loadPromptWithProjectPath', () => {
	let tmpDir: string;

	beforeEach( () => {
		tmpDir = fs.mkdtempSync( path.join( os.tmpdir(), 'cs-prompts-' ) );
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
		expect( loadPromptWithProjectPath( file, '/Users/jane/docs' ) ).toBe(
			'working on /Users/jane/docs today'
		);
	} );

	test( 'substitutes every occurrence of {{project}}', () => {
		const file = write(
			'multi.txt',
			'scope: {{project}}; read {{project}}; write {{project}}'
		);
		expect( loadPromptWithProjectPath( file, '/a/b' ) ).toBe(
			'scope: /a/b; read /a/b; write /a/b'
		);
	} );

	test( 'leaves text without the placeholder untouched', () => {
		const file = write( 'plain.txt', 'just a prompt\nwith no vars.' );
		expect( loadPromptWithProjectPath( file, '/anything' ) ).toBe(
			'just a prompt\nwith no vars.'
		);
	} );

	test( 'preserves special characters in the project path', () => {
		const file = write( 'vars.txt', '-> {{project}}' );
		const p = '/Users/jane/$weird (folder)/with spaces';
		expect( loadPromptWithProjectPath( file, p ) ).toBe( `-> ${ p }` );
	} );

	test( 'throws a readable error when the file is missing', () => {
		expect( () =>
			loadPromptWithProjectPath(
				path.join( tmpDir, 'does-not-exist.txt' ),
				'/x'
			)
		).toThrow( /ENOENT|no such file/i );
	} );
} );

// Content guards for the shipped prompts. These don't exercise behavior; they
// pin the anchor phrases the agent relies on. A rewrite that drops any of
// them is almost certainly a behavior change and should fail here loudly.
describe( 'shipped prompt files', () => {
	const promptsDir = path.join( process.cwd(), 'resources', 'prompts' );

	test( 'writing-assistant.txt keeps the {{project}} scope placeholder', () => {
		const text = loadPromptWithProjectPath(
			path.join( promptsDir, 'writing-assistant.txt' ),
			'/tmp/TEST_PROJECT'
		);
		expect( text.length ).toBeGreaterThan( 0 );
		expect( text ).toContain( '/tmp/TEST_PROJECT' );
		expect( text ).not.toContain( '{{project}}' );
	} );

	test( 'ideas.md keeps the "content ideas" anchor', () => {
		const text = loadPromptWithProjectPath(
			path.join( promptsDir, 'ideas.md' ),
			'/tmp/x'
		);
		expect( text.length ).toBeGreaterThan( 0 );
		expect( text ).toContain( 'content ideas' );
	} );

	test( 'draft.md lays out the format / topic / draft / save flow', () => {
		const text = loadPromptWithProjectPath(
			path.join( promptsDir, 'draft.md' ),
			'/tmp/x'
		);
		expect( text.length ).toBeGreaterThan( 0 );
		expect( text ).toContain( 'format' );
		expect( text ).toContain( 'topic' );
		expect( text ).toContain( 'draft' );
		expect( text.toLowerCase() ).toContain( 'save' );
	} );
} );
