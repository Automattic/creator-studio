import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Each bundled prompt has to (1) describe its criteria so the model
// actually does the right check, (2) insist on a bare JSON array so the
// parser doesn't choke, and (3) leave a {{body}} placeholder for the
// prompt loader to substitute. These guards are intentionally
// substring-loose — they catch accidental rewrites without forcing us
// to copy-paste the prompt into the test.
type Guard = {
	file: string;
	requiredSubstrings: string[];
};

const guards: Guard[] = [
	{
		file: 'grammar-spelling.md',
		requiredSubstrings: [
			'grammar',
			'spelling',
			'JSON array only',
			'{{body}}',
		],
	},
	{
		file: 'brevity.md',
		requiredSubstrings: [
			'shortened',
			'meaning',
			'JSON array only',
			'{{body}}',
		],
	},
	{
		file: 'passive-voice.md',
		requiredSubstrings: [
			'passive',
			'active',
			'JSON array only',
			'{{body}}',
		],
	},
];

describe( 'check prompts', () => {
	for ( const guard of guards ) {
		it( `${ guard.file } contains required sentinels`, () => {
			const full = path.join(
				process.cwd(),
				'resources',
				'prompts',
				'checks',
				guard.file
			);
			const contents = fs.readFileSync( full, 'utf-8' );
			for ( const needle of guard.requiredSubstrings ) {
				expect( contents.toLowerCase() ).toContain(
					needle.toLowerCase()
				);
			}
		} );
	}
} );
