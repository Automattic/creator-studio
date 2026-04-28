import React, { useEffect, useRef, useState } from 'react';

import type { ChatMeta } from '../../types';

import {
	PermissionPrompt,
	type PermissionRequest,
} from '../components/PermissionPrompt';
import { ResourcesTree } from '../components/ResourcesTree';
import { ToolBlock } from '../components/ToolBlock';
import {
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
};

export type AssistantMessage = {
	kind: 'assistant';
	id: string;
	text: string;
	streaming: boolean;
	errored?: boolean;
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

function computeChatLabels( chats: ChatMeta[] ): Map< string, string > {
	const labels = new Map< string, string >();
	const untitledByKind = new Map< ChatMeta[ 'kind' ], number >();
	for ( const c of chats ) {
		if ( c.title ) {
			continue;
		}
		untitledByKind.set( c.kind, ( untitledByKind.get( c.kind ) ?? 0 ) + 1 );
	}
	const seenByKind = new Map< ChatMeta[ 'kind' ], number >();
	for ( const c of chats ) {
		if ( c.title ) {
			labels.set( c.id, c.title );
			continue;
		}
		const kindBase: Record< ChatMeta[ 'kind' ], string > = {
			general: 'Untitled',
			ideas: 'Ideas',
			draft: 'Draft',
		};
		const base = kindBase[ c.kind ];
		const total = untitledByKind.get( c.kind ) ?? 1;
		if ( total === 1 ) {
			labels.set( c.id, base );
		} else {
			const idx = ( seenByKind.get( c.kind ) ?? 0 ) + 1;
			seenByKind.set( c.kind, idx );
			labels.set( c.id, `${ base } ${ idx }` );
		}
	}
	return labels;
}

type Props = {
	activeProjectId: string | null;
	activeProjectName: string | null;
	activeChatId: string | null;
	runningChatId: string | null;
	chats: ChatMeta[];
	closedChatIds: string[];
	messages: Message[];
	permissions: PermissionRequest[];
	input: string;
	busy: boolean;
	onInputChange: ( value: string ) => void;
	onSelectChat: ( chatId: string ) => void;
	onCloseChat: ( chatId: string ) => void;
	onCancelChat: ( chatId: string ) => void;
	onOpenChat: ( chatId: string ) => void;
	onDeleteChat: ( chatId: string ) => void;
	onRenameChat: ( chatId: string, title: string ) => void;
	onNewChat: () => void;
	onStartStarterChat: ( kind: 'ideas' | 'draft' ) => void;
	onSend: () => void;
	onPermissionDecision: (
		requestId: string,
		decision: 'allow' | 'deny',
		remember: boolean
	) => void;
};

export function ProjectScreen( {
	activeProjectId,
	activeProjectName,
	activeChatId,
	runningChatId,
	chats,
	closedChatIds,
	messages,
	permissions,
	input,
	busy,
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

	useEffect( () => {
		if ( editingChatId ) {
			editInputRef.current?.focus();
			editInputRef.current?.select();
		}
	}, [ editingChatId ] );

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
	const inputDisabled =
		busy || permissions.length > 0 || ! activeProjectId || ! activeChatId;
	const composerDisabled = inputDisabled || input.trim().length === 0;

	return (
		<section
			className="project-screen"
			data-testid="screen-project"
			aria-label="Project"
		>
			<header
				className="project-screen-header"
				data-testid="transcript-actions"
			>
				<h1 className="project-screen-title">
					{ activeProjectName ?? 'Project' }
				</h1>
				<div className="project-screen-actions">
					<button
						type="button"
						className="project-screen-action-btn"
						data-testid="chat-draft"
						onClick={ () => onStartStarterChat( 'draft' ) }
						disabled
					>
						New draft
					</button>
				</div>
			</header>

			<div className="project-canvas" data-testid="project-canvas">
				<div className="chat-area" data-testid="chat-area">
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
								const isRunning = chat.id === runningChatId;
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
													if ( e.key === 'Enter' ) {
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
												onDoubleClick={ () =>
													startEditingTab( chat.id )
												}
												title={ `${ label } — double-click to rename` }
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
													startEditingTab( chat.id );
												} }
											>
												<EditIcon size={ 12 } />
											</button>
										) }
										{ isRunning ? (
											<button
												type="button"
												className="chat-tab-stop"
												data-testid={ `chat-stop-${ chat.id }` }
												aria-label={ `Stop ${ label }` }
												title="Stop"
												onClick={ ( e ) => {
													e.stopPropagation();
													onCancelChat( chat.id );
												} }
											>
												<StopIcon size={ 10 } />
											</button>
										) : (
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
										) }
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
								onClick={ () => setAddMenuOpen( ( v ) => ! v ) }
								disabled={ actionsDisabled }
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
									<button
										type="button"
										className="chat-add-menu-item"
										data-testid="chat-add-menu-ideas"
										role="menuitem"
										onClick={ () => {
											setAddMenuOpen( false );
											onStartStarterChat( 'ideas' );
										} }
									>
										Brainstorm ideas
									</button>
									<button
										type="button"
										className="chat-add-menu-item"
										data-testid="chat-add-menu-draft"
										role="menuitem"
										onClick={ () => {
											setAddMenuOpen( false );
											onStartStarterChat( 'draft' );
										} }
									>
										Discuss new draft
									</button>
								</div>
							) }
						</div>
						<div className="chat-history-wrap" ref={ historyRef }>
							<button
								type="button"
								className="chat-history"
								data-testid="chat-history"
								aria-label="Chat history"
								aria-haspopup="listbox"
								aria-expanded={ historyOpen }
								title="Chat history"
								disabled={ ! activeProjectId }
								onClick={ () => setHistoryOpen( ( v ) => ! v ) }
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
											setHistoryQuery( e.target.value )
										}
										onKeyDown={ ( e ) => {
											if (
												e.key === 'Enter' &&
												filteredHistoryChats.length > 0
											) {
												const first =
													filteredHistoryChats[ 0 ];
												if (
													closedSet.has( first.id )
												) {
													onOpenChat( first.id );
												} else {
													onSelectChat( first.id );
												}
												setHistoryOpen( false );
											}
										} }
									/>
									<div
										className="chat-history-list"
										role="listbox"
									>
										{ filteredHistoryChats.length === 0 ? (
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
																	{ label }
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
																	size={ 12 }
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

					<main className="transcript" data-testid="transcript">
						{ messages.map( ( m ) => {
							if ( m.kind === 'user' ) {
								return (
									<div
										key={ m.id }
										className="bubble bubble-user"
										data-testid="bubble-user"
									>
										<div className="bubble-text">
											{ m.text }
										</div>
									</div>
								);
							}
							if ( m.kind === 'assistant' ) {
								return (
									<div
										key={ m.id }
										className={ `bubble bubble-assistant${
											m.errored ? ' bubble-error' : ''
										}` }
										data-testid="bubble-assistant"
										data-streaming={
											m.streaming ? 'true' : 'false'
										}
									>
										<div className="bubble-text">
											{ m.text }
										</div>
									</div>
								);
							}
							return (
								<ToolBlock
									key={ m.id }
									toolName={ m.toolName }
									input={ m.input }
									status={ m.status }
									output={ m.output }
								/>
							);
						} ) }
					</main>

					{ permissions.length > 0 && (
						<PermissionPrompt
							request={ permissions[ 0 ] }
							onDecision={ onPermissionDecision }
						/>
					) }

					<div className="composer" data-testid="composer">
						<textarea
							className="composer-input"
							data-testid="chat-input"
							placeholder={
								activeProjectId
									? 'Message Studio Write… (Enter to send, Shift+Enter for newline)'
									: 'Link a project to start chatting'
							}
							rows={ 3 }
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
						<button
							type="button"
							className="composer-send"
							data-testid="send-button"
							onClick={ onSend }
							disabled={ composerDisabled }
						>
							{ busy ? 'Sending…' : 'Send' }
						</button>
					</div>
				</div>

				<aside
					className="resources-area"
					data-testid="resources-area"
					aria-label="Resources"
				>
					<header className="resources-area-header">
						<h2 className="resources-area-title">Resources</h2>
					</header>
					<div
						className="resources-area-list"
						data-testid="resources-list"
					>
						{ activeProjectId ? (
							<ResourcesTree
								key={ activeProjectId }
								projectId={ activeProjectId }
							/>
						) : (
							<div
								className="resources-area-empty"
								data-testid="resources-empty"
							>
								Link a project to browse files
							</div>
						) }
					</div>
				</aside>
			</div>
		</section>
	);
}
