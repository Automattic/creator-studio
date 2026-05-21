import React, { useState } from 'react';

import type {
	CurrentView,
	DraftAttachment,
	MessageSelection,
	OpenResource,
} from '../../types';
import { ChatComposer } from './ChatComposer';
import { ChatTranscript, type ChatMessage } from './ChatTranscript';
import { PermissionPrompt, type PermissionRequest } from './PermissionPrompt';
import { CloseIcon, SelectionsIcon } from '../icons';
import { composeChatMessage } from '../lib/compose-chat-message';

export type AddedSelection = MessageSelection & {
	id: string;
};

type QuickAction = {
	label: string;
	prompt: string;
};

const PROJECT_QUICK_ACTIONS: QuickAction[] = [
	{ label: 'Summarize my sources', prompt: 'Summarize my sources' },
	{ label: 'Discuss a new draft', prompt: 'Discuss a new draft' },
	{
		label: 'What can I write from these?',
		prompt: 'What can I write from these?',
	},
];

type Props = {
	chatId: string | null;
	messages: ChatMessage[];
	busy: boolean;
	permissions: PermissionRequest[];
	addedSelections: AddedSelection[];
	onClearAddedSelections: () => void;
	pendingAttachments?: DraftAttachment[];
	// File the user is currently viewing (open in the editor, or previewed
	// in the resources panel). Silently prepended to outgoing attachments
	// so prompts like "expand this draft" reach the agent with a concrete
	// path. Derived in App; not part of the user-staged set.
	openResource?: OpenResource | null;
	// Where the user is when no file is open (project root vs. a specific
	// folder). Mentioned by the composer in the agent preamble so prompts
	// like "what's in this folder?" reach the agent with a concrete
	// location. Invisible to the user.
	currentView?: CurrentView | null;
	// When true, the panel is on the project home screen (no draft open).
	// Controls the placeholder and the empty-state welcome.
	isProjectView?: boolean;
	// Voice state for the empty-state CTA. `null` while loading — hides
	// the chip until we know which label to show.
	voiceAction?: 'create' | 'update' | null;
	onCreateOrUpdateVoice?: ( action: 'create' | 'update' ) => void;
	onRemovePendingAttachment?: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string
	) => void;
	onPreviewAttachment?: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string,
		isDirectory?: boolean
	) => void;
	onSend: (
		prompt: string,
		opts: {
			userMessageText?: string;
			selections?: MessageSelection[];
			attachments?: DraftAttachment[];
		}
	) => void;
	onCancel: () => void;
	onPermissionDecision: (
		requestId: string,
		decision: 'allow' | 'deny',
		remember: boolean
	) => void;
	// Fired when an internal card drag (file or directory) is dropped on the
	// chat panel. Directory items are filtered out in v1 by the caller; the
	// caller pipes each file into the existing add-to-chat flow.
	onAttachResources?: (
		items: Array< {
			folder: 'sources' | 'drafts' | 'done';
			relPath: string;
			name: string;
			kind: 'file' | 'dir';
		} >
	) => void;
	// Fired when OS files are dropped on the chat panel. The caller imports
	// them into sources/ and then attaches each as a chat attachment.
	onDropOsFilesToChat?: ( files: File[] ) => void;
	// Clickable file chip rendered at the top of the transcript.
	pinnedFile?: {
		folder: 'sources' | 'drafts' | 'done' | 'checks';
		relPath: string;
		label: string;
		onClick: () => void;
	} | null;
};

export function DraftChatPanel( {
	chatId,
	messages,
	busy,
	permissions,
	addedSelections,
	onClearAddedSelections,
	pendingAttachments,
	openResource = null,
	currentView = null,
	isProjectView = false,
	voiceAction = null,
	onCreateOrUpdateVoice,
	onRemovePendingAttachment,
	onPreviewAttachment,
	onSend,
	onCancel,
	onPermissionDecision,
	onAttachResources,
	onDropOsFilesToChat,
	pinnedFile = null,
}: Props ): React.ReactElement {
	const [ input, setInput ] = useState( '' );

	const sendText = ( text: string ): void => {
		if ( ! chatId || busy ) {
			return;
		}
		const composed = composeChatMessage( {
			text,
			openResource,
			currentView,
			pendingAttachments: pendingAttachments ?? [],
			addedSelections,
		} );
		setInput( '' );
		onSend( composed.promptForAgent, {
			userMessageText: text,
			selections: composed.persistedSelections,
			attachments: composed.persistedAttachments,
		} );
	};

	const handleSend = (): void => {
		const text = input.trim();
		if ( ! text ) {
			return;
		}
		sendText( text );
	};

	const ready = chatId !== null;
	const selectionsCount = addedSelections.length;
	const canAcceptDrop = ready && ( onAttachResources || onDropOsFilesToChat );
	const dropProps = canAcceptDrop
		? buildChatDropProps( {
				onAttachResources,
				onDropOsFilesToChat,
		  } )
		: undefined;
	return (
		<div
			className="draft-chat-panel"
			data-testid="draft-chat-panel"
			data-drop-active="false"
			{ ...( dropProps ?? {} ) }
		>
			<div
				className="draft-chat-drop-overlay"
				data-testid="draft-chat-drop-overlay"
				aria-hidden="true"
			>
				<span>Drop to add to chat</span>
			</div>
			<ChatTranscript
				messages={ messages }
				busy={ busy }
				testId="draft-chat-transcript"
				onPreviewAttachment={ onPreviewAttachment }
				headerContent={
					pinnedFile ? (
						<button
							type="button"
							className="chat-pinned-file"
							data-testid="chat-pinned-file"
							onClick={ pinnedFile.onClick }
						>
							<span className="chat-pinned-file-name">
								{ pinnedFile.label }
							</span>
							<span className="chat-pinned-file-meta">
								Check · MD
							</span>
						</button>
					) : undefined
				}
				emptyState={
					isProjectView ? (
						<div
							className="chat-welcome"
							data-testid="chat-welcome"
						>
							<p className="chat-welcome-text">
								What would you like to write?
							</p>
							<div className="chat-welcome-actions">
								{ voiceAction && onCreateOrUpdateVoice && (
									<button
										type="button"
										className="chat-welcome-action chat-welcome-action-voice"
										data-testid="chat-welcome-action-voice"
										disabled={ ! ready || busy }
										onClick={ () =>
											onCreateOrUpdateVoice( voiceAction )
										}
									>
										{ voiceAction === 'update'
											? 'Update voice'
											: 'Set up voice' }
									</button>
								) }
								{ PROJECT_QUICK_ACTIONS.map( ( action ) => (
									<button
										key={ action.prompt }
										type="button"
										className="chat-welcome-action"
										data-testid="chat-welcome-action"
										disabled={ ! ready || busy }
										onClick={ () =>
											sendText( action.prompt )
										}
									>
										{ action.label }
									</button>
								) ) }
							</div>
						</div>
					) : undefined
				}
			/>
			{ permissions.length > 0 && (
				<PermissionPrompt
					request={ permissions[ 0 ] }
					onDecision={ onPermissionDecision }
				/>
			) }
			{ selectionsCount > 0 && (
				<div
					className="draft-chat-selection-chip"
					data-testid="draft-chat-selection"
					title={ addedSelections
						.map(
							( s ) =>
								`${ s.resourcePath }\nLines ${ s.fromLine }–${ s.toLine }:\n${ s.text }`
						)
						.join( '\n\n———\n\n' ) }
				>
					<span
						className="draft-chat-selection-icon"
						aria-hidden="true"
					>
						<SelectionsIcon size={ 14 } />
					</span>
					<span className="draft-chat-selection-label">
						{ selectionsCount === 1
							? '1 selection'
							: `${ selectionsCount } selections` }
					</span>
					<button
						type="button"
						className="draft-chat-selection-clear"
						data-testid="draft-chat-selection-clear"
						aria-label="Remove selections"
						title="Remove selections"
						onClick={ onClearAddedSelections }
					>
						<CloseIcon size={ 10 } />
					</button>
				</div>
			) }
			<ChatComposer
				value={ input }
				onChange={ setInput }
				onSend={ handleSend }
				onCancel={ ready ? onCancel : undefined }
				busy={ busy }
				disabled={ ! ready || permissions.length > 0 }
				placeholder={
					isProjectView
						? 'Ask about this project…'
						: 'Ask for an edit on this draft…'
				}
				attachments={ pendingAttachments }
				onRemoveAttachment={ onRemovePendingAttachment }
				onPreviewAttachment={ onPreviewAttachment }
				testIds={ {
					root: 'draft-chat-composer',
					input: 'draft-chat-input',
					send: 'draft-chat-send',
				} }
			/>
		</div>
	);
}

const INTERNAL_MIME = 'application/x-studio-write-resources';

// Drop handlers for the chat panel. Accepts both the internal card-drag MIME
// (any group) and OS file drops. Internal directory items are filtered out
// here; files stream into the existing add-to-chat flow.
function buildChatDropProps( {
	onAttachResources,
	onDropOsFilesToChat,
}: {
	onAttachResources?: (
		items: Array< {
			folder: 'sources' | 'drafts' | 'done';
			relPath: string;
			name: string;
			kind: 'file' | 'dir';
		} >
	) => void;
	onDropOsFilesToChat?: ( files: File[] ) => void;
} ): {
	onDragEnter: ( e: React.DragEvent ) => void;
	onDragOver: ( e: React.DragEvent ) => void;
	onDragLeave: ( e: React.DragEvent ) => void;
	onDrop: ( e: React.DragEvent ) => void;
} {
	const accepts = (
		types: ReadonlyArray< string >
	): 'internal' | 'files' | null => {
		if ( onAttachResources && types.includes( INTERNAL_MIME ) ) {
			return 'internal';
		}
		if ( onDropOsFilesToChat && types.includes( 'Files' ) ) {
			return 'files';
		}
		return null;
	};
	const setHover = ( e: React.DragEvent, on: boolean ): void => {
		e.currentTarget.setAttribute(
			'data-drop-active',
			on ? 'true' : 'false'
		);
	};
	return {
		onDragEnter: ( e ) => {
			const kind = accepts( e.dataTransfer.types );
			if ( ! kind ) {
				return;
			}
			e.preventDefault();
			setHover( e, true );
		},
		onDragOver: ( e ) => {
			const kind = accepts( e.dataTransfer.types );
			if ( ! kind ) {
				return;
			}
			e.preventDefault();
			// Internal card drags set effectAllowed=move on dragstart, so the
			// OS will reject the drop unless dropEffect agrees. OS file drags
			// arrive with effectAllowed=all|copy and want copy semantics anyway.
			e.dataTransfer.dropEffect = kind === 'files' ? 'copy' : 'move';
		},
		onDragLeave: ( e ) => {
			const related = e.relatedTarget as Node | null;
			if ( related && e.currentTarget.contains( related ) ) {
				return;
			}
			setHover( e, false );
		},
		onDrop: ( e ) => {
			const kind = accepts( e.dataTransfer.types );
			setHover( e, false );
			if ( ! kind ) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			if ( kind === 'internal' ) {
				const raw = e.dataTransfer.getData( INTERNAL_MIME );
				if ( ! raw || ! onAttachResources ) {
					return;
				}
				let parsed: {
					items?: Array< {
						folder?: 'sources' | 'drafts' | 'done';
						relPath?: string;
						name?: string;
						kind?: 'file' | 'dir';
					} >;
				};
				try {
					parsed = JSON.parse( raw );
				} catch {
					return;
				}
				const items: Array< {
					folder: 'sources' | 'drafts' | 'done';
					relPath: string;
					name: string;
					kind: 'file' | 'dir';
				} > = [];
				for ( const it of parsed.items ?? [] ) {
					if (
						( it.folder === 'sources' ||
							it.folder === 'drafts' ||
							it.folder === 'done' ) &&
						typeof it.relPath === 'string' &&
						typeof it.name === 'string' &&
						( it.kind === 'file' || it.kind === 'dir' )
					) {
						items.push( {
							folder: it.folder,
							relPath: it.relPath,
							name: it.name,
							kind: it.kind,
						} );
					}
				}
				if ( items.length > 0 ) {
					onAttachResources( items );
				}
				return;
			}
			const files = Array.from( e.dataTransfer.files );
			if ( files.length > 0 && onDropOsFilesToChat ) {
				onDropOsFilesToChat( files );
			}
		},
	};
}
