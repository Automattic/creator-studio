import React, { useEffect, useRef, useState } from 'react';

import type {
	ChatMeta,
	DraftSidebarTab,
	MessageSelection,
	ResourcesViewState,
} from '../../types';

import { isMarkdown } from '../lib/previewKind';
import {
	type ChatMessage,
	type AssistantMessage as TranscriptAssistantMessage,
	type ToolMessage as TranscriptToolMessage,
	type UserMessage as TranscriptUserMessage,
} from '../components/ChatTranscript';
import { ResourcePreview } from '../components/ResourcePreview';
import { type PermissionRequest } from '../components/PermissionPrompt';
import { ResourcesGrid } from '../components/ResourcesGrid';
import { DraftSidebar, type AddedSelection } from '../components/DraftSidebar';
import { withSelectionId } from '../editor/useSelectionMenu';

// Re-exported for callers (App.tsx, ToolGroup) that imported these from
// ProjectScreen before the transcript was extracted.
export type UserMessage = TranscriptUserMessage;
export type AssistantMessage = TranscriptAssistantMessage;
export type ToolMessage = TranscriptToolMessage;
export type Message = ChatMessage;

type Props = {
	activeProjectId: string | null;
	resourcesOpen: boolean;
	activeChatId: string | null;
	chats: ChatMeta[];
	messages: Message[];
	permissions: PermissionRequest[];
	busy: boolean;
	previewedFile: {
		folder: 'sources' | 'drafts' | 'done';
		relPath: string;
		name: string;
	} | null;
	onSelectChat: ( chatId: string ) => void;
	onDeleteChat: ( chatId: string ) => void;
	onNewChat: () => void;
	onSend: (
		prompt: string,
		opts: {
			userMessageText?: string;
			selections?: MessageSelection[];
		}
	) => void;
	onCancelChat: ( chatId: string ) => void;
	onPreviewFile: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string
	) => void;
	onAddToChat: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string
	) => void;
	onOpenNewChat: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string
	) => void;
	onEditDraft: ( relPath: string, name: string ) => void;
	onResourceDeleted: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string
	) => void;
	onClosePreview: () => void;
	onNewDraft: () => void;
	onImportUrl: () => void;
	onImportFile: () => void;
	onAddNote: () => void;
	sourcesRefreshSignal: number;
	// Fired by the inline source-markdown preview after the title input
	// auto-renames the file (or an explicit rename happens). The parent
	// updates `previewedFile` to the new path so the next render targets
	// the renamed file.
	onPreviewRelPathChanged: (
		folder: 'sources' | 'drafts' | 'done',
		oldRelPath: string,
		newRelPath: string
	) => void;
	resourcesView: ResourcesViewState;
	onResourcesViewChange: ( patch: Partial< ResourcesViewState > ) => void;
	onPermissionDecision: (
		requestId: string,
		decision: 'allow' | 'deny',
		remember: boolean
	) => void;
};

export function ProjectScreen( {
	activeProjectId,
	resourcesOpen,
	activeChatId,
	chats,
	messages,
	permissions,
	busy,
	previewedFile,
	onSelectChat,
	onDeleteChat,
	onNewChat,
	onSend,
	onCancelChat,
	onPreviewFile,
	onAddToChat,
	onOpenNewChat,
	onEditDraft,
	onResourceDeleted,
	onClosePreview,
	onNewDraft,
	onImportUrl,
	onImportFile,
	onAddNote,
	sourcesRefreshSignal,
	onPreviewRelPathChanged,
	resourcesView,
	onResourcesViewChange,
	onPermissionDecision,
}: Props ): React.ReactElement {
	const [ sidebarOpen, setSidebarOpen ] = useState( true );
	const [ sidebarTab, setSidebarTab ] = useState< DraftSidebarTab >( 'chat' );
	const [ previewSelections, setPreviewSelections ] = useState<
		AddedSelection[]
	>( [] );

	const resourcesAreaListRef = useRef< HTMLDivElement | null >( null );
	// Hold the latest `onResourcesViewChange` so the scroll listener doesn't
	// have to re-attach every time App re-renders (the prop is a fresh arrow
	// each time).
	const onResourcesViewChangeRef = useRef( onResourcesViewChange );
	useEffect( () => {
		onResourcesViewChangeRef.current = onResourcesViewChange;
	}, [ onResourcesViewChange ] );

	// While the resources grid is showing (no preview), push the scroll
	// position up to App so a later preview round-trip can restore it. The
	// listener detaches when the preview is open: scrolls inside the preview
	// share the same DOM element but belong to a different view.
	useEffect( () => {
		if ( previewedFile !== null ) {
			return;
		}
		const el = resourcesAreaListRef.current;
		if ( ! el ) {
			return;
		}
		let raf = 0;
		const onScroll = (): void => {
			if ( raf !== 0 ) {
				return;
			}
			raf = requestAnimationFrame( () => {
				raf = 0;
				onResourcesViewChangeRef.current( {
					scrollTop: el.scrollTop,
				} );
			} );
		};
		el.addEventListener( 'scroll', onScroll, { passive: true } );
		return () => {
			if ( raf !== 0 ) {
				cancelAnimationFrame( raf );
			}
			el.removeEventListener( 'scroll', onScroll );
		};
	}, [ previewedFile, activeProjectId ] );

	// When the preview closes (or the user switches to a project that has a
	// saved scroll position), restore it. The grid remounts with empty
	// `groups` and fills them via async IPC, so the container's scrollHeight
	// grows over time — a `ResizeObserver` retries the assignment until the
	// target is reachable, with a hard timeout as a safety net.
	useEffect( () => {
		if ( previewedFile !== null ) {
			return;
		}
		const el = resourcesAreaListRef.current;
		if ( ! el ) {
			return;
		}
		const target = resourcesView.scrollTop;
		if ( target === 0 ) {
			return;
		}
		let done = false;
		const tryRestore = (): void => {
			if ( done ) {
				return;
			}
			el.scrollTop = target;
			if ( el.scrollTop === target ) {
				done = true;
			}
		};
		tryRestore();
		const observer = new ResizeObserver( tryRestore );
		const inner = el.firstElementChild;
		if ( inner ) {
			observer.observe( inner );
		}
		const stop = setTimeout( () => {
			done = true;
			observer.disconnect();
		}, 1000 );
		return () => {
			done = true;
			observer.disconnect();
			clearTimeout( stop );
		};
		// `resourcesView.scrollTop` is intentionally omitted — re-applying on
		// every scroll-listener push would fight the user's manual scroll.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ previewedFile, activeProjectId ] );

	const handleRailClick = ( next: DraftSidebarTab ): void => {
		if ( ! sidebarOpen ) {
			setSidebarOpen( true );
			setSidebarTab( next );
			return;
		}
		if ( next === sidebarTab ) {
			setSidebarOpen( false );
			return;
		}
		setSidebarTab( next );
	};

	// A draft is "open" when the previewed file is in the drafts folder.
	const draftOpen = previewedFile?.folder === 'drafts';
	const previewResourcePath = previewedFile
		? `${ previewedFile.folder }/${ previewedFile.relPath }`
		: '';

	useEffect( () => {
		setPreviewSelections( [] );
	}, [ activeProjectId, previewResourcePath ] );

	const handleAddPreviewSelection = ( selection: MessageSelection ): void => {
		setPreviewSelections( ( list ) => [
			...list,
			withSelectionId( selection ),
		] );
	};

	const handleOpenChatForSelection = (): void => {
		setSidebarOpen( true );
		setSidebarTab( 'chat' );
	};

	return (
		<section
			className="project-screen"
			data-testid="screen-project"
			data-project-id={ activeProjectId ?? '' }
			aria-label="Project"
		>
			<div className="project-canvas" data-testid="project-canvas">
				<aside
					className="resources-area"
					data-testid="resources-area"
					data-open={ resourcesOpen ? 'true' : 'false' }
					aria-label="Resources"
					aria-hidden={ ! resourcesOpen }
				>
					<div className="resources-area-inner">
						<div
							ref={ resourcesAreaListRef }
							className="resources-area-list"
							data-testid="resources-list"
						>
							{ renderResourcesContent( {
								activeProjectId,
								previewedFile,
								addToChatDisabled: activeChatId === null,
								onPreviewFile,
								onAddToChat,
								onOpenNewChat,
								onEditDraft,
								onResourceDeleted,
								onClosePreview,
								onNewDraft,
								onImportUrl,
								onImportFile,
								onAddNote,
								sourcesRefreshSignal,
								onPreviewRelPathChanged,
								resourcesView,
								onResourcesViewChange,
								selectionMenuMode:
									sidebarOpen && sidebarTab === 'chat'
										? 'chat-open'
										: 'idle',
								onAddSelection: handleAddPreviewSelection,
								onOpenSelectionChat: handleOpenChatForSelection,
							} ) }
						</div>
					</div>
				</aside>

				<DraftSidebar
					open={ sidebarOpen }
					tab={ sidebarTab }
					onTabClick={ handleRailClick }
					onClose={ () => setSidebarOpen( false ) }
					projectId={ activeProjectId ?? '' }
					draftOpen={ draftOpen }
					relPath={
						previewedFile?.folder === 'drafts'
							? previewedFile.relPath
							: ''
					}
					folder={
						previewedFile?.folder === 'drafts' ||
						previewedFile?.folder === 'done'
							? previewedFile.folder
							: 'drafts'
					}
					chats={ chats }
					activeChatId={ activeChatId }
					messages={ messages }
					busy={ busy }
					permissions={ permissions }
					addedSelections={ previewSelections }
					onClearAddedSelections={ () => setPreviewSelections( [] ) }
					onSelectChat={ onSelectChat }
					onNewChat={ onNewChat }
					onDeleteChat={ onDeleteChat }
					onSend={ onSend }
					onCancelChat={ () => {
						if ( activeChatId ) {
							onCancelChat( activeChatId );
						}
					} }
					onPermissionDecision={ onPermissionDecision }
				/>
			</div>
		</section>
	);
}

function renderResourcesContent( {
	activeProjectId,
	previewedFile,
	addToChatDisabled,
	onPreviewFile,
	onAddToChat,
	onOpenNewChat,
	onEditDraft,
	onResourceDeleted,
	onClosePreview,
	onNewDraft,
	onImportUrl,
	onImportFile,
	onAddNote,
	sourcesRefreshSignal,
	onPreviewRelPathChanged,
	resourcesView,
	onResourcesViewChange,
	selectionMenuMode,
	onAddSelection,
	onOpenSelectionChat,
}: {
	activeProjectId: string | null;
	previewedFile: {
		folder: 'sources' | 'drafts' | 'done';
		relPath: string;
		name: string;
	} | null;
	addToChatDisabled: boolean;
	onPreviewFile: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string
	) => void;
	onAddToChat: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string
	) => void;
	onOpenNewChat: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string
	) => void;
	onEditDraft: ( relPath: string, name: string ) => void;
	onResourceDeleted: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string
	) => void;
	onClosePreview: () => void;
	onNewDraft: () => void;
	onImportUrl: () => void;
	onImportFile: () => void;
	onAddNote: () => void;
	sourcesRefreshSignal: number;
	onPreviewRelPathChanged: (
		folder: 'sources' | 'drafts' | 'done',
		oldRelPath: string,
		newRelPath: string
	) => void;
	resourcesView: ResourcesViewState;
	onResourcesViewChange: ( patch: Partial< ResourcesViewState > ) => void;
	selectionMenuMode: 'idle' | 'chat-open';
	onAddSelection: ( selection: MessageSelection ) => void;
	onOpenSelectionChat: () => void;
} ): React.ReactElement {
	if ( ! activeProjectId ) {
		return (
			<div className="resources-area-empty" data-testid="resources-empty">
				Link a project to browse files
			</div>
		);
	}
	if ( previewedFile ) {
		const editable =
			previewedFile.folder === 'drafts' &&
			isMarkdown( previewedFile.name );
		return (
			<ResourcePreview
				key={ `${ activeProjectId }:${ previewedFile.folder }:${ previewedFile.relPath }` }
				projectId={ activeProjectId }
				folder={ previewedFile.folder }
				relPath={ previewedFile.relPath }
				name={ previewedFile.name }
				addToChatDisabled={ addToChatDisabled }
				onBack={ onClosePreview }
				onAddToChat={ () =>
					onAddToChat(
						previewedFile.folder,
						previewedFile.relPath,
						previewedFile.name
					)
				}
				onOpenNewChat={ () =>
					onOpenNewChat(
						previewedFile.folder,
						previewedFile.relPath,
						previewedFile.name
					)
				}
				onEditDraft={
					editable
						? () =>
								onEditDraft(
									previewedFile.relPath,
									previewedFile.name
								)
						: undefined
				}
				selectionMenuMode={ selectionMenuMode }
				onAddSelection={ onAddSelection }
				onOpenSelectionChat={ onOpenSelectionChat }
				onRelPathChanged={ ( newRelPath ) =>
					onPreviewRelPathChanged(
						previewedFile.folder,
						previewedFile.relPath,
						newRelPath
					)
				}
				onDeleted={ () =>
					onResourceDeleted(
						previewedFile.folder,
						previewedFile.relPath,
						previewedFile.name
					)
				}
			/>
		);
	}
	return (
		<ResourcesGrid
			key={ activeProjectId }
			projectId={ activeProjectId }
			viewState={ resourcesView }
			onViewStateChange={ onResourcesViewChange }
			onPreviewFile={ onPreviewFile }
			onAddToChat={ onAddToChat }
			onOpenNewChat={ onOpenNewChat }
			addToChatDisabled={ addToChatDisabled }
			onEditDraft={ onEditDraft }
			onResourceDeleted={ onResourceDeleted }
			onNewDraft={ onNewDraft }
			onImportUrl={ onImportUrl }
			onImportFile={ onImportFile }
			onAddNote={ onAddNote }
			sourcesRefreshSignal={ sourcesRefreshSignal }
		/>
	);
}
