import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';

import {
	CHECKS_PROMPT_SCAFFOLD,
	buildCheckPrompt,
} from '../../src/main/channels/utils/checks-prompt-scaffold';

// The runner-side scaffold is the one responsible for the JSON output
// schema and the draft slot. Default check files only need to describe
// what to look for and parse as valid frontmatter.

describe( 'checks prompt scaffold', () => {
	it( 'leaves both placeholders so the runner can substitute', () => {
		expect( CHECKS_PROMPT_SCAFFOLD ).toContain( '{{body}}' );
		expect( CHECKS_PROMPT_SCAFFOLD ).toContain( '{{draft}}' );
	} );

	it( 'pins the JSON contract so user-authored checks never have to', () => {
		const needles = [
			'JSON array only',
			'original',
			'replacement',
			'message',
		];
		for ( const needle of needles ) {
			expect( CHECKS_PROMPT_SCAFFOLD.toLowerCase() ).toContain(
				needle.toLowerCase()
			);
		}
	} );

	it( 'buildCheckPrompt substitutes both slots', () => {
		const out = buildCheckPrompt( 'criteria-here', 'draft-text-here' );
		expect( out ).toContain( 'criteria-here' );
		expect( out ).toContain( 'draft-text-here' );
		expect( out ).not.toContain( '{{body}}' );
		expect( out ).not.toContain( '{{draft}}' );
	} );
} );

describe( 'bundled default check files', () => {
	const defaultsDir = path.join(
		process.cwd(),
		'resources',
		'checks-defaults'
	);
	// Pinning order here keeps the foundation → sources → user-created
	// sequence the panel relies on. If a bundled default's slot changes
	// intentionally, update this table and the canonical order moves with it.
	const bundled: { name: string; enabled: boolean; order: number }[] = [
		{ name: 'grammar-spelling.md', enabled: true, order: 10 },
		{ name: 'brevity.md', enabled: true, order: 20 },
		{ name: 'passive-voice.md', enabled: true, order: 30 },
		{ name: 'orwell.md', enabled: false, order: 40 },
		{ name: 'strunk-white.md', enabled: false, order: 50 },
		{ name: 'bezos.md', enabled: false, order: 60 },
		{ name: 'zinsser.md', enabled: false, order: 70 },
	];

	for ( const { name, enabled, order } of bundled ) {
		it( `${ name } parses with valid title, enabled=${ enabled }, order=${ order }`, () => {
			const contents = fs.readFileSync(
				path.join( defaultsDir, name ),
				'utf-8'
			);
			const parsed = matter( contents );
			const data = parsed.data as Record< string, unknown >;
			expect( typeof data.title ).toBe( 'string' );
			expect( ( data.title as string ).length ).toBeGreaterThan( 0 );
			expect( data.enabled ).toBe( enabled );
			expect( data.order ).toBe( order );
			expect( parsed.content.trim().length ).toBeGreaterThan( 0 );
		} );
	}
} );
