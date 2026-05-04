import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { CHAT_ACTIONS, type ChatActionId } from '../../chat-actions';
import type { ChatMeta, DraftAttachment } from '../../types';

import { relativeDate } from '../lib/relativeDate';
import { DraftPreview } from '../components/DraftPreview';
import {
	PermissionPrompt,
	type PermissionRequest,
} from '../components/PermissionPrompt';
import { ResourcesGrid } from '../components/ResourcesGrid';
import { ToolBlock } from '../components/ToolBlock';
import { ToolGroup } from '../components/ToolGroup';
import {
	ArrowUpIcon,
	CloseIcon,
	EditIcon,
	HistoryIcon,
	PlusIcon,
	StopIcon,
	TrashIcon,
} from '../icons';

export type UserMessage = {
	kind: 'user';
	id: string;
	text: string;
	attachments?: DraftAttachment[];
};

export type AssistantMessage = {
	kind: 'assistant';
	id: string;
	text: string;
	streaming: boolean;
	errored?: boolean;
	cancelled?: boolean;
};

export type ToolMessage = {
	kind: 'tool';
	id: string;
	toolUseId: string;
	toolName: string;
	input: unknown;
	status: 'running' | 'done' | 'error';
	output?: string;
};

export type Message = UserMessage | AssistantMessage | ToolMessage;

type TranscriptItem =
	| UserMessage
	| AssistantMessage
	| { kind: 'tool-group'; tools: ToolMessage[] };

function groupMessages( messages: Message[] ): TranscriptItem[] {
	const items: TranscriptItem[] = [];
	for ( const m of messages ) {
		if ( m.kind === 'tool' ) {
			const last = items[ items.length - 1 ];
			if ( last && last.kind === 'tool-group' ) {
				last.tools.push( m );
			} else {
				items.push( { kind: 'tool-group', tools: [ m ] } );
			}
			continue;
		}
		items.push( m );
	}
	return items;
}

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
	resourcesOpen: boolean;
	activeChatId: string | null;
	runningChatIds: readonly string[];
	chats: ChatMeta[];
	closedChatIds: string[];
	messages: Message[];
	permissions: PermissionRequest[];
	input: string;
	busy: boolean;
	previewedDraft: { relPath: string; name: string } | null;
	stagedAttachments: DraftAttachment[];
	onRemoveStagedAttachment: (
		folder: 'sources' | 'drafts' | 'published',
		relPath: string
	) => void;
	onPreviewStagedAttachment: (
		folder: 'sources' | 'drafts' | 'published',
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
	onPreviewDraft: ( relPath: string, name: string ) => void;
	onAddToChat: (
		folder: 'sources' | 'drafts' | 'published',
		relPath: string,
		name: string
	) => void;
	onOpenNewChat: (
		folder: 'sources' | 'drafts' | 'published',
		relPath: string,
		name: string
	) => void;
	onEditDraft: ( relPath: string, name: string ) => void;
	onDraftDeleted: ( relPath: string, name: string ) => void;
	onClosePreview: () => void;
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
	runningChatIds,
	chats,
	closedChatIds,
	messages,
	permissions,
	input,
	busy,
	previewedDraft,
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
	onPreviewDraft,
	onAddToChat,
	onOpenNewChat,
	onEditDraft,
	onDraftDeleted,
	onClosePreview,
	onPermissionDecision,
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

	useEffect( () => {
		if ( editingChatId ) {
			editInputRef.current?.focus();
			editInputRef.current?.select();
		}
	}, [ editingChatId ] );

	// Resync the composer height whenever the input value changes — the
	// textarea grows with content, capped by CSS max-height (50vh).
	useLayoutEffect( () => {
		const el = composerInputRef.current;
		if ( ! el ) {
			return;
		}
		el.style.height = 'auto';
		el.style.height = `${ el.scrollHeight }px`;
	}, [ input ] );

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
	const composerDisabled = inputDisabled || input.trim().length === 0;
	const isEmpty = !! activeProjectId && messages.length === 0;

	return (
		<section
			className="project-screen"
			data-testid="screen-project"
			aria-label="Project"
		>
			<div className="project-canvas" data-testid="project-canvas">
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

					<main
						className="transcript"
						data-testid="transcript"
						ref={ transcriptRef }
					>
						{ groupMessages( messages ).map( ( item ) => {
							if ( item.kind === 'user' ) {
								const atts = item.attachments ?? [];
								return (
									<div
										key={ item.id }
										className="bubble bubble-user"
										data-testid="bubble-user"
									>
										<div className="bubble-text">
											{ item.text }
										</div>
										{ atts.map( ( a ) => (
											<UserAttachmentCard
												key={ `${ a.folder }:${ a.relPath }` }
												attachment={ a }
												onPreview={ () =>
													onPreviewDraft(
														a.relPath,
														a.name
													)
												}
											/>
										) ) }
									</div>
								);
							}
							if ( item.kind === 'assistant' ) {
								const isWorking =
									item.streaming && item.text.length === 0;
								const isCancelled =
									! item.streaming && !! item.cancelled;
								// Drop bubbles that finished with no text and
								// weren't cancelled (e.g. tool-only turns):
								// they used to render as silent empty bubbles.
								if (
									! item.streaming &&
									! isCancelled &&
									item.text.length === 0
								) {
									return null;
								}
								return (
									<div
										key={ item.id }
										className={ `bubble bubble-assistant${
											item.errored ? ' bubble-error' : ''
										}${
											isCancelled
												? ' bubble-cancelled'
												: ''
										}` }
										data-testid="bubble-assistant"
										data-streaming={
											item.streaming ? 'true' : 'false'
										}
										data-cancelled={
											isCancelled ? 'true' : 'false'
										}
									>
										{ isWorking ? (
											<div
												className="bubble-thinking"
												data-testid="bubble-thinking"
												aria-label="Assistant is working"
											>
												<span />
												<span />
												<span />
											</div>
										) : (
											<>
												{ item.text.length > 0 && (
													<div className="bubble-text bubble-markdown">
														<ReactMarkdown
															remarkPlugins={ [
																remarkGfm,
															] }
														>
															{ item.text }
														</ReactMarkdown>
													</div>
												) }
												{ isCancelled && (
													<div
														className="bubble-stopped"
														data-testid="bubble-stopped"
													>
														Stopped
													</div>
												) }
											</>
										) }
									</div>
								);
							}
							if ( item.tools.length === 1 ) {
								const t = item.tools[ 0 ];
								return (
									<ToolBlock
										key={ t.id }
										toolName={ t.toolName }
										input={ t.input }
										status={ t.status }
										output={ t.output }
									/>
								);
							}
							return (
								<ToolGroup
									key={ item.tools[ 0 ].id }
									tools={ item.tools }
								/>
							);
						} ) }
					</main>

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

					<div className="composer" data-testid="composer">
						<div
							className="composer-field"
							data-has-attachment={
								stagedAttachments.length > 0 ? 'true' : 'false'
							}
						>
							{ stagedAttachments.length > 0 && (
								<div
									className="composer-attachments"
									data-testid="composer-attachments"
								>
									{ stagedAttachments.map( ( a ) => (
										<ComposerAttachmentChip
											key={ `${ a.folder }:${ a.relPath }` }
											attachment={ a }
											onPreview={ () =>
												onPreviewStagedAttachment(
													a.folder,
													a.relPath
												)
											}
											onRemove={ () =>
												onRemoveStagedAttachment(
													a.folder,
													a.relPath
												)
											}
										/>
									) ) }
								</div>
							) }
							<textarea
								ref={ composerInputRef }
								className="composer-input"
								data-testid="chat-input"
								placeholder={
									activeProjectId
										? 'Message Studio Write… (Enter to send, Shift+Enter for newline)'
										: 'Link a project to start chatting'
								}
								rows={ 1 }
								value={ input }
								onChange={ ( e ) =>
									onInputChange( e.target.value )
								}
								onKeyDown={ ( e ) => {
									if (
										e.key === 'Enter' &&
										! e.shiftKey &&
										! e.nativeEvent.isComposing
									) {
										e.preventDefault();
										if ( ! composerDisabled ) {
											onSend();
										}
									}
								} }
								disabled={ inputDisabled }
							/>
							{ busy ? (
								<button
									type="button"
									className="composer-send composer-send-stop"
									data-testid="send-button"
									onClick={ () => {
										if ( activeChatId ) {
											onCancelChat( activeChatId );
										}
									} }
									disabled={ ! activeChatId }
									aria-label="Stop"
								>
									<StopIcon size={ 10 } />
								</button>
							) : (
								<button
									type="button"
									className="composer-send"
									data-testid="send-button"
									onClick={ onSend }
									disabled={ composerDisabled }
									aria-label="Send message"
								>
									<ArrowUpIcon size={ 16 } />
								</button>
							) }
						</div>
					</div>
				</div>

				<aside
					className="resources-area"
					data-testid="resources-area"
					data-open={ resourcesOpen ? 'true' : 'false' }
					aria-label="Resources"
					aria-hidden={ ! resourcesOpen }
				>
					<div className="resources-area-inner">
						<div
							className="resources-area-list"
							data-testid="resources-list"
						>
							{ renderResourcesContent( {
								activeProjectId,
								previewedDraft,
								addToChatDisabled: activeChatId === null,
								onPreviewDraft,
								onAddToChat,
								onOpenNewChat,
								onEditDraft,
								onDraftDeleted,
								onClosePreview,
							} ) }
						</div>
					</div>
				</aside>
			</div>
		</section>
	);
}

function renderResourcesContent( {
	activeProjectId,
	previewedDraft,
	addToChatDisabled,
	onPreviewDraft,
	onAddToChat,
	onOpenNewChat,
	onEditDraft,
	onDraftDeleted,
	onClosePreview,
}: {
	activeProjectId: string | null;
	previewedDraft: { relPath: string; name: string } | null;
	addToChatDisabled: boolean;
	onPreviewDraft: ( relPath: string, name: string ) => void;
	onAddToChat: (
		folder: 'sources' | 'drafts' | 'published',
		relPath: string,
		name: string
	) => void;
	onOpenNewChat: (
		folder: 'sources' | 'drafts' | 'published',
		relPath: string,
		name: string
	) => void;
	onEditDraft: ( relPath: string, name: string ) => void;
	onDraftDeleted: ( relPath: string, name: string ) => void;
	onClosePreview: () => void;
} ): React.ReactElement {
	if ( ! activeProjectId ) {
		return (
			<div className="resources-area-empty" data-testid="resources-empty">
				Link a project to browse files
			</div>
		);
	}
	if ( previewedDraft ) {
		return (
			<DraftPreview
				key={ `${ activeProjectId }:${ previewedDraft.relPath }` }
				projectId={ activeProjectId }
				relPath={ previewedDraft.relPath }
				name={ previewedDraft.name }
				addToChatDisabled={ addToChatDisabled }
				onBack={ onClosePreview }
				onAddToChat={ () =>
					onAddToChat(
						'drafts',
						previewedDraft.relPath,
						previewedDraft.name
					)
				}
				onOpenNewChat={ () =>
					onOpenNewChat(
						'drafts',
						previewedDraft.relPath,
						previewedDraft.name
					)
				}
				onEditDraft={ () =>
					onEditDraft( previewedDraft.relPath, previewedDraft.name )
				}
				onDraftDeleted={ () =>
					onDraftDeleted(
						previewedDraft.relPath,
						previewedDraft.name
					)
				}
			/>
		);
	}
	return (
		<ResourcesGrid
			key={ activeProjectId }
			projectId={ activeProjectId }
			onPreviewDraft={ onPreviewDraft }
			onAddToChat={ onAddToChat }
			onOpenNewChat={ onOpenNewChat }
			addToChatDisabled={ addToChatDisabled }
			onEditDraft={ onEditDraft }
			onDraftDeleted={ onDraftDeleted }
		/>
	);
}

function ComposerAttachmentChip( {
	attachment,
	onPreview,
	onRemove,
}: {
	attachment: DraftAttachment;
	onPreview: () => void;
	onRemove: () => void;
} ): React.ReactElement {
	return (
		<div
			className="composer-attachment-chip"
			data-testid="composer-attachment-chip"
		>
			<button
				type="button"
				className="composer-attachment-chip-body"
				onClick={ onPreview }
				title={ `Preview ${ attachment.name }` }
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 20 20"
					aria-hidden="true"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M6 3h6l4 4v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
					<path d="M12 3v4h4" />
				</svg>
				<span className="composer-attachment-chip-name">
					{ attachment.name }
				</span>
			</button>
			<button
				type="button"
				className="composer-attachment-chip-remove"
				data-testid="composer-attachment-remove"
				aria-label={ `Remove ${ attachment.name }` }
				title="Remove"
				onClick={ onRemove }
			>
				<CloseIcon size={ 10 } />
			</button>
		</div>
	);
}

function fileExtensionLabel( name: string ): string {
	const dot = name.lastIndexOf( '.' );
	if ( dot <= 0 || dot === name.length - 1 ) {
		return 'File';
	}
	return name.slice( dot + 1 ).toUpperCase();
}

function UserAttachmentCard( {
	attachment,
	onPreview,
}: {
	attachment: DraftAttachment;
	onPreview: () => void;
} ): React.ReactElement {
	const ext = fileExtensionLabel( attachment.name );
	const date =
		attachment.mtime !== null ? relativeDate( attachment.mtime ) : null;
	return (
		<button
			type="button"
			className="bubble-attachment"
			data-testid="bubble-attachment"
			onClick={ onPreview }
			title={ `Preview ${ attachment.name }` }
		>
			<span className="bubble-attachment-name">{ attachment.name }</span>
			<span className="bubble-attachment-meta">
				<span className="bubble-attachment-kind">
					Document · { ext }
				</span>
				{ date && (
					<span className="bubble-attachment-date">{ date }</span>
				) }
			</span>
		</button>
	);
}
