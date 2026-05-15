import type {
	CurrentView,
	DraftAttachment,
	MessageSelection,
	OpenResource,
} from '../../types';

export type ComposeInput = {
	text: string;
	openResource: OpenResource | null;
	currentView?: CurrentView | null;
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

function describeCurrentView( view: CurrentView ): string {
	if ( view.kind === 'project-home' ) {
		return 'the project root (showing the sources, drafts, and done folders side by side)';
	}
	const trail = view.subPath
		? `${ view.folder }/${ view.subPath }`
		: view.folder;
	return `the \`${ trail }/\` folder`;
}

export function composeChatMessage( input: ComposeInput ): Composed {
	const {
		text,
		openResource,
		currentView,
		pendingAttachments,
		addedSelections,
	} = input;
	// Checks aren't an attachable resource — they're project tooling. Don't
	// auto-attach them when the user happens to be editing one.
	const autoAttachments: DraftAttachment[] =
		openResource && openResource.folder !== 'checks'
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
	// The view line stands in when no file is on screen — a file's path
	// already conveys its folder, so showing both would be redundant.
	const viewLine =
		currentView && ! openResource
			? `The user is currently viewing ${ describeCurrentView(
					currentView
			  ) }.\n\n`
			: '';
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
	const hasContext =
		viewLine !== '' ||
		allAttachments.length > 0 ||
		addedSelections.length > 0;
	const promptForAgent = hasContext
		? `${ viewLine }${ attBlock }${ selBlock }Their message:\n${ text }`
		: text;
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
