import React, { useCallback, useEffect, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

import type {
	AuthMode,
	ClaudeAuthStatus,
	WordpressConnectionPublic,
} from '../../types';

import {
	ChevronIcon,
	PlusIcon,
	RefreshIcon,
	SignOutIcon,
	TrashIcon,
	WordpressIcon,
} from '../icons';

import {
	groupWordpressConnections,
	type WordpressAccountGroup,
} from '../lib/wordpressGroups';

import { WordpressConnectDialog } from './WordpressConnectDialog';
import {
	WordpressDisconnectDialog,
	type WordpressDisconnectPending,
} from './WordpressDisconnectDialog';

const KEYS_PAGE_URL = 'https://console.anthropic.com/settings/keys';

type ClaudeStatusState =
	| { kind: 'checking' }
	| { kind: 'signed-in'; status: ClaudeAuthStatus }
	| { kind: 'signed-out' };

function describePlan( status: ClaudeAuthStatus ): string {
	// authMethod === 'console' means the underlying credential is an API key
	// surfaced through OAuth-style login, not a Claude.ai subscription —
	// show different copy so users on Console accounts aren't confused.
	if ( status.authMethod === 'console' ) {
		return 'Console account';
	}
	if ( status.subscriptionType ) {
		const cap =
			status.subscriptionType.charAt( 0 ).toUpperCase() +
			status.subscriptionType.slice( 1 );
		return `${ cap } plan`;
	}
	return 'Claude.ai account';
}

type Props = {
	open: boolean;
	onClose: () => void;
	onSaved?: () => void;
};

export function SettingsModal( {
	open,
	onClose,
	onSaved,
}: Props ): React.ReactElement {
	const [ authMode, setAuthMode ] = useState< AuthMode >( 'api-key' );
	const [ apiKey, setApiKey ] = useState( '' );
	const [ visible, setVisible ] = useState( false );
	const [ keyAlreadySet, setKeyAlreadySet ] = useState< boolean | null >(
		null
	);
	const [ submitting, setSubmitting ] = useState( false );
	const [ claudeStatus, setClaudeStatus ] = useState< ClaudeStatusState >( {
		kind: 'checking',
	} );
	const [ wpConnections, setWpConnections ] = useState<
		WordpressConnectionPublic[]
	>( [] );
	const [ wpConnectOpen, setWpConnectOpen ] = useState( false );

	const refreshWpConnections = useCallback( async (): Promise< void > => {
		const list = await window.api.wordpress.list();
		setWpConnections( list );
	}, [] );

	const refreshClaudeStatus = useCallback( async (): Promise< void > => {
		setClaudeStatus( { kind: 'checking' } );
		const status = await window.api.auth.refresh();
		setClaudeStatus(
			status.signedIn
				? { kind: 'signed-in', status }
				: { kind: 'signed-out' }
		);
	}, [] );

	useEffect( () => {
		if ( ! open ) {
			setApiKey( '' );
			setVisible( false );
			setSubmitting( false );
			setKeyAlreadySet( null );
			setClaudeStatus( { kind: 'checking' } );
			return;
		}
		let cancelled = false;
		void window.api.settings.get().then( ( settings ) => {
			if ( cancelled ) {
				return;
			}
			setKeyAlreadySet( settings.anthropicApiKey !== '' );
			setAuthMode( settings.authMode );
		} );
		void refreshClaudeStatus();
		void refreshWpConnections();
		return () => {
			cancelled = true;
		};
	}, [ open, refreshClaudeStatus, refreshWpConnections ] );

	// Re-probe whenever the user toggles back to Claude-Code mode — they may
	// have signed in/out via a terminal while the modal was open in API-key
	// mode.
	useEffect( () => {
		if ( open && authMode === 'claude-code' ) {
			void refreshClaudeStatus();
		}
	}, [ open, authMode, refreshClaudeStatus ] );

	const trimmed = apiKey.trim();
	// API-key mode requires the user to type a key — keyAlreadySet alone
	// doesn't unlock Save because we want "open and immediately Save" to be
	// a no-op rather than a way to accidentally re-save an empty patch.
	// Claude-Code mode needs an actual signed-in session before saving so
	// the modal closes into a working state; the in-flight 'checking'
	// state is treated as optimistic.
	const canSubmit =
		! submitting &&
		( authMode === 'claude-code'
			? claudeStatus.kind !== 'signed-out'
			: trimmed.length > 0 );

	let statusAttr: 'true' | 'false' | undefined;
	if ( keyAlreadySet === true ) {
		statusAttr = 'true';
	} else if ( keyAlreadySet === false ) {
		statusAttr = 'false';
	}

	const onSave = async (): Promise< void > => {
		if ( ! canSubmit ) {
			return;
		}
		setSubmitting( true );
		try {
			await window.api.settings.set( {
				authMode,
				...( trimmed.length > 0 ? { anthropicApiKey: trimmed } : {} ),
			} );
			onSaved?.();
			onClose();
		} finally {
			setSubmitting( false );
		}
	};

	return (
		<>
			<Dialog.Root
				open={ open }
				onOpenChange={ ( isOpen ) => {
					if ( ! isOpen ) {
						onClose();
					}
				} }
			>
				<Dialog.Portal>
					<Dialog.Backdrop className="dialog-backdrop" />
					<Dialog.Popup
						className="dialog-panel"
						data-testid="settings-modal"
						data-key-set={ statusAttr }
						data-auth-mode={ authMode }
					>
						<Dialog.Title className="dialog-title">
							Settings
						</Dialog.Title>

						<section
							className="settings-section"
							aria-labelledby="settings-section-claude-title"
						>
							<div className="settings-section-header">
								<h3
									className="settings-section-title"
									id="settings-section-claude-title"
								>
									Claude account
								</h3>
							</div>
							<div
								className="dialog-segmented"
								role="tablist"
								aria-label="Authentication method"
							>
								<button
									type="button"
									role="tab"
									className="dialog-segmented-option"
									data-testid="settings-auth-mode-claude-code"
									data-active={
										authMode === 'claude-code'
											? 'true'
											: undefined
									}
									aria-selected={ authMode === 'claude-code' }
									onClick={ () =>
										setAuthMode( 'claude-code' )
									}
									disabled={ submitting }
								>
									Sign in with Claude
								</button>
								<button
									type="button"
									role="tab"
									className="dialog-segmented-option"
									data-testid="settings-auth-mode-api-key"
									data-active={
										authMode === 'api-key'
											? 'true'
											: undefined
									}
									aria-selected={ authMode === 'api-key' }
									onClick={ () => setAuthMode( 'api-key' ) }
									disabled={ submitting }
								>
									Use API key
								</button>
							</div>

							{ authMode === 'claude-code' ? (
								<ClaudeCodeSection
									disabled={ submitting }
									state={ claudeStatus }
									onRefresh={ () => {
										void refreshClaudeStatus();
									} }
									onSignIn={ async () => {
										await window.api.auth.startLogin();
									} }
									onSignOut={ async () => {
										const next =
											await window.api.auth.logout();
										setClaudeStatus(
											next.signedIn
												? {
														kind: 'signed-in',
														status: next,
												  }
												: { kind: 'signed-out' }
										);
									} }
								/>
							) : (
								<ApiKeySection
									apiKey={ apiKey }
									onApiKeyChange={ setApiKey }
									visible={ visible }
									onToggleVisible={ () =>
										setVisible( ( v ) => ! v )
									}
									submitting={ submitting }
									trimmedLength={ trimmed.length }
								/>
							) }
						</section>

						<WordpressSection
							connections={ wpConnections }
							onChanged={ refreshWpConnections }
							onAddClick={ () => setWpConnectOpen( true ) }
						/>

						<div className="dialog-footer">
							<button
								type="button"
								className="dialog-button-secondary"
								data-testid="settings-cancel"
								onClick={ onClose }
								disabled={ submitting }
							>
								Cancel
							</button>
							<button
								type="button"
								className="dialog-button-primary"
								data-testid="settings-save"
								onClick={ () => {
									void onSave();
								} }
								disabled={ ! canSubmit }
							>
								{ submitting ? 'Saving…' : 'Save' }
							</button>
						</div>
					</Dialog.Popup>
				</Dialog.Portal>
			</Dialog.Root>
			<WordpressConnectDialog
				open={ wpConnectOpen }
				onClose={ () => setWpConnectOpen( false ) }
				onConnected={ () => {
					void refreshWpConnections();
				} }
			/>
		</>
	);
}

function ClaudeCodeSection( {
	disabled,
	state,
	onRefresh,
	onSignIn,
	onSignOut,
}: {
	disabled: boolean;
	state: ClaudeStatusState;
	onRefresh: () => void;
	onSignIn: () => Promise< void >;
	onSignOut: () => Promise< void >;
} ): React.ReactElement {
	const [ busy, setBusy ] = useState< 'signin' | 'signout' | null >( null );

	const runSignIn = async (): Promise< void > => {
		if ( disabled || busy ) {
			return;
		}
		setBusy( 'signin' );
		try {
			await onSignIn();
		} finally {
			setBusy( null );
		}
	};
	const runSignOut = async (): Promise< void > => {
		if ( disabled || busy ) {
			return;
		}
		setBusy( 'signout' );
		try {
			await onSignOut();
		} finally {
			setBusy( null );
		}
	};

	let stateAttr: 'checking' | 'signed-in' | 'signed-out';
	let statusText: React.ReactNode;
	if ( state.kind === 'checking' ) {
		stateAttr = 'checking';
		statusText = 'Checking Claude Code session…';
	} else if ( state.kind === 'signed-in' ) {
		stateAttr = 'signed-in';
		const email = state.status.email ?? 'your Claude account';
		statusText = (
			<>
				<strong data-testid="settings-claude-email">{ email }</strong>
				{ ' · ' }
				<span data-testid="settings-claude-plan">
					{ describePlan( state.status ) }
				</span>
			</>
		);
	} else {
		stateAttr = 'signed-out';
		statusText = 'Not signed in to Claude Code.';
	}

	return (
		<div className="dialog-field settings-claude-section">
			<div
				className="settings-claude-status"
				data-testid="settings-claude-status"
				data-state={ stateAttr }
			>
				<div className="settings-claude-status-text">
					{ statusText }
				</div>
				{ state.kind === 'signed-in' && (
					<div className="settings-claude-row-actions">
						<button
							type="button"
							className="settings-claude-row-action"
							data-testid="settings-claude-refresh"
							aria-label="Refresh"
							title="Refresh"
							onClick={ onRefresh }
							disabled={ disabled || busy !== null }
						>
							<RefreshIcon size={ 14 } />
						</button>
						<button
							type="button"
							className="settings-claude-row-action"
							data-testid="settings-claude-signout"
							aria-label={
								busy === 'signout' ? 'Signing out…' : 'Sign out'
							}
							title={
								busy === 'signout' ? 'Signing out…' : 'Sign out'
							}
							onClick={ () => {
								void runSignOut();
							} }
							disabled={ disabled || busy !== null }
						>
							<SignOutIcon size={ 14 } />
						</button>
					</div>
				) }
			</div>
			{ state.kind !== 'signed-in' && (
				<div className="settings-claude-actions">
					<button
						type="button"
						className="dialog-button-secondary"
						data-testid="settings-claude-signin"
						onClick={ () => {
							void runSignIn();
						} }
						disabled={ disabled || busy !== null }
					>
						{ busy === 'signin'
							? 'Opening terminal…'
							: 'Sign in with Claude' }
					</button>
					<button
						type="button"
						className="dialog-button-secondary"
						data-testid="settings-claude-refresh"
						onClick={ onRefresh }
						disabled={ disabled || busy !== null }
					>
						Refresh
					</button>
				</div>
			) }
			<div className="dialog-help">
				{ state.kind === 'signed-out' ? (
					<>
						Sign in opens a terminal running{ ' ' }
						<code>claude auth login</code>. After completing the
						browser flow, click <strong>Refresh</strong>. Your OAuth
						tokens are managed by the bundled Claude binary — Studio
						Write never reads or stores them.
					</>
				) : (
					<>
						Studio Write delegates auth to the bundled Claude binary
						— we never read or store your OAuth tokens.
					</>
				) }
			</div>
		</div>
	);
}

function WordpressConnectionRow( {
	connection,
	onDisconnect,
	disabled,
}: {
	connection: WordpressConnectionPublic;
	onDisconnect: ( connection: WordpressConnectionPublic ) => void;
	disabled: boolean;
} ): React.ReactElement {
	return (
		<li
			className="settings-wordpress-row"
			data-testid={ `settings-wordpress-connection-${ connection.id }` }
		>
			<WordpressIcon size={ 18 } />
			<div className="settings-wordpress-row-text">
				<span className="settings-wordpress-row-label">
					{ connection.label }
				</span>
				<span className="settings-wordpress-row-url">
					{ connection.siteUrl }
				</span>
			</div>
			<span className="settings-wordpress-row-kind">
				{ connection.kind === 'wpcom-oauth'
					? 'WordPress.com'
					: 'App password' }
			</span>
			<button
				type="button"
				className="settings-wordpress-disconnect"
				data-testid={ `settings-wordpress-disconnect-${ connection.id }` }
				aria-label={ `Disconnect ${ connection.label }` }
				title="Disconnect"
				onClick={ () => onDisconnect( connection ) }
				disabled={ disabled }
			>
				<TrashIcon size={ 14 } />
			</button>
		</li>
	);
}

// Auto-collapse account groups bigger than this so an account with a
// dozen sites doesn't blow up the settings panel. Smaller groups stay
// open so the common one-or-two-site case isn't an extra click.
const ACCOUNT_AUTO_COLLAPSE_THRESHOLD = 3;

function WordpressSection( {
	connections,
	onChanged,
	onAddClick,
}: {
	connections: WordpressConnectionPublic[];
	onChanged: () => Promise< void > | void;
	onAddClick: () => void;
} ): React.ReactElement {
	const [ removingId, setRemovingId ] = useState< string | null >( null );
	const [ removingAccountId, setRemovingAccountId ] = useState<
		number | null
	>( null );
	const [ pendingDisconnect, setPendingDisconnect ] =
		useState< WordpressDisconnectPending | null >( null );
	const [ collapsed, setCollapsed ] = useState< Record< number, boolean > >(
		{}
	);

	const { accounts, flat } = groupWordpressConnections( connections );

	const isExpanded = ( group: WordpressAccountGroup ): boolean => {
		const override = collapsed[ group.accountId ];
		if ( typeof override === 'boolean' ) {
			return ! override;
		}
		return group.connections.length <= ACCOUNT_AUTO_COLLAPSE_THRESHOLD;
	};

	// `collapsed[id]` stores the user's explicit collapse override:
	// true = explicitly collapsed, false = explicitly expanded. The
	// second arg here is the *new collapsed state* (i.e. invert the
	// current `expanded` value before calling).
	const setAccountCollapsed = (
		accountId: number,
		nextCollapsed: boolean
	): void => {
		setCollapsed( ( prev ) => ( {
			...prev,
			[ accountId ]: nextCollapsed,
		} ) );
	};

	const requestDisconnect = (
		connection: WordpressConnectionPublic
	): void => {
		setPendingDisconnect( {
			kind: 'site',
			id: connection.id,
			label: connection.label,
		} );
	};

	const requestDisconnectAccount = ( group: WordpressAccountGroup ): void => {
		setPendingDisconnect( {
			kind: 'account',
			accountId: group.accountId,
			username: group.username,
			siteCount: group.connections.length,
		} );
	};

	const isWorking = removingId !== null || removingAccountId !== null;

	const confirmDisconnect = async (): Promise< void > => {
		if ( ! pendingDisconnect ) {
			return;
		}
		if ( pendingDisconnect.kind === 'site' ) {
			const id = pendingDisconnect.id;
			setRemovingId( id );
			try {
				await window.api.wordpress.disconnect( id );
				await onChanged();
				setPendingDisconnect( null );
			} finally {
				setRemovingId( null );
			}
			return;
		}
		const accountId = pendingDisconnect.accountId;
		setRemovingAccountId( accountId );
		try {
			await window.api.wordpress.disconnectAccount( { accountId } );
			await onChanged();
			setPendingDisconnect( null );
		} finally {
			setRemovingAccountId( null );
		}
	};

	const cancelDisconnect = (): void => {
		if ( isWorking ) {
			return;
		}
		setPendingDisconnect( null );
	};

	return (
		<section
			className="settings-section settings-wordpress-section"
			data-testid="settings-wordpress-section"
			aria-labelledby="settings-section-wordpress-title"
		>
			<div className="settings-section-header">
				<h3
					className="settings-section-title"
					id="settings-section-wordpress-title"
				>
					WordPress sites
				</h3>
				<button
					type="button"
					className="dialog-button-secondary settings-wordpress-add"
					data-testid="settings-wordpress-add"
					onClick={ onAddClick }
				>
					<PlusIcon size={ 14 } />
					<span>Add site</span>
				</button>
			</div>
			{ connections.length === 0 ? (
				<p
					className="dialog-help settings-wordpress-empty"
					data-testid="settings-wordpress-empty"
				>
					Connect a WordPress site to publish drafts and import
					existing posts.
				</p>
			) : (
				<ul
					className="settings-wordpress-list"
					data-testid="settings-wordpress-list"
				>
					{ accounts.map( ( group ) => {
						const expanded = isExpanded( group );
						const count = group.connections.length;
						return (
							<li
								key={ `account-${ group.accountId }` }
								className="settings-wordpress-account"
								data-testid={ `settings-wordpress-account-${ group.accountId }` }
								data-expanded={ expanded ? 'true' : 'false' }
							>
								<button
									type="button"
									className="settings-wordpress-account-header"
									data-testid={ `settings-wordpress-account-header-${ group.accountId }` }
									aria-expanded={ expanded }
									onClick={ () =>
										setAccountCollapsed(
											group.accountId,
											expanded
										)
									}
								>
									<ChevronIcon
										size={ 14 }
										className="settings-wordpress-account-chevron"
									/>
									<WordpressIcon size={ 18 } />
									<div className="settings-wordpress-account-text">
										<span className="settings-wordpress-account-username">
											{ group.username }
										</span>
										<span className="settings-wordpress-account-count">
											{ count === 1
												? '1 site'
												: `${ count } sites` }
										</span>
									</div>
									<span
										role="presentation"
										className="settings-wordpress-account-spacer"
									/>
									<span
										// Render the disconnect-all action as a
										// nested element rather than a real
										// <button> so the parent header button
										// stays valid HTML. Click + keyboard
										// activation are wired explicitly.
										role="button"
										tabIndex={ 0 }
										className="settings-wordpress-disconnect settings-wordpress-account-disconnect"
										data-testid={ `settings-wordpress-account-disconnect-${ group.accountId }` }
										aria-label={ `Disconnect all of ${ group.username }'s sites` }
										title={ `Disconnect all of ${ group.username }'s sites` }
										aria-disabled={
											removingAccountId ===
											group.accountId
										}
										onClick={ ( e ) => {
											e.stopPropagation();
											if (
												removingAccountId ===
												group.accountId
											) {
												return;
											}
											requestDisconnectAccount( group );
										} }
										onKeyDown={ ( e ) => {
											if (
												e.key === 'Enter' ||
												e.key === ' '
											) {
												e.preventDefault();
												e.stopPropagation();
												if (
													removingAccountId ===
													group.accountId
												) {
													return;
												}
												requestDisconnectAccount(
													group
												);
											}
										} }
									>
										<TrashIcon size={ 14 } />
									</span>
								</button>
								{ expanded && (
									<ul
										className="settings-wordpress-account-sites"
										data-testid={ `settings-wordpress-account-sites-${ group.accountId }` }
									>
										{ group.connections.map(
											( connection ) => (
												<WordpressConnectionRow
													key={ connection.id }
													connection={ connection }
													onDisconnect={
														requestDisconnect
													}
													disabled={
														removingId ===
															connection.id ||
														removingAccountId ===
															group.accountId
													}
												/>
											)
										) }
									</ul>
								) }
							</li>
						);
					} ) }
					{ flat.map( ( connection ) => (
						<WordpressConnectionRow
							key={ connection.id }
							connection={ connection }
							onDisconnect={ requestDisconnect }
							disabled={ removingId === connection.id }
						/>
					) ) }
				</ul>
			) }
			<WordpressDisconnectDialog
				pending={ pendingDisconnect }
				working={ isWorking }
				onConfirm={ () => {
					void confirmDisconnect();
				} }
				onCancel={ cancelDisconnect }
			/>
		</section>
	);
}

function ApiKeySection( {
	apiKey,
	onApiKeyChange,
	visible,
	onToggleVisible,
	submitting,
	trimmedLength,
}: {
	apiKey: string;
	onApiKeyChange: ( v: string ) => void;
	visible: boolean;
	onToggleVisible: () => void;
	submitting: boolean;
	trimmedLength: number;
} ): React.ReactElement {
	return (
		<div className="dialog-field">
			<div className="settings-input-row">
				<input
					id="settings-api-key"
					type={ visible ? 'text' : 'password' }
					className="dialog-input"
					data-testid="settings-input-api-key"
					value={ apiKey }
					onChange={ ( e ) => onApiKeyChange( e.target.value ) }
					placeholder="Enter a new key (sk-ant-…)"
					aria-label="Anthropic API key"
					autoComplete="off"
					spellCheck={ false }
					disabled={ submitting }
				/>
				<button
					type="button"
					className="dialog-button-secondary settings-toggle-visibility"
					data-testid="settings-toggle-visibility"
					onClick={ onToggleVisible }
					disabled={ submitting || trimmedLength === 0 }
				>
					{ visible ? 'Hide' : 'Show' }
				</button>
			</div>
			<div className="dialog-help">
				Required to chat with Claude. Get one at{ ' ' }
				<button
					type="button"
					className="dialog-link"
					data-testid="settings-get-key-link"
					data-href={ KEYS_PAGE_URL }
					onClick={ () => {
						void window.api.shell.openExternal( KEYS_PAGE_URL );
					} }
				>
					console.anthropic.com
				</button>
				.
			</div>
		</div>
	);
}
