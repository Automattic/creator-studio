import { describe, expect, test } from 'vitest';

import {
	groupMessages,
	withCreatedFileCards,
	type ChatMessage,
} from '../../src/renderer/components/ChatTranscript';

const projectPath = '/Users/jane/proj';

function tool(
	id: string,
	overrides: Partial< Extract< ChatMessage, { kind: 'tool' } > >
): ChatMessage {
	return {
		kind: 'tool',
		id,
		toolUseId: `tu_${ id }`,
		toolName: 'Write',
		input: { file_path: `${ projectPath }/sources/foo.md`, content: 'x' },
		status: 'done',
		...overrides,
	};
}

function user( id: string, text: string ): ChatMessage {
	return { kind: 'user', id, text };
}

function assistant( id: string, text: string ): ChatMessage {
	return { kind: 'assistant', id, text, streaming: false };
}

describe( 'withCreatedFileCards', () => {
	test( 'emits one card per unique file written into a resource folder', () => {
		const messages: ChatMessage[] = [
			user( 'u1', 'go' ),
			tool( 't1', {
				input: {
					file_path: `${ projectPath }/sources/article.md`,
					content: '...',
				},
			} ),
			tool( 't2', {
				input: {
					file_path: `${ projectPath }/drafts/post.md`,
					content: '...',
				},
			} ),
			assistant( 'a1', 'done' ),
		];
		const items = withCreatedFileCards(
			groupMessages( messages ),
			projectPath
		);
		const cards = items.filter( ( i ) => i.kind === 'created-file' );
		expect( cards ).toHaveLength( 2 );
		expect( cards[ 0 ] ).toMatchObject( {
			folder: 'sources',
			relPath: 'article.md',
			name: 'article.md',
		} );
		expect( cards[ 1 ] ).toMatchObject( {
			folder: 'drafts',
			relPath: 'post.md',
			name: 'post.md',
		} );
	} );

	test( 'dedups by (folder, relPath) — only the first write surfaces a card', () => {
		const messages: ChatMessage[] = [
			tool( 't1', {} ),
			tool( 't2', {} ),
			assistant( 'a1', 'done' ),
			tool( 't3', {} ),
		];
		const items = withCreatedFileCards(
			groupMessages( messages ),
			projectPath
		);
		const cards = items.filter( ( i ) => i.kind === 'created-file' );
		expect( cards ).toHaveLength( 1 );
		expect( cards[ 0 ] ).toMatchObject( {
			folder: 'sources',
			relPath: 'foo.md',
		} );
	} );

	test( 'skips writes that fail or stay running', () => {
		const messages: ChatMessage[] = [
			tool( 't1', { status: 'error' } ),
			tool( 't2', { status: 'running' } ),
		];
		expect(
			withCreatedFileCards(
				groupMessages( messages ),
				projectPath
			).filter( ( i ) => i.kind === 'created-file' )
		).toHaveLength( 0 );
	} );

	test( 'ignores non-Write tools', () => {
		const messages: ChatMessage[] = [
			tool( 't1', {
				toolName: 'Read',
				input: { file_path: `${ projectPath }/sources/foo.md` },
			} ),
			tool( 't2', {
				toolName: 'Bash',
				input: { command: 'ls' },
			} ),
		];
		expect(
			withCreatedFileCards(
				groupMessages( messages ),
				projectPath
			).filter( ( i ) => i.kind === 'created-file' )
		).toHaveLength( 0 );
	} );

	test( 'ignores writes outside the watched resource folders', () => {
		const messages: ChatMessage[] = [
			tool( 't1', {
				input: {
					file_path: `${ projectPath }/.studio-write/temp.md`,
					content: '',
				},
			} ),
			tool( 't2', {
				input: {
					file_path: `${ projectPath }/README.md`,
					content: '',
				},
			} ),
			tool( 't3', {
				input: {
					file_path: '/tmp/elsewhere/note.md',
					content: '',
				},
			} ),
		];
		expect(
			withCreatedFileCards(
				groupMessages( messages ),
				projectPath
			).filter( ( i ) => i.kind === 'created-file' )
		).toHaveLength( 0 );
	} );

	test( 'returns the input unchanged when projectPath is null', () => {
		const messages: ChatMessage[] = [ tool( 't1', {} ) ];
		const grouped = groupMessages( messages );
		expect( withCreatedFileCards( grouped, null ) ).toBe( grouped );
	} );

	test( 'orders the card right after its tool group, before the next assistant turn', () => {
		const messages: ChatMessage[] = [
			user( 'u1', 'go' ),
			tool( 't1', {} ),
			assistant( 'a1', 'done' ),
		];
		const items = withCreatedFileCards(
			groupMessages( messages ),
			projectPath
		);
		const kinds = items.map( ( i ) => i.kind );
		expect( kinds ).toEqual( [
			'user',
			'tool-group',
			'created-file',
			'assistant',
		] );
	} );
} );
