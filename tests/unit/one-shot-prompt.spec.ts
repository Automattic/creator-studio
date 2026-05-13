import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

let tmpDir: string;

vi.mock( 'electron', () => ( {
	app: {
		isPackaged: false,
		getPath: () => tmpDir,
		getAppPath: () => tmpDir,
	},
} ) );

import { buildChildEnv } from '../../src/main/channels/utils/one-shot-prompt';
import {
	storePath,
	writeStore,
} from '../../src/main/channels/utils/ui-prefs-store';

let originalKey: string | undefined;

beforeEach( () => {
	tmpDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-osp-' ) );
	originalKey = process.env.ANTHROPIC_API_KEY;
	process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
} );

afterEach( () => {
	try {
		fs.unlinkSync( storePath() );
	} catch {
		// already gone
	}
	fs.rmSync( tmpDir, { recursive: true, force: true } );
	if ( originalKey === undefined ) {
		delete process.env.ANTHROPIC_API_KEY;
	} else {
		process.env.ANTHROPIC_API_KEY = originalKey;
	}
} );

describe( 'buildChildEnv', () => {
	test( 'passes ANTHROPIC_API_KEY through in api-key mode', () => {
		writeStore( { authMode: 'api-key' } );
		const env = buildChildEnv();
		expect( env.ANTHROPIC_API_KEY ).toBe( 'sk-ant-test' );
	} );

	test( 'strips ANTHROPIC_API_KEY in claude-code mode', () => {
		writeStore( { authMode: 'claude-code' } );
		const env = buildChildEnv();
		expect( env.ANTHROPIC_API_KEY ).toBeUndefined();
	} );

	test( 'preserves unrelated env vars in claude-code mode', () => {
		process.env.SW_TEST_PASSTHROUGH = 'kept';
		writeStore( { authMode: 'claude-code' } );
		const env = buildChildEnv();
		expect( env.SW_TEST_PASSTHROUGH ).toBe( 'kept' );
		expect( env.ANTHROPIC_API_KEY ).toBeUndefined();
		delete process.env.SW_TEST_PASSTHROUGH;
	} );

	test( 'unset authMode defaults to api-key (preserves key)', () => {
		// No writeStore call — ui-prefs.json doesn't exist yet, so the
		// store returns authMode=undefined.
		const env = buildChildEnv();
		expect( env.ANTHROPIC_API_KEY ).toBe( 'sk-ant-test' );
	} );
} );
