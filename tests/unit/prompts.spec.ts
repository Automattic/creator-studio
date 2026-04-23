import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { loadPromptWithFolder } from '../../src/main/prompts';

describe( 'loadPromptWithFolder', () => {
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

	test( 'substitutes a single {{folder}} occurrence', () => {
		const file = write( 'single.txt', 'working on {{folder}} today' );
		expect( loadPromptWithFolder( file, '/Users/jane/docs' ) ).toBe(
			'working on /Users/jane/docs today'
		);
	} );

	test( 'substitutes every occurrence of {{folder}}', () => {
		const file = write(
			'multi.txt',
			'scope: {{folder}}; read {{folder}}; write {{folder}}'
		);
		expect( loadPromptWithFolder( file, '/a/b' ) ).toBe(
			'scope: /a/b; read /a/b; write /a/b'
		);
	} );

	test( 'leaves text without the placeholder untouched', () => {
		const file = write( 'plain.txt', 'just a prompt\nwith no vars.' );
		expect( loadPromptWithFolder( file, '/anything' ) ).toBe(
			'just a prompt\nwith no vars.'
		);
	} );

	test( 'preserves special characters in the folder path', () => {
		const file = write( 'vars.txt', '-> {{folder}}' );
		const p = '/Users/jane/$weird (folder)/with spaces';
		expect( loadPromptWithFolder( file, p ) ).toBe( `-> ${ p }` );
	} );

	test( 'throws a readable error when the file is missing', () => {
		expect( () =>
			loadPromptWithFolder(
				path.join( tmpDir, 'does-not-exist.txt' ),
				'/x'
			)
		).toThrow( /ENOENT|no such file/i );
	} );
} );
