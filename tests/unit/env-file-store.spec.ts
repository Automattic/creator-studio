import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock( 'electron', () => ( {
	app: {
		isPackaged: false,
		getPath: () => '',
		getAppPath: () => '',
	},
} ) );

import {
	envFilePath,
	readApiKey,
	writeApiKey,
} from '../../src/main/channels/utils/env-file-store';

let tmpDir: string;
let envPath: string;
let originalKey: string | undefined;

beforeEach( () => {
	tmpDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-env-' ) );
	envPath = path.join( tmpDir, '.env' );
	process.env.STUDIO_WRITE_ENV_FILE = envPath;
	originalKey = process.env.ANTHROPIC_API_KEY;
	delete process.env.ANTHROPIC_API_KEY;
} );

afterEach( () => {
	delete process.env.STUDIO_WRITE_ENV_FILE;
	if ( originalKey === undefined ) {
		delete process.env.ANTHROPIC_API_KEY;
	} else {
		process.env.ANTHROPIC_API_KEY = originalKey;
	}
	fs.rmSync( tmpDir, { recursive: true, force: true } );
} );

describe( 'envFilePath', () => {
	test( 'honors STUDIO_WRITE_ENV_FILE override', () => {
		expect( envFilePath() ).toBe( envPath );
	} );
} );

describe( 'readApiKey', () => {
	test( 'returns the in-memory env value (the on-disk file only matters at boot)', () => {
		process.env.ANTHROPIC_API_KEY = 'sk-from-memory';
		expect( readApiKey() ).toBe( 'sk-from-memory' );
	} );

	test( 'returns empty string when unset', () => {
		expect( readApiKey() ).toBe( '' );
	} );
} );

describe( 'writeApiKey', () => {
	test( 'creates the file when absent', () => {
		writeApiKey( 'sk-new' );
		expect( fs.readFileSync( envPath, 'utf-8' ) ).toBe(
			'ANTHROPIC_API_KEY=sk-new\n'
		);
		expect( process.env.ANTHROPIC_API_KEY ).toBe( 'sk-new' );
	} );

	test( 'upserts an existing line and preserves other vars and comments', () => {
		fs.writeFileSync(
			envPath,
			'# my notes\nFOO=bar\nANTHROPIC_API_KEY=old\nBAZ=qux\n'
		);
		writeApiKey( 'sk-updated' );
		expect( fs.readFileSync( envPath, 'utf-8' ) ).toBe(
			'# my notes\nFOO=bar\nANTHROPIC_API_KEY=sk-updated\nBAZ=qux\n'
		);
	} );

	test( 'appends when the key is missing, without adding a blank line', () => {
		fs.writeFileSync( envPath, 'FOO=bar\nBAZ=qux\n' );
		writeApiKey( 'sk-appended' );
		expect( fs.readFileSync( envPath, 'utf-8' ) ).toBe(
			'FOO=bar\nBAZ=qux\nANTHROPIC_API_KEY=sk-appended\n'
		);
	} );

	test( 'quotes values containing whitespace or # so dotenv reads them back unchanged', () => {
		writeApiKey( 'has space and # hash' );
		expect( fs.readFileSync( envPath, 'utf-8' ) ).toBe(
			'ANTHROPIC_API_KEY="has space and # hash"\n'
		);
	} );

	test( 'leaves a typical sk-ant-… key unquoted', () => {
		writeApiKey( 'sk-ant-api03-abc_DEF-123' );
		expect( fs.readFileSync( envPath, 'utf-8' ) ).toBe(
			'ANTHROPIC_API_KEY=sk-ant-api03-abc_DEF-123\n'
		);
	} );

	test( 'mirrors the value into process.env so the next send works without restart', () => {
		writeApiKey( 'sk-mirrored' );
		expect( process.env.ANTHROPIC_API_KEY ).toBe( 'sk-mirrored' );
	} );

	test( 'an empty value writes ANTHROPIC_API_KEY= (effectively clearing the key)', () => {
		fs.writeFileSync( envPath, 'ANTHROPIC_API_KEY=existing\n' );
		writeApiKey( '' );
		expect( fs.readFileSync( envPath, 'utf-8' ) ).toBe(
			'ANTHROPIC_API_KEY=\n'
		);
		expect( process.env.ANTHROPIC_API_KEY ).toBe( '' );
	} );
} );
