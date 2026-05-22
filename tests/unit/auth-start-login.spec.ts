import { describe, expect, test, vi } from 'vitest';

// auth-start-login.ts pulls in resource-paths.ts, which imports electron's
// `app`. The quoting helpers under test don't touch either, so stub them out.
vi.mock( 'electron', () => ( {
	app: { getAppPath: () => '' },
} ) );
vi.mock( '../../src/main/channels/utils/resource-paths', () => ( {
	resolveClaudeCodeBinary: () => '/does/not/matter',
} ) );

import {
	appleScriptStringLiteral,
	shellSingleQuote,
} from '../../src/main/channels/auth-start-login';

describe( 'shellSingleQuote', () => {
	test( 'wraps a path containing spaces so the shell keeps it as one token', () => {
		const path =
			'/Applications/Studio Write.app/Contents/Resources/claude-agent-sdk-darwin-arm64/claude';
		expect( shellSingleQuote( path ) ).toBe( `'${ path }'` );
	} );

	test( 'escapes an embedded single quote', () => {
		expect( shellSingleQuote( "O'Brien" ) ).toBe( "'O'\\''Brien'" );
	} );

	test( 'leaves a quote-free value untouched apart from the wrapping quotes', () => {
		expect( shellSingleQuote( '/usr/local/bin/claude' ) ).toBe(
			"'/usr/local/bin/claude'"
		);
	} );
} );

describe( 'appleScriptStringLiteral', () => {
	test( 'escapes backslashes then double quotes', () => {
		expect( appleScriptStringLiteral( 'a\\b"c' ) ).toBe( 'a\\\\b\\"c' );
	} );

	test( 'leaves single quotes and spaces alone', () => {
		expect( appleScriptStringLiteral( "it's a path" ) ).toBe(
			"it's a path"
		);
	} );
} );

describe( 'composed terminal command (regression guard)', () => {
	test( 'a binary path with a space survives both quoting layers', () => {
		const binary =
			'/private/var/folders/q4/T/AppTranslocation/abc/d/Studio Write.app/Contents/Resources/claude-agent-sdk-darwin-arm64/claude';
		const command = `${ shellSingleQuote( binary ) } auth login`;
		const doScriptPayload = appleScriptStringLiteral( command );

		// The fully single-quoted path must be intact inside the AppleScript
		// payload — this is what broke sign-in before the fix.
		expect( command ).toBe( `'${ binary }' auth login` );
		expect( doScriptPayload ).toContain( `'${ binary }'` );
		expect( doScriptPayload ).not.toContain( '\\' );
	} );
} );
