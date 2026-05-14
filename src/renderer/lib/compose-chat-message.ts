import type {
	DraftAttachment,
	MessageSelection,
	OpenResource,
} from '../../types';

export type ComposeInput = {
	text: string;
	openResource: OpenResource | null;
	pendingAttachments: DraftAttachment[];
	addedSelections: MessageSelection[];
};

export type Composed = {
	// The full prompt sent to the agent: text plus a path preamble for
	// every attachment and an inlined block for every selection.
	promptForAgent: string;
	// What gets persisted on the user bubble. The auto-attached open
	// resource is intentionally excluded so the bubble stays visually
	// identical whether or not a draft/source is open.
	persistedAttachments: DraftAttachment[];
	persistedSelections: MessageSelection[];
};

export function composeChatMessage( input: ComposeInput ): Composed {
	const { text, openResource, pendingAttachments, addedSelections } = input;
	const autoAttachments: DraftAttachment[] = openResource
		? [
				{
					kind: 'draft',
					folder: openResource.folder,
					relPath: openResource.relPath,
					name: openResource.name,
					mtime: null,
				},
		  ]
		: [];
	const allAttachments = [ ...autoAttachments, ...pendingAttachments ];
	const attBlock = allAttachments.length
		? [
				`The user has attached ${ allAttachments.length } file${
					allAttachments.length === 1 ? '' : 's'
				} from project resources. Read them with the Read tool when relevant:`,
				...allAttachments.map(
					( a, i ) => `[${ i + 1 }] ${ a.folder }/${ a.relPath }`
				),
				'',
		  ].join( '\n' )
		: '';
	const selBlock = addedSelections.length
		? [
				`The user has attached ${ addedSelections.length } selection${
					addedSelections.length === 1 ? '' : 's'
				} from project resources:`,
				'',
				...addedSelections.flatMap( ( s, i ) => [
					`[${ i + 1 }] ${ s.resourcePath }, lines ${ s.fromLine }–${
						s.toLine
					}:`,
					'```',
					s.text,
					'```',
					'',
				] ),
		  ].join( '\n' )
		: '';
	const promptForAgent =
		allAttachments.length === 0 && addedSelections.length === 0
			? text
			: `${ attBlock }${ selBlock }Their message:\n${ text }`;
	return {
		promptForAgent,
		persistedAttachments: pendingAttachments,
		persistedSelections: addedSelections.map( ( s ) => ( {
			resourcePath: s.resourcePath,
			text: s.text,
			fromLine: s.fromLine,
			toLine: s.toLine,
		} ) ),
	};
}
