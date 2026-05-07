import React, { useEffect, useRef, useState } from 'react';

import { CHAT_ACTIONS, type ChatActionId } from '../../chat-actions';
import type {
	ChatMeta,
	DraftAttachment,
	ResourcesViewState,
} from '../../types';

import { isMarkdown } from '../lib/previewKind';
import { ChatComposer } from '../components/ChatComposer';
import {
	ChatTranscript,
	type ChatMessage,
	type AssistantMessage as TranscriptAssistantMessage,
	type ToolMessage as TranscriptToolMessage,
	type UserMessage as TranscriptUserMessage,
} from '../components/ChatTranscript';
import { ResourcePreview } from '../components/ResourcePreview';
import {
	PermissionPrompt,
	type PermissionRequest,
} from '../components/PermissionPrompt';
import { ResourcesGrid } from '../components/ResourcesGrid';
import {
	CloseIcon,
	EditIcon,
	HistoryIcon,
	PlusIcon,
	TrashIcon,
} from '../icons';

// Re-exported for callers (App.tsx, ToolGroup) that imported these from
// ProjectScreen before the transcript was extracted.
export type UserMessage = TranscriptUserMessage;
export type AssistantMessage = TranscriptAssistantMessage;
export type ToolMessage = TranscriptToolMessage;
export type Message = ChatMessage;

function computeChatLabels( chats: ChatMeta[] ): Map< string, string > {
	const labels = new Map< string, string >();
	const untitledTotal = chats.filter( ( c ) => ! c.title ).length;
	let untitledSeen = 0;
	for ( const c of chats ) {
		if ( c.title ) {
			labels.set( c.id, c.title );
			continue;
		}
		untitledSeen += 1;
		labels.set(
			c.id,
			untitledTotal === 1 ? 'Untitled' : `Untitled ${ untitledSeen }`
		);
	}
	return labels;
}

type Props = {
	activeProjectId: string | null;
	// Absolute path of the active project. Forwarded to ChatTranscript so it
	// can resolve `Write` tool outputs back to clickable resource cards. Null
	// when no project is active.
	activeProjectPath: string | null;
	resourcesOpen: boolean;
	activeChatId: string | null;
	runningChatIds: readonly string[];
	chats: ChatMeta[];
	closedChatIds: string[];
	messages: Message[];
	permissions: PermissionRequest[];
	input: string;
	busy: boolean;
	previewedFile: {
		folder: 'sources' | 'drafts' | 'done';
		relPath: string;
		name: string;
	} | null;
	stagedAttachments: DraftAttachment[];
	onRemoveStagedAttachment: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string
	) => void;
	onPreviewStagedAttachment: (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string
	) => void;
	onInputChange: ( value: string ) => void;
	onSelectChat: ( chatId: string ) => void;
	onCloseChat: ( chatId: string ) => void;
	onCancelChat: ( chatId: string ) => void;
	onOpenChat: ( chatId: string ) => void;
	onDeleteChat: ( chatId: string ) => void;
	onRenameChat: ( chatId: string, title: string ) => void;
	onNewChat: () => void;
	onStartStarterChat: ( kind: ChatActionId ) => void;
	onSend: () => void;
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
	resourcesView: ResourcesViewState;
	onResourcesViewChange: ( patch: Partial< ResourcesViewState > ) => void;
	onPermissionDecision: (
		requestId: string,
		decision: 'allow' | 'deny',
		remember: boolean
	) => void;
	onErrorAction?: ( action: 'open-settings' ) => void;
};

export function ProjectScreen( {
	activeProjectId,
	activeProjectPath,
	resourcesOpen,
	activeChatId,
	runningChatIds,
	chats,
	closedChatIds,
	messages,
	permissions,
	input,
	busy,
	previewedFile,
	stagedAttachments,
	onRemoveStagedAttachment,
	onPreviewStagedAttachment,
	onInputChange,
	onSelectChat,
	onCloseChat,
	onCancelChat,
	onOpenChat,
	onDeleteChat,
	onRenameChat,
	onNewChat,
	onStartStarterChat,
	onSend,
	onPreviewFile,
	onAddToChat,
	onOpenNewChat,
	onEditDraft,
	onResourceDeleted,
	onClosePreview,
	onNewDraft,
	onImportUrl,
	resourcesView,
	onResourcesViewChange,
	onPermissionDecision,
	onErrorAction,
}: Props ): React.ReactElement {
	const chatLabels = computeChatLabels( chats );
	const closedSet = new Set( closedChatIds );
	const visibleChats = chats.filter( ( c ) => ! closedSet.has( c.id ) );
	const historyChats = [ ...chats ].sort( ( a, b ) => {
		const aAt = a.lastMessageAt ?? a.createdAt;
		const bAt = b.lastMessageAt ?? b.createdAt;
		return bAt - aAt;
	} );
	const [ historyOpen, setHistoryOpen ] = useState( false );
	const [ historyQuery, setHistoryQuery ] = useState( '' );
	const historyRef = useRef< HTMLDivElement | null >( null );
	const historySearchRef = useRef< HTMLInputElement | null >( null );
	const [ editingChatId, setEditingChatId ] = useState< string | null >(
		null
	);
	const [ editingValue, setEditingValue ] = useState( '' );
	const editInputRef = useRef< HTMLInputElement | null >( null );
	const [ addMenuOpen, setAddMenuOpen ] = useState( false );
	const addMenuRef = useRef< HTMLDivElement | null >( null );
	const transcriptRef = useRef< HTMLElement | null >( null );
	const composerInputRef = useRef< HTMLTextAreaElement | null >( null );
	const lastUserIdRef = useRef< string | null >( null );
	const resourcesAreaListRef = useRef< HTMLDivElement | null >( null );
	// Hold the latest `onResourcesViewChange` so the scroll listener doesn't
	// have to re-attach every time App re-renders (the prop is a fresh arrow
	// each time).
	const onResourcesViewChangeRef = useRef( onResourcesViewChange );
	useEffect( () => {
		onResourcesViewChangeRef.current = onResourcesViewChange;
	}, [ onResourcesViewChange ] );

	useEffect( () => {
		if ( editingChatId ) {
			editInputRef.current?.focus();
			editInputRef.current?.select();
		}
	}, [ editingChatId ] );

	// Don't scroll on chat switch: reset the tracker so the next "new user
	// message" detection fires only when the user actually sends.
	useEffect( () => {
		lastUserIdRef.current = null;
	}, [ activeChatId ] );

	// When a new user message appears at the tail of the transcript, scroll
	// the transcript to the bottom so the just-sent message and the
	// (about-to-stream) assistant bubble are visible.
	useEffect( () => {
		let lastUser: UserMessage | null = null;
		for ( let i = messages.length - 1; i >= 0; i-- ) {
			const m = messages[ i ];
			if ( m.kind === 'user' ) {
				lastUser = m;
				break;
			}
		}
		if ( ! lastUser ) {
			return;
		}
		if ( lastUser.id === lastUserIdRef.current ) {
			return;
		}
		const isFirstSee = lastUserIdRef.current === null;
		lastUserIdRef.current = lastUser.id;
		if ( isFirstSee ) {
			return;
		}
		const transcript = transcriptRef.current;
		if ( ! transcript ) {
			return;
		}
		transcript.scrollTo( {
			top: transcript.scrollHeight,
			behavior: 'smooth',
		} );
	}, [ messages ] );

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

	const startEditingTab = ( chatId: string ): void => {
		const current = chats.find( ( c ) => c.id === chatId );
		setEditingChatId( chatId );
		setEditingValue( current?.title ?? chatLabels.get( chatId ) ?? '' );
	};

	const commitEditingTab = (): void => {
		if ( ! editingChatId ) {
			return;
		}
		onRenameChat( editingChatId, editingValue );
		setEditingChatId( null );
		setEditingValue( '' );
	};

	const cancelEditingTab = (): void => {
		setEditingChatId( null );
		setEditingValue( '' );
	};

	const filteredHistoryChats = ( () => {
		const q = historyQuery.trim().toLowerCase();
		if ( ! q ) {
			return historyChats;
		}
		return historyChats.filter( ( c ) =>
			( chatLabels.get( c.id ) ?? '' ).toLowerCase().includes( q )
		);
	} )();

	useEffect( () => {
		if ( ! activeChatId ) {
			return;
		}
		// Switching chats programmatically (e.g. clicking a draft card to
		// open its linked chat) shouldn't leave the history or "+" popovers
		// hanging — close them so focus lands in the transcript / composer
		// instead of the popover's search input.
		setHistoryOpen( false );
		setAddMenuOpen( false );
		const el = document.querySelector(
			`[data-testid="chat-tab-${ activeChatId }"]`
		);
		if ( el instanceof HTMLElement ) {
			el.scrollIntoView( {
				behavior: 'smooth',
				block: 'nearest',
				inline: 'nearest',
			} );
		}
	}, [ activeChatId ] );

	useEffect( () => {
		if ( ! historyOpen ) {
			setHistoryQuery( '' );
			return;
		}
		historySearchRef.current?.focus();
		const onDocClick = ( e: MouseEvent ): void => {
			if (
				historyRef.current &&
				! historyRef.current.contains( e.target as Node )
			) {
				setHistoryOpen( false );
			}
		};
		const onKey = ( e: KeyboardEvent ): void => {
			if ( e.key === 'Escape' ) {
				setHistoryOpen( false );
			}
		};
		document.addEventListener( 'mousedown', onDocClick );
		document.addEventListener( 'keydown', onKey );
		return () => {
			document.removeEventListener( 'mousedown', onDocClick );
			document.removeEventListener( 'keydown', onKey );
		};
	}, [ historyOpen ] );

	useEffect( () => {
		if ( ! addMenuOpen ) {
			return;
		}
		const onDocClick = ( e: MouseEvent ): void => {
			if (
				addMenuRef.current &&
				! addMenuRef.current.contains( e.target as Node )
			) {
				setAddMenuOpen( false );
			}
		};
		const onKey = ( e: KeyboardEvent ): void => {
			if ( e.key === 'Escape' ) {
				setAddMenuOpen( false );
			}
		};
		document.addEventListener( 'mousedown', onDocClick );
		document.addEventListener( 'keydown', onKey );
		return () => {
			document.removeEventListener( 'mousedown', onDocClick );
			document.removeEventListener( 'keydown', onKey );
		};
	}, [ addMenuOpen ] );

	const actionsDisabled = ! activeProjectId || busy;
	const inputDisabled = busy || permissions.length > 0 || ! activeProjectId;
	const isEmpty = !! activeProjectId && ! activeChatId;

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
								resourcesView,
								onResourcesViewChange,
							} ) }
						</div>
					</div>
				</aside>

				<div
					className="chat-area"
					data-testid="chat-area"
					data-empty={ isEmpty ? 'true' : 'false' }
				>
					{ visibleChats.length > 0 && (
						<div
							className="transcript-chats"
							data-testid="chat-selector"
						>
							<div
								className="transcript-chats-tabs"
								role="tablist"
								aria-label="Chats"
							>
								{ visibleChats.map( ( chat ) => {
									const label = chatLabels.get( chat.id );
									const isActive = chat.id === activeChatId;
									const isEditing = chat.id === editingChatId;
									const isRunning = runningChatIds.includes(
										chat.id
									);
									return (
										<div
											key={ chat.id }
											className="chat-tab"
											data-testid={ `chat-tab-${ chat.id }` }
											data-active={
												isActive ? 'true' : 'false'
											}
											data-editing={
												isEditing ? 'true' : 'false'
											}
											data-running={
												isRunning ? 'true' : 'false'
											}
										>
											{ isRunning && (
												<span
													className="chat-tab-running-dot"
													data-testid={ `chat-tab-running-${ chat.id }` }
													aria-label="Running"
													title="Running"
												/>
											) }
											{ isEditing ? (
												<input
													ref={ editInputRef }
													type="text"
													className="chat-tab-input"
													data-testid={ `chat-tab-input-${ chat.id }` }
													value={ editingValue }
													onChange={ ( e ) =>
														setEditingValue(
															e.target.value
														)
													}
													onBlur={ commitEditingTab }
													onKeyDown={ ( e ) => {
														if (
															e.key === 'Enter'
														) {
															e.preventDefault();
															commitEditingTab();
														} else if (
															e.key === 'Escape'
														) {
															e.preventDefault();
															cancelEditingTab();
														}
													} }
												/>
											) : (
												<button
													type="button"
													className="chat-tab-select"
													role="tab"
													aria-selected={ isActive }
													onClick={ () =>
														onSelectChat( chat.id )
													}
													title={ label }
												>
													<span className="chat-tab-label">
														{ label }
													</span>
												</button>
											) }
											{ ! isEditing && ! isRunning && (
												<button
													type="button"
													className="chat-tab-edit"
													data-testid={ `chat-edit-${ chat.id }` }
													aria-label={ `Rename ${ label }` }
													title="Rename"
													onClick={ ( e ) => {
														e.stopPropagation();
														startEditingTab(
															chat.id
														);
													} }
												>
													<EditIcon size={ 12 } />
												</button>
											) }
											<button
												type="button"
												className="chat-tab-close"
												data-testid={ `chat-close-${ chat.id }` }
												aria-label={ `Close ${ label }` }
												onClick={ ( e ) => {
													e.stopPropagation();
													onCloseChat( chat.id );
												} }
											>
												<CloseIcon size={ 12 } />
											</button>
										</div>
									);
								} ) }
							</div>
							<div className="chat-add-wrap" ref={ addMenuRef }>
								<button
									type="button"
									className="chat-tab-new"
									data-testid="chat-add"
									aria-label="New chat"
									aria-haspopup="menu"
									aria-expanded={ addMenuOpen }
									title="New chat"
									onClick={ () =>
										setAddMenuOpen( ( v ) => ! v )
									}
									disabled={ ! activeProjectId }
								>
									<PlusIcon size={ 14 } />
								</button>
								{ addMenuOpen && (
									<div
										className="chat-add-menu"
										data-testid="chat-add-menu"
										role="menu"
									>
										<button
											type="button"
											className="chat-add-menu-item"
											data-testid="chat-add-menu-chat"
											role="menuitem"
											onClick={ () => {
												setAddMenuOpen( false );
												onNewChat();
											} }
										>
											Chat
										</button>
										{ CHAT_ACTIONS.map( ( action ) => (
											<button
												key={ action.id }
												type="button"
												className="chat-add-menu-item"
												data-testid={ `chat-add-menu-${ action.id }` }
												role="menuitem"
												onClick={ () => {
													setAddMenuOpen( false );
													onStartStarterChat(
														action.id
													);
												} }
											>
												{ action.menuLabel ??
													action.title }
											</button>
										) ) }
									</div>
								) }
							</div>
							<div
								className="chat-history-wrap"
								ref={ historyRef }
							>
								<button
									type="button"
									className="chat-history"
									data-testid="chat-history"
									aria-label="Chat history"
									aria-haspopup="listbox"
									aria-expanded={ historyOpen }
									title="Chat history"
									disabled={ ! activeProjectId }
									onClick={ () =>
										setHistoryOpen( ( v ) => ! v )
									}
								>
									<HistoryIcon size={ 14 } />
								</button>
								{ historyOpen && (
									<div
										className="chat-history-popover"
										data-testid="chat-history-popover"
									>
										<input
											ref={ historySearchRef }
											type="text"
											className="chat-history-search"
											data-testid="chat-history-search"
											placeholder="Search chats…"
											value={ historyQuery }
											onChange={ ( e ) =>
												setHistoryQuery(
													e.target.value
												)
											}
											onKeyDown={ ( e ) => {
												if (
													e.key === 'Enter' &&
													filteredHistoryChats.length >
														0
												) {
													const first =
														filteredHistoryChats[ 0 ];
													if (
														closedSet.has(
															first.id
														)
													) {
														onOpenChat( first.id );
													} else {
														onSelectChat(
															first.id
														);
													}
													setHistoryOpen( false );
												}
											} }
										/>
										<div
											className="chat-history-list"
											role="listbox"
										>
											{ filteredHistoryChats.length ===
											0 ? (
												<div className="chat-history-empty">
													{ historyChats.length === 0
														? 'No chats yet'
														: 'No matches' }
												</div>
											) : (
												filteredHistoryChats.map(
													( chat ) => {
														const label =
															chatLabels.get(
																chat.id
															);
														const isOpen =
															! closedSet.has(
																chat.id
															);
														const isActive =
															chat.id ===
															activeChatId;
														return (
															<div
																key={ chat.id }
																className="chat-history-item"
																data-active={
																	isActive
																		? 'true'
																		: 'false'
																}
															>
																<button
																	type="button"
																	className="chat-history-item-select"
																	role="option"
																	aria-selected={
																		isActive
																	}
																	data-testid={ `chat-history-item-${ chat.id }` }
																	onClick={ () => {
																		if (
																			isOpen
																		) {
																			onSelectChat(
																				chat.id
																			);
																		} else {
																			onOpenChat(
																				chat.id
																			);
																		}
																		setHistoryOpen(
																			false
																		);
																	} }
																>
																	<span className="chat-history-item-label">
																		{
																			label
																		}
																	</span>
																	{ ! isOpen && (
																		<span className="chat-history-item-hint">
																			closed
																		</span>
																	) }
																</button>
																<button
																	type="button"
																	className="chat-history-item-delete"
																	data-testid={ `chat-delete-${ chat.id }` }
																	aria-label={ `Delete ${ label }` }
																	title="Delete chat"
																	onClick={ (
																		e
																	) => {
																		e.stopPropagation();
																		onDeleteChat(
																			chat.id
																		);
																	} }
																>
																	<TrashIcon
																		size={
																			12
																		}
																	/>
																</button>
															</div>
														);
													}
												)
											) }
										</div>
									</div>
								) }
							</div>
						</div>
					) }

					<ChatTranscript
						messages={ messages }
						projectPath={ activeProjectPath }
						onPreviewAttachment={ onPreviewFile }
						onErrorAction={ onErrorAction }
						transcriptRef={ transcriptRef }
					/>

					{ isEmpty && (
						<div className="empty-state" data-testid="empty-state">
							<h2 className="empty-state-heading">
								What can I help you write?
							</h2>
							<div className="empty-state-prompts">
								{ CHAT_ACTIONS.map( ( action ) => (
									<button
										key={ action.id }
										type="button"
										className="empty-state-prompt"
										data-testid={ `empty-state-prompt-${ action.id }` }
										onClick={ () =>
											onStartStarterChat( action.id )
										}
										disabled={ actionsDisabled }
									>
										<span className="empty-state-prompt-title">
											{ action.title }
										</span>
										<span className="empty-state-prompt-sub">
											{ action.subtitle }
										</span>
									</button>
								) ) }
							</div>
						</div>
					) }

					{ permissions.length > 0 && (
						<PermissionPrompt
							request={ permissions[ 0 ] }
							onDecision={ onPermissionDecision }
						/>
					) }

					<ChatComposer
						value={ input }
						onChange={ onInputChange }
						onSend={ onSend }
						onCancel={
							activeChatId
								? () => onCancelChat( activeChatId )
								: undefined
						}
						busy={ busy }
						disabled={ inputDisabled }
						placeholder={
							activeProjectId
								? 'Message Studio Write… (Enter to send, Shift+Enter for newline)'
								: 'Link a project to start chatting'
						}
						attachments={ stagedAttachments }
						onPreviewAttachment={ onPreviewStagedAttachment }
						onRemoveAttachment={ onRemoveStagedAttachment }
						inputRef={ composerInputRef }
					/>
				</div>
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
	resourcesView,
	onResourcesViewChange,
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
	resourcesView: ResourcesViewState;
	onResourcesViewChange: ( patch: Partial< ResourcesViewState > ) => void;
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
		/>
	);
}
