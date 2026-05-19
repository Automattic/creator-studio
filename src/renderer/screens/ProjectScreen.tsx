import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu } from '@base-ui/react/menu';

import type {
	ChatMeta,
	CurrentView,
	DraftAttachment,
	DraftSidebarTab,
	MessageSelection,
	OpenResource,
	ResourcesViewState,
} from '../../types';

import {
	EditIcon,
	FilePlusIcon,
	FolderPlusIcon,
	LinkIcon,
	MoreIcon,
	SparkleIcon,
	UploadIcon,
} from '../icons';
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
import {
	DraftSidebar,
	isDraftSidebarTabEnabled,
	type AddedSelection,
} from '../components/DraftSidebar';

// Re-exported for callers (App.tsx, ToolGroup) that imported these from
// ProjectScreen before the transcript was extracted.
export type UserMessage = TranscriptUserMessage;
export type AssistantMessage = TranscriptAssistantMessage;
export type ToolMessage = TranscriptToolMessage;
export type Message = ChatMessage;

type Props = {
	activeProjectId: string | null;
	// Display name of the active project, used by the titlebar slot. Empty
	// when no project is selected (the slot stays empty in that case).
	projectName: string;
	resourcesOpen: boolean;
	activeChatId: string | null;
	chats: ChatMeta[];
	messages: Message[];
	permissions: PermissionRequest[];
	busy: boolean;
	previewedFile: {
		folder: 'sources' | 'drafts' | 'done' | 'checks';
		relPath: string;
		name: string;
	} | null;
	// Resource the chat composer auto-attaches on send. Derived in App from
	// the editing draft (when open) or the previewed file — passed through
	// so DraftSidebar can hand it to DraftChatPanel.
	openResource: OpenResource | null;
	// Where the user is when no file is open (project root vs. a specific
	// folder). The composer mentions it in the agent preamble so "what's
	// in this folder?" reaches the agent with a concrete location.
	currentView: CurrentView | null;
	pendingAttachments: DraftAttachment[];
	pendingSelections: AddedSelection[];
	onRemovePendingAttachment: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string
	) => void;
	onPreviewAttachment: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string,
		isDirectory?: boolean
	) => void;
	onAddSelection: ( selection: MessageSelection ) => void;
	onClearPendingSelections: () => void;
	onSelectChat: ( chatId: string ) => void;
	onDeleteChat: ( chatId: string ) => void;
	onNewChat: () => void;
	onSend: (
		prompt: string,
		opts: {
			userMessageText?: string;
			selections?: MessageSelection[];
			attachments?: DraftAttachment[];
		}
	) => void;
	onCancelChat: ( chatId: string ) => void;
	onPreviewFile: (
		folder: 'sources' | 'drafts' | 'done' | 'checks',
		relPath: string,
		name: string
	) => void;
	onAddToChat: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string,
		isDirectory?: boolean
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
	onEngageAINewDraft: () => void;
	onImportUrl: ( subPath: string ) => void;
	onImportFile: ( subPath: string ) => void;
	onAddNote: ( subPath: string ) => void;
	onCreateFolder: ( parentSubPath: string ) => void;
	onMoveResources?: (
		items: Array< {
			folder: 'sources' | 'drafts' | 'done';
			relPath: string;
			name: string;
			kind: 'file' | 'dir';
		} >,
		destFolder: 'sources' | 'drafts' | 'done',
		destSubPath: string
	) => void;
	onDropOsFiles?: (
		files: File[],
		destFolder: 'sources' | 'drafts' | 'done',
		destSubPath: string
	) => void;
	onAttachResources?: (
		items: Array< {
			folder: 'sources' | 'drafts' | 'done';
			relPath: string;
			name: string;
			kind: 'file' | 'dir';
		} >
	) => void;
	onDropOsFilesToChat?: ( files: File[] ) => void;
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
	onCreateOrUpdateVoice: ( action: 'create' | 'update' ) => void;
};

export function ProjectScreen( {
	activeProjectId,
	projectName,
	resourcesOpen,
	activeChatId,
	chats,
	messages,
	permissions,
	busy,
	previewedFile,
	openResource,
	currentView,
	pendingAttachments,
	pendingSelections,
	onRemovePendingAttachment,
	onPreviewAttachment,
	onAddSelection,
	onClearPendingSelections,
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
	onEngageAINewDraft,
	onImportUrl,
	onImportFile,
	onAddNote,
	onCreateFolder,
	onMoveResources,
	onDropOsFiles,
	onAttachResources,
	onDropOsFilesToChat,
	sourcesRefreshSignal,
	onPreviewRelPathChanged,
	resourcesView,
	onResourcesViewChange,
	onPermissionDecision,
	onCreateOrUpdateVoice,
}: Props ): React.ReactElement {
	const [ sidebarOpen, setSidebarOpen ] = useState( true );
	const [ sidebarTab, setSidebarTab ] = useState< DraftSidebarTab >( 'chat' );

	// Voice-action state for the titlebar ⋯ menu. `null` while the initial
	// fetch is in flight; flips to "create" if the file is missing/empty or
	// still contains the bundled placeholder, otherwise "update". The state
	// previously lived in ResourcesGrid alongside the kebab menu — lifted
	// here when the menu moved into the project titlebar.
	const [ voiceAction, setVoiceAction ] = useState<
		'create' | 'update' | null
	>( null );
	const [ titleMenuOpen, setTitleMenuOpen ] = useState( false );
	const titleMenuWrapRef = useRef< HTMLDivElement | null >( null );
	const [ titlebarSlot, setTitlebarSlot ] = useState< HTMLElement | null >(
		null
	);

	useLayoutEffect( () => {
		setTitlebarSlot( document.getElementById( 'project-titlebar-slot' ) );
		// Re-resolve when the previewedFile flips, because App.tsx swaps the
		// slot div out for the resource-preview slot while previewing.
	}, [ previewedFile, activeProjectId ] );

	useEffect( () => {
		if ( ! activeProjectId ) {
			setVoiceAction( null );
			return;
		}
		let cancelled = false;
		setVoiceAction( null );
		void window.api.checks
			.read( activeProjectId, 'voice.md' )
			.then( ( res ) => {
				if ( cancelled ) {
					return;
				}
				if ( ! res ) {
					setVoiceAction( 'create' );
					return;
				}
				const body = res.body.trim();
				const isPlaceholder =
					body.length === 0 ||
					body.startsWith( '(No voice defined yet' );
				setVoiceAction( isPlaceholder ? 'create' : 'update' );
			} )
			.catch( () => {
				if ( ! cancelled ) {
					setVoiceAction( 'create' );
				}
			} );
		return () => {
			cancelled = true;
		};
	}, [ activeProjectId ] );

	// Refresh the voice action label after voice.md changes on disk so the
	// menu flips from "Create" to "Update" without a project reload.
	useEffect( () => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		const off = window.api.checks.onFolderChanged( ( payload ) => {
			if ( payload.projectId !== projectId ) {
				return;
			}
			void window.api.checks
				.read( projectId, 'voice.md' )
				.then( ( res ) => {
					if ( ! res ) {
						setVoiceAction( 'create' );
						return;
					}
					const body = res.body.trim();
					const isPlaceholder =
						body.length === 0 ||
						body.startsWith( '(No voice defined yet' );
					setVoiceAction( isPlaceholder ? 'create' : 'update' );
				} )
				.catch( () => {
					setVoiceAction( 'create' );
				} );
		} );
		return () => {
			off();
		};
	}, [ activeProjectId ] );

	useEffect( () => {
		if ( ! titleMenuOpen ) {
			return;
		}
		const onKey = ( e: KeyboardEvent ): void => {
			if ( e.key === 'Escape' ) {
				setTitleMenuOpen( false );
			}
		};
		const onDocClick = ( e: MouseEvent ): void => {
			if (
				titleMenuWrapRef.current &&
				! titleMenuWrapRef.current.contains( e.target as Node )
			) {
				setTitleMenuOpen( false );
			}
		};
		document.addEventListener( 'keydown', onKey );
		document.addEventListener( 'mousedown', onDocClick );
		return () => {
			document.removeEventListener( 'keydown', onKey );
			document.removeEventListener( 'mousedown', onDocClick );
		};
	}, [ titleMenuOpen ] );

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

	// The project view is not an editor surface — outline / share need the
	// body + headings owned by DraftEditorScreen, and checks needs the per-
	// draft state. So the rail here only exposes chat (with checks visible
	// but disabled). Opening a draft or done doc in the editor flips this
	// via DraftEditorScreen's docKind.
	const docKind: 'draft' | 'done' | null = null;

	useEffect( () => {
		if ( ! isDraftSidebarTabEnabled( sidebarTab, docKind ) ) {
			setSidebarTab( 'chat' );
		}
	}, [ docKind, sidebarTab ] );

	const handleOpenChatForSelection = (): void => {
		setSidebarOpen( true );
		setSidebarTab( 'chat' );
	};

	const titlebarContent =
		titlebarSlot && activeProjectId ? (
			<div className="project-titlebar" data-testid="project-titlebar">
				<h1
					className="project-titlebar-title"
					data-testid="project-titlebar-title"
					title={ projectName }
				>
					{ projectName }
				</h1>
				<div className="project-titlebar-actions">
					<Menu.Root>
						<Menu.Trigger
							className="project-titlebar-primary"
							data-testid="project-titlebar-add-resource"
						>
							<span>Add source</span>
						</Menu.Trigger>
						<Menu.Portal>
							<Menu.Positioner
								className="menu-positioner"
								side="bottom"
								align="end"
								sideOffset={ 6 }
							>
								<Menu.Popup
									className="menu-popup is-descriptive"
									data-testid="project-titlebar-add-resource-menu"
								>
									<Menu.Item
										className="menu-item is-descriptive"
										data-testid="project-titlebar-add-resource-menu-add-note"
										onClick={ () => onAddNote( 'sources' ) }
									>
										<EditIcon size={ 18 } />
										<span className="menu-item-text">
											<span className="menu-item-title">
												New note
											</span>
											<span className="menu-item-subtitle">
												Write something directly into
												the project.
											</span>
										</span>
									</Menu.Item>
									<Menu.Item
										className="menu-item is-descriptive"
										data-testid="project-titlebar-add-resource-menu-create-folder"
										onClick={ () =>
											onCreateFolder( 'sources' )
										}
									>
										<FolderPlusIcon size={ 18 } />
										<span className="menu-item-text">
											<span className="menu-item-title">
												New folder
											</span>
											<span className="menu-item-subtitle">
												Group related sources together.
											</span>
										</span>
									</Menu.Item>
									<Menu.Item
										className="menu-item is-descriptive"
										data-testid="project-titlebar-add-resource-menu-import-url"
										onClick={ () =>
											onImportUrl( 'sources' )
										}
									>
										<LinkIcon size={ 18 } />
										<span className="menu-item-text">
											<span className="menu-item-title">
												Import URL
											</span>
											<span className="menu-item-subtitle">
												Pull in a webpage, tweet, or
												video.
											</span>
										</span>
									</Menu.Item>
									<Menu.Item
										className="menu-item is-descriptive"
										data-testid="project-titlebar-add-resource-menu-import-file"
										onClick={ () =>
											onImportFile( 'sources' )
										}
									>
										<UploadIcon size={ 18 } />
										<span className="menu-item-text">
											<span className="menu-item-title">
												Import file
											</span>
											<span className="menu-item-subtitle">
												Bring in a file from your
												computer.
											</span>
										</span>
									</Menu.Item>
								</Menu.Popup>
							</Menu.Positioner>
						</Menu.Portal>
					</Menu.Root>
					<Menu.Root>
						<Menu.Trigger
							className="project-titlebar-primary is-primary"
							data-testid="project-titlebar-new-draft"
						>
							<span>Create draft</span>
						</Menu.Trigger>
						<Menu.Portal>
							<Menu.Positioner
								className="menu-positioner"
								side="bottom"
								align="end"
								sideOffset={ 6 }
							>
								<Menu.Popup
									className="menu-popup is-descriptive"
									data-testid="project-titlebar-new-draft-menu"
								>
									<Menu.Item
										className="menu-item is-descriptive"
										data-testid="project-titlebar-new-draft-menu-empty"
										onClick={ onNewDraft }
									>
										<FilePlusIcon size={ 18 } />
										<span className="menu-item-text">
											<span className="menu-item-title">
												Empty draft
											</span>
											<span className="menu-item-subtitle">
												Open the editor with a blank
												page.
											</span>
										</span>
									</Menu.Item>
									<Menu.Item
										className="menu-item is-descriptive"
										data-testid="project-titlebar-new-draft-menu-engage-ai"
										onClick={ onEngageAINewDraft }
									>
										<SparkleIcon size={ 18 } />
										<span className="menu-item-text">
											<span className="menu-item-title">
												Engage AI
											</span>
											<span className="menu-item-subtitle">
												Brief the agent and have it
												write a first pass.
											</span>
										</span>
									</Menu.Item>
								</Menu.Popup>
							</Menu.Positioner>
						</Menu.Portal>
					</Menu.Root>
					<div
						className="project-titlebar-menu-wrap"
						ref={ titleMenuWrapRef }
					>
						<button
							type="button"
							className="project-titlebar-icon-btn"
							data-testid="project-titlebar-actions-button"
							aria-label="Project actions"
							aria-haspopup="menu"
							aria-expanded={ titleMenuOpen }
							title="More actions"
							onClick={ () => setTitleMenuOpen( ( v ) => ! v ) }
						>
							<MoreIcon size={ 16 } />
						</button>
						{ titleMenuOpen && (
							<div
								className="project-titlebar-menu"
								data-testid="project-titlebar-actions-menu"
								role="menu"
							>
								<button
									type="button"
									className="project-titlebar-menu-item"
									data-testid="project-titlebar-action-create-voice"
									data-voice-action={
										voiceAction ?? 'create'
									}
									role="menuitem"
									disabled={ voiceAction === null }
									onClick={ () => {
										setTitleMenuOpen( false );
										onCreateOrUpdateVoice(
											voiceAction ?? 'create'
										);
									} }
								>
									{ voiceAction === 'update'
										? 'Update voice'
										: 'Set up voice' }
								</button>
							</div>
						) }
					</div>
				</div>
			</div>
		) : null;

	return (
		<section
			className="project-screen"
			data-testid="screen-project"
			data-project-id={ activeProjectId ?? '' }
			aria-label="Project"
		>
			{ titlebarSlot &&
				titlebarContent &&
				createPortal( titlebarContent, titlebarSlot ) }
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
								onAddToChat: (
									folder,
									relPath,
									name,
									isDir
								) => {
									handleOpenChatForSelection();
									onAddToChat( folder, relPath, name, isDir );
								},
								onOpenNewChat: ( folder, relPath, name ) => {
									handleOpenChatForSelection();
									onOpenNewChat( folder, relPath, name );
								},
								onEditDraft,
								onResourceDeleted,
								onClosePreview,
								onImportUrl,
								onImportFile,
								onAddNote,
								onCreateFolder,
								onMoveResources,
								onDropOsFiles,
								sourcesRefreshSignal,
								onPreviewRelPathChanged,
								resourcesView,
								onResourcesViewChange,
								selectionMenuMode:
									sidebarOpen && sidebarTab === 'chat'
										? 'chat-open'
										: 'idle',
								onAddSelection,
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
					docKind={ docKind }
					openResource={ openResource }
					currentView={ currentView }
					relPath={
						previewedFile?.folder === 'drafts' ||
						previewedFile?.folder === 'done'
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
					addedSelections={ pendingSelections }
					onClearAddedSelections={ onClearPendingSelections }
					pendingAttachments={ pendingAttachments }
					onRemovePendingAttachment={ onRemovePendingAttachment }
					onPreviewAttachment={ onPreviewAttachment }
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
					onAttachResources={ onAttachResources }
					onDropOsFilesToChat={ onDropOsFilesToChat }
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
	onImportUrl,
	onImportFile,
	onAddNote,
	onCreateFolder,
	onMoveResources,
	onDropOsFiles,
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
		folder: 'sources' | 'drafts' | 'done' | 'checks';
		relPath: string;
		name: string;
	} | null;
	addToChatDisabled: boolean;
	onPreviewFile: (
		folder: 'sources' | 'drafts' | 'done' | 'checks',
		relPath: string,
		name: string
	) => void;
	onAddToChat: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string,
		isDirectory?: boolean
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
	onImportUrl: ( subPath: string ) => void;
	onImportFile: ( subPath: string ) => void;
	onAddNote: ( subPath: string ) => void;
	onCreateFolder: ( parentSubPath: string ) => void;
	onMoveResources?: (
		items: Array< {
			folder: 'sources' | 'drafts' | 'done';
			relPath: string;
			name: string;
			kind: 'file' | 'dir';
		} >,
		destFolder: 'sources' | 'drafts' | 'done',
		destSubPath: string
	) => void;
	onDropOsFiles?: (
		files: File[],
		destFolder: 'sources' | 'drafts' | 'done',
		destSubPath: string
	) => void;
	onAttachResources?: (
		items: Array< {
			folder: 'sources' | 'drafts' | 'done';
			relPath: string;
			name: string;
			kind: 'file' | 'dir';
		} >
	) => void;
	onDropOsFilesToChat?: ( files: File[] ) => void;
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
				// Intentionally omits relPath. An auto-rename inside the
				// note editor updates `previewedFile.relPath` to point at the
				// slugged filename; if relPath were in the key, the whole
				// ResourcePreview (and the CodeMirror view inside it) would
				// remount, dropping focus the user just moved into the body
				// via Enter / ArrowDown. ResourcePreview's internal effects
				// re-run on relPath change (re-fetch mtime, re-seed title,
				// load body) so the component stays in sync without the
				// remount.
				key={ `${ activeProjectId }:${ previewedFile.folder }` }
				projectId={ activeProjectId }
				folder={ previewedFile.folder }
				relPath={ previewedFile.relPath }
				name={ previewedFile.name }
				addToChatDisabled={ addToChatDisabled }
				onBack={ onClosePreview }
				onAddToChat={ () => {
					// Checks aren't an attachable resource. The button is
					// hidden upstream when folder === 'checks', but the
					// narrowing keeps the callback signature honest.
					if ( previewedFile.folder === 'checks' ) {
						return;
					}
					onAddToChat(
						previewedFile.folder,
						previewedFile.relPath,
						previewedFile.name
					);
				} }
				onOpenNewChat={ () => {
					if ( previewedFile.folder === 'checks' ) {
						return;
					}
					onOpenNewChat(
						previewedFile.folder,
						previewedFile.relPath,
						previewedFile.name
					);
				} }
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
				onRelPathChanged={ ( newRelPath ) => {
					// Auto-rename today is wired sources-only; checks keep
					// their stable filename. The narrowing keeps the
					// callback signature honest if InlineFileEditor ever
					// surprises us by firing this for checks.
					if ( previewedFile.folder === 'checks' ) {
						return;
					}
					onPreviewRelPathChanged(
						previewedFile.folder,
						previewedFile.relPath,
						newRelPath
					);
				} }
				onDeleted={ () => {
					if ( previewedFile.folder === 'checks' ) {
						// Delete still happens on disk via ResourcePreview's
						// own resources:delete call; we just don't surface a
						// "preview cleared" event for the project view since
						// checks don't appear in chat attachment lists.
						return;
					}
					onResourceDeleted(
						previewedFile.folder,
						previewedFile.relPath,
						previewedFile.name
					);
				} }
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
			onImportUrl={ onImportUrl }
			onImportFile={ onImportFile }
			onAddNote={ onAddNote }
			onCreateFolder={ onCreateFolder }
			onMoveResources={ onMoveResources }
			onDropOsFiles={ onDropOsFiles }
			sourcesRefreshSignal={ sourcesRefreshSignal }
		/>
	);
}
