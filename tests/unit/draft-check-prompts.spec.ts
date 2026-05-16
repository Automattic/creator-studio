import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';

import {
	CHECKS_PROMPT_SCAFFOLD,
	VOICE_CHECK_PROMPT_PREFIX,
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

	it( 'buildCheckPrompt prepends the voice prefix when voice: true', () => {
		const out = buildCheckPrompt( 'voice-body', 'draft', { voice: true } );
		expect( out ).toContain( VOICE_CHECK_PROMPT_PREFIX );
		expect( out ).toContain( 'voice-body' );
		// The prefix appears before the user's body.
		expect( out.indexOf( VOICE_CHECK_PROMPT_PREFIX ) ).toBeLessThan(
			out.indexOf( 'voice-body' )
		);
	} );

	it( 'buildCheckPrompt skips the voice prefix when voice is false/absent', () => {
		expect( buildCheckPrompt( 'plain-body', 'draft' ) ).not.toContain(
			VOICE_CHECK_PROMPT_PREFIX
		);
		expect(
			buildCheckPrompt( 'plain-body', 'draft', { voice: false } )
		).not.toContain( VOICE_CHECK_PROMPT_PREFIX );
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
	const bundled: {
		name: string;
		enabled: boolean;
		order: number;
		voice?: boolean;
	}[] = [
		{ name: 'voice.md', enabled: true, order: 5, voice: true },
		{ name: 'grammar-spelling.md', enabled: true, order: 10 },
		{ name: 'brevity.md', enabled: true, order: 20 },
		{ name: 'passive-voice.md', enabled: true, order: 30 },
		{ name: 'orwell.md', enabled: false, order: 40 },
		{ name: 'strunk-white.md', enabled: false, order: 50 },
		{ name: 'bezos.md', enabled: false, order: 60 },
		{ name: 'zinsser.md', enabled: false, order: 70 },
	];

	for ( const { name, enabled, order, voice } of bundled ) {
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
			if ( voice ) {
				expect( data.voice ).toBe( true );
			}
		} );
	}
} );
