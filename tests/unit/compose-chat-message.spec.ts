import { describe, expect, test } from 'vitest';

import { composeChatMessage } from '../../src/renderer/lib/compose-chat-message';
import type {
	CurrentView,
	DraftAttachment,
	MessageSelection,
	OpenResource,
} from '../../src/types';

const att = (
	folder: 'sources' | 'drafts' | 'done',
	relPath: string
): DraftAttachment => ( {
	kind: 'draft',
	folder,
	relPath,
	name: relPath,
	mtime: null,
} );

const sel = (
	resourcePath: string,
	fromLine: number,
	toLine: number,
	text: string
): MessageSelection => ( { resourcePath, fromLine, toLine, text } );

const openDraft: OpenResource = {
	folder: 'drafts',
	relPath: 'foo.md',
	name: 'Foo',
};

const openSource: OpenResource = {
	folder: 'sources',
	relPath: 'notes/research.md',
	name: 'research.md',
};

describe( 'composeChatMessage', () => {
	test( 'plain text with no context returns the text verbatim', () => {
		const result = composeChatMessage( {
			text: 'hello',
			openResource: null,
			pendingAttachments: [],
			addedSelections: [],
		} );
		expect( result.promptForAgent ).toBe( 'hello' );
		expect( result.persistedAttachments ).toEqual( [] );
		expect( result.persistedSelections ).toEqual( [] );
	} );

	test( 'prepends a path preamble for the open draft', () => {
		const result = composeChatMessage( {
			text: 'expand this',
			openResource: openDraft,
			pendingAttachments: [],
			addedSelections: [],
		} );
		expect( result.promptForAgent ).toContain( '[1] drafts/foo.md' );
		expect( result.promptForAgent ).toContain(
			'Their message:\nexpand this'
		);
	} );

	test( 'open source notes work the same as drafts', () => {
		const result = composeChatMessage( {
			text: 'summarize',
			openResource: openSource,
			pendingAttachments: [],
			addedSelections: [],
		} );
		expect( result.promptForAgent ).toContain(
			'[1] sources/notes/research.md'
		);
	} );

	test( 'auto-attached resource stays out of persisted attachments', () => {
		const result = composeChatMessage( {
			text: 'hi',
			openResource: openDraft,
			pendingAttachments: [],
			addedSelections: [],
		} );
		// The persisted record (and therefore the user bubble) sees no
		// attachment chips for the open draft — invisible context.
		expect( result.persistedAttachments ).toEqual( [] );
	} );

	test( 'open resource precedes user-staged attachments in the preamble', () => {
		const staged = att( 'sources', 'notes/other.md' );
		const result = composeChatMessage( {
			text: 'compare',
			openResource: openDraft,
			pendingAttachments: [ staged ],
			addedSelections: [],
		} );
		const lines = result.promptForAgent.split( '\n' );
		const idxOpen = lines.findIndex( ( l ) =>
			l.includes( 'drafts/foo.md' )
		);
		const idxStaged = lines.findIndex( ( l ) =>
			l.includes( 'sources/notes/other.md' )
		);
		expect( idxOpen ).toBeGreaterThan( -1 );
		expect( idxStaged ).toBeGreaterThan( idxOpen );
	} );

	test( 'persisted attachments contain only user-staged entries', () => {
		const staged = att( 'sources', 'notes/other.md' );
		const result = composeChatMessage( {
			text: 'compare',
			openResource: openDraft,
			pendingAttachments: [ staged ],
			addedSelections: [],
		} );
		expect( result.persistedAttachments ).toEqual( [ staged ] );
	} );

	test( 'preamble count reflects auto + user attachments together', () => {
		const staged = att( 'sources', 'notes/other.md' );
		const result = composeChatMessage( {
			text: 'compare',
			openResource: openDraft,
			pendingAttachments: [ staged ],
			addedSelections: [],
		} );
		// Two files: one auto, one staged.
		expect( result.promptForAgent ).toContain(
			'The user has attached 2 files from project resources.'
		);
	} );

	test( 'always injects even when the user staged the same file explicitly', () => {
		const sameAsOpen = att( 'drafts', 'foo.md' );
		const result = composeChatMessage( {
			text: 'go',
			openResource: openDraft,
			pendingAttachments: [ sameAsOpen ],
			addedSelections: [],
		} );
		const matches = result.promptForAgent.match( /drafts\/foo\.md/g );
		expect( matches?.length ).toBe( 2 );
	} );

	test( 'selections are inlined alongside attachments', () => {
		const s = sel( 'drafts/foo.md', 5, 7, 'one\ntwo\nthree' );
		const result = composeChatMessage( {
			text: 'fix grammar',
			openResource: openDraft,
			pendingAttachments: [],
			addedSelections: [ s ],
		} );
		expect( result.promptForAgent ).toContain(
			'[1] drafts/foo.md, lines 5–7:'
		);
		expect( result.promptForAgent ).toContain( 'one\ntwo\nthree' );
		expect( result.promptForAgent ).toContain(
			'Their message:\nfix grammar'
		);
	} );

	test( 'persisted selections drop any extra fields like ids', () => {
		const withId = { ...sel( 'drafts/foo.md', 1, 2, 't' ), id: 'sel-1' };
		const result = composeChatMessage( {
			text: 'hi',
			openResource: null,
			pendingAttachments: [],
			addedSelections: [ withId ],
		} );
		expect( result.persistedSelections ).toEqual( [
			{
				resourcePath: 'drafts/foo.md',
				fromLine: 1,
				toLine: 2,
				text: 't',
			},
		] );
	} );

	describe( 'currentView', () => {
		const projectHome: CurrentView = { kind: 'project-home' };
		const sourcesNotes: CurrentView = {
			kind: 'folder',
			folder: 'sources',
			subPath: 'notes/research',
		};
		const sourcesRoot: CurrentView = {
			kind: 'folder',
			folder: 'sources',
			subPath: '',
		};

		test( 'adds a view line for the project root', () => {
			const result = composeChatMessage( {
				text: 'what should I work on?',
				openResource: null,
				currentView: projectHome,
				pendingAttachments: [],
				addedSelections: [],
			} );
			expect( result.promptForAgent ).toContain( 'the project root' );
			expect( result.promptForAgent ).toContain(
				'Their message:\nwhat should I work on?'
			);
		} );

		test( 'adds a view line for a drilled folder', () => {
			const result = composeChatMessage( {
				text: 'what is in this folder?',
				openResource: null,
				currentView: sourcesNotes,
				pendingAttachments: [],
				addedSelections: [],
			} );
			expect( result.promptForAgent ).toContain(
				'`sources/notes/research/`'
			);
		} );

		test( 'adds a view line for a folder root (empty subPath)', () => {
			const result = composeChatMessage( {
				text: 'list these',
				openResource: null,
				currentView: sourcesRoot,
				pendingAttachments: [],
				addedSelections: [],
			} );
			expect( result.promptForAgent ).toContain( '`sources/`' );
		} );

		test( 'skips the view line when a file is already open', () => {
			const result = composeChatMessage( {
				text: 'expand this',
				openResource: openDraft,
				currentView: sourcesNotes,
				pendingAttachments: [],
				addedSelections: [],
			} );
			expect( result.promptForAgent ).not.toContain(
				'currently viewing'
			);
			expect( result.promptForAgent ).toContain( 'drafts/foo.md' );
		} );

		test( 'view line composes alongside user-staged attachments', () => {
			const staged = att( 'sources', 'notes/other.md' );
			const result = composeChatMessage( {
				text: 'compare',
				openResource: null,
				currentView: sourcesNotes,
				pendingAttachments: [ staged ],
				addedSelections: [],
			} );
			const lines = result.promptForAgent.split( '\n' );
			const idxView = lines.findIndex( ( l ) =>
				l.includes( 'currently viewing' )
			);
			const idxStaged = lines.findIndex( ( l ) =>
				l.includes( 'sources/notes/other.md' )
			);
			expect( idxView ).toBeGreaterThan( -1 );
			expect( idxStaged ).toBeGreaterThan( idxView );
		} );

		test( 'no currentView and no file produces plain text', () => {
			const result = composeChatMessage( {
				text: 'hi',
				openResource: null,
				currentView: null,
				pendingAttachments: [],
				addedSelections: [],
			} );
			expect( result.promptForAgent ).toBe( 'hi' );
		} );

		test( 'view line is invisible to the persisted record', () => {
			const result = composeChatMessage( {
				text: 'hi',
				openResource: null,
				currentView: sourcesNotes,
				pendingAttachments: [],
				addedSelections: [],
			} );
			expect( result.persistedAttachments ).toEqual( [] );
			expect( result.persistedSelections ).toEqual( [] );
		} );
	} );
} );
