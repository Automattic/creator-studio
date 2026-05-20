import { describe, test, expect } from 'vitest';

import {
	classifyCreatedResource,
	pickAutoOpenResource,
} from '../../src/main/channels/utils/created-resource';

const PROJECT = '/tmp/sw-test-project';

describe( 'created-resource: classifyCreatedResource', () => {
	test( 'classifies a markdown file under drafts/', () => {
		expect(
			classifyCreatedResource( PROJECT, `${ PROJECT }/drafts/post.md` )
		).toEqual( { folder: 'drafts', relPath: 'post.md' } );
	} );

	test( 'classifies a nested markdown note under sources/', () => {
		expect(
			classifyCreatedResource(
				PROJECT,
				`${ PROJECT }/sources/research/notes.md`
			)
		).toEqual( { folder: 'sources', relPath: 'research/notes.md' } );
	} );

	test( 'resolves project-relative paths', () => {
		expect( classifyCreatedResource( PROJECT, 'drafts/post.md' ) ).toEqual(
			{ folder: 'drafts', relPath: 'post.md' }
		);
	} );

	test( 'rejects non-markdown files', () => {
		expect(
			classifyCreatedResource( PROJECT, `${ PROJECT }/drafts/post.txt` )
		).toBeNull();
		expect(
			classifyCreatedResource( PROJECT, `${ PROJECT }/sources/image.png` )
		).toBeNull();
	} );

	test( 'rejects files outside drafts/ and sources/', () => {
		expect(
			classifyCreatedResource( PROJECT, `${ PROJECT }/done/post.md` )
		).toBeNull();
		expect(
			classifyCreatedResource( PROJECT, `${ PROJECT }/checks/voice.md` )
		).toBeNull();
		expect(
			classifyCreatedResource( PROJECT, `${ PROJECT }/notes.md` )
		).toBeNull();
	} );

	test( 'rejects a file directly at a group root (no name part)', () => {
		expect(
			classifyCreatedResource( PROJECT, `${ PROJECT }/drafts` )
		).toBeNull();
	} );

	test( 'rejects paths outside the project', () => {
		expect(
			classifyCreatedResource( PROJECT, '/tmp/other/drafts/post.md' )
		).toBeNull();
		expect(
			classifyCreatedResource( PROJECT, '../drafts/post.md' )
		).toBeNull();
	} );

	test( 'rejects a missing or non-string path', () => {
		expect( classifyCreatedResource( PROJECT, undefined ) ).toBeNull();
		expect( classifyCreatedResource( PROJECT, '' ) ).toBeNull();
		expect( classifyCreatedResource( PROJECT, 42 ) ).toBeNull();
	} );

	test( 'matches the .md extension case-insensitively', () => {
		expect(
			classifyCreatedResource( PROJECT, `${ PROJECT }/drafts/post.MD` )
		).toEqual( { folder: 'drafts', relPath: 'post.MD' } );
	} );
} );

describe( 'created-resource: pickAutoOpenResource', () => {
	test( 'returns the single created resource', () => {
		expect(
			pickAutoOpenResource( [ { folder: 'drafts', relPath: 'a.md' } ] )
		).toEqual( { folder: 'drafts', relPath: 'a.md' } );
	} );

	test( 'returns null when nothing was created', () => {
		expect( pickAutoOpenResource( [] ) ).toBeNull();
	} );

	test( 'returns null when more than one distinct file was created', () => {
		expect(
			pickAutoOpenResource( [
				{ folder: 'drafts', relPath: 'a.md' },
				{ folder: 'sources', relPath: 'b.md' },
			] )
		).toBeNull();
	} );

	test( 'collapses duplicates of the same file to a single open', () => {
		expect(
			pickAutoOpenResource( [
				{ folder: 'drafts', relPath: 'a.md' },
				{ folder: 'drafts', relPath: 'a.md' },
			] )
		).toEqual( { folder: 'drafts', relPath: 'a.md' } );
	} );
} );
