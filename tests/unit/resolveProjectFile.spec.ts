import { describe, expect, test } from 'vitest';

import { resolveProjectFile } from '../../src/renderer/lib/resolveProjectFile';

describe( 'resolveProjectFile', () => {
	const projectPath = '/Users/jane/Projects/my-blog';

	test( 'resolves a sources file', () => {
		expect(
			resolveProjectFile(
				`${ projectPath }/sources/the-article.md`,
				projectPath
			)
		).toEqual( {
			folder: 'sources',
			relPath: 'the-article.md',
			name: 'the-article.md',
		} );
	} );

	test( 'resolves drafts and published the same way', () => {
		expect(
			resolveProjectFile(
				`${ projectPath }/drafts/post-1.md`,
				projectPath
			)?.folder
		).toBe( 'drafts' );
		expect(
			resolveProjectFile(
				`${ projectPath }/published/post-1.md`,
				projectPath
			)?.folder
		).toBe( 'published' );
	} );

	test( 'keeps subfolder structure in relPath but uses the basename for name', () => {
		expect(
			resolveProjectFile(
				`${ projectPath }/sources/2026-05/the-article.md`,
				projectPath
			)
		).toEqual( {
			folder: 'sources',
			relPath: '2026-05/the-article.md',
			name: 'the-article.md',
		} );
	} );

	test( 'tolerates a trailing slash on projectPath', () => {
		expect(
			resolveProjectFile(
				`${ projectPath }/sources/foo.md`,
				`${ projectPath }/`
			)?.folder
		).toBe( 'sources' );
	} );

	test( 'returns null for paths outside the project', () => {
		expect(
			resolveProjectFile( '/tmp/somewhere/sources/foo.md', projectPath )
		).toBeNull();
	} );

	test( 'returns null for files at the project root (no folder segment)', () => {
		expect(
			resolveProjectFile( `${ projectPath }/README.md`, projectPath )
		).toBeNull();
	} );

	test( 'returns null for unrecognized folders (e.g. .studio-write/, scratch/)', () => {
		expect(
			resolveProjectFile(
				`${ projectPath }/.studio-write/scratch.md`,
				projectPath
			)
		).toBeNull();
		expect(
			resolveProjectFile(
				`${ projectPath }/scratch/note.md`,
				projectPath
			)
		).toBeNull();
	} );

	test( 'returns null for empty / non-string inputs', () => {
		expect( resolveProjectFile( '', projectPath ) ).toBeNull();
		expect(
			resolveProjectFile( undefined as unknown as string, projectPath )
		).toBeNull();
	} );

	test( 'returns null when the resource folder has no file after it', () => {
		expect(
			resolveProjectFile( `${ projectPath }/sources/`, projectPath )
		).toBeNull();
	} );

	test( 'rejects paths whose project-prefix overlaps a sibling directory', () => {
		// `${projectPath}-other` shares the prefix but isn't actually inside
		// `${projectPath}/`. The leading-slash check on the suffix prevents a
		// false match.
		expect(
			resolveProjectFile(
				`${ projectPath }-other/sources/foo.md`,
				projectPath
			)
		).toBeNull();
	} );
} );
