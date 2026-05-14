import React, { useState } from 'react';

import type { DraftAttachment, MessageSelection } from '../../types';
import { ChatComposer } from './ChatComposer';
import { ChatTranscript, type ChatMessage } from './ChatTranscript';
import { PermissionPrompt, type PermissionRequest } from './PermissionPrompt';
import { CloseIcon, SelectionsIcon } from '../icons';

export type AddedSelection = MessageSelection & {
	id: string;
};

type Props = {
	chatId: string | null;
	messages: ChatMessage[];
	busy: boolean;
	permissions: PermissionRequest[];
	addedSelections: AddedSelection[];
	onClearAddedSelections: () => void;
	pendingAttachments?: DraftAttachment[];
	onRemovePendingAttachment?: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string
	) => void;
	onPreviewAttachment?: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string
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
};

export function DraftChatPanel( {
	chatId,
	messages,
	busy,
	permissions,
	addedSelections,
	onClearAddedSelections,
	pendingAttachments,
	onRemovePendingAttachment,
	onPreviewAttachment,
	onSend,
	onCancel,
	onPermissionDecision,
	onAttachResources,
	onDropOsFilesToChat,
}: Props ): React.ReactElement {
	const [ input, setInput ] = useState( '' );

	const handleSend = (): void => {
		const text = input.trim();
		if ( ! text || ! chatId || busy ) {
			return;
		}
		const sels = addedSelections;
		const atts = pendingAttachments ?? [];
		// The agent gets the typed text plus each attached selection inlined
		// with its line range, and each attached file as a path-only reference
		// (the agent's Read tool auto-allows project-relative paths). The user
		// bubble's `text` stays exactly what the user typed — selections and
		// attachments ride on separate fields so the bubble can render its
		// indicators without baking them into the markdown.
		const attBlock = atts.length
			? [
					`The user has attached ${ atts.length } file${
						atts.length === 1 ? '' : 's'
					} from project resources. Read them with the Read tool when relevant:`,
					...atts.map(
						( a, i ) => `[${ i + 1 }] ${ a.folder }/${ a.relPath }`
					),
					'',
			  ].join( '\n' )
			: '';
		const selBlock = sels.length
			? [
					`The user has attached ${ sels.length } selection${
						sels.length === 1 ? '' : 's'
					} from project resources:`,
					'',
					...sels.flatMap( ( s, i ) => [
						`[${ i + 1 }] ${ s.resourcePath }, lines ${
							s.fromLine
						}–${ s.toLine }:`,
						'```',
						s.text,
						'```',
						'',
					] ),
			  ].join( '\n' )
			: '';
		const promptForAgent =
			atts.length === 0 && sels.length === 0
				? text
				: `${ attBlock }${ selBlock }Their message:\n${ text }`;
		const messageSelections: MessageSelection[] = sels.map( ( s ) => ( {
			resourcePath: s.resourcePath,
			text: s.text,
			fromLine: s.fromLine,
			toLine: s.toLine,
		} ) );
		setInput( '' );
		onSend( promptForAgent, {
			userMessageText: text,
			selections: messageSelections,
			attachments: atts,
		} );
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
				testId="draft-chat-transcript"
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
				placeholder="Ask for an edit on this draft…"
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
			e.dataTransfer.dropEffect = kind === 'files' ? 'copy' : 'copy';
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
