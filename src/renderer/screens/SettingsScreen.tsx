import React, { useCallback, useEffect, useMemo, useState } from 'react';

import type {
	AuthMode,
	ClaudeAuthStatus,
	WordpressConnectionPublic,
} from '../../types';

import {
	ChevronIcon,
	CloseIcon,
	PlusIcon,
	RefreshIcon,
	SearchIcon,
	SignOutIcon,
	TrashIcon,
	WordpressIcon,
} from '../icons';

import {
	groupWordpressConnections,
	type WordpressAccountGroup,
} from '../lib/wordpressGroups';

import { WordpressConnectDialog } from '../components/WordpressConnectDialog';
import {
	WordpressDisconnectDialog,
	type WordpressDisconnectPending,
} from '../components/WordpressDisconnectDialog';

const KEYS_PAGE_URL = 'https://console.anthropic.com/settings/keys';

// After a terminal sign-in is kicked off, re-probe auth status on this cadence
// until it flips to signed-in, then stop. The timeout caps the polling so a
// sign-in that's abandoned mid-flow doesn't spin forever.
const SIGN_IN_POLL_INTERVAL_MS = 3000;
const SIGN_IN_POLL_TIMEOUT_MS = 3 * 60_000;

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

export function SettingsScreen(): React.ReactElement {
	const [ authMode, setAuthMode ] = useState< AuthMode >( 'api-key' );
	const [ apiKey, setApiKey ] = useState( '' );
	const [ visible, setVisible ] = useState( false );
	const [ keyAlreadySet, setKeyAlreadySet ] = useState< boolean | null >(
		null
	);
	const [ keyJustSaved, setKeyJustSaved ] = useState( false );
	const [ savingKey, setSavingKey ] = useState( false );
	const [ claudeStatus, setClaudeStatus ] = useState< ClaudeStatusState >( {
		kind: 'checking',
	} );
	const [ pendingSignIn, setPendingSignIn ] = useState( false );
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
		if ( status.signedIn ) {
			setClaudeStatus( { kind: 'signed-in', status } );
			setPendingSignIn( false );
		} else {
			setClaudeStatus( { kind: 'signed-out' } );
		}
	}, [] );

	useEffect( () => {
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
	}, [ refreshClaudeStatus, refreshWpConnections ] );

	// Re-probe whenever the user toggles back to Claude-Code mode — they may
	// have signed in/out via a terminal since the screen was opened.
	useEffect( () => {
		if ( authMode === 'claude-code' ) {
			void refreshClaudeStatus();
		}
	}, [ authMode, refreshClaudeStatus ] );

	// After the user kicks off a terminal sign-in, poll auth status until the
	// OAuth flow completes so they never have to click Refresh themselves.
	// Also re-checks the moment the window regains focus — i.e. when they
	// switch back from the terminal/browser. Gives up after a few minutes.
	useEffect( () => {
		if ( ! pendingSignIn ) {
			return;
		}
		let cancelled = false;
		const deadline = Date.now() + SIGN_IN_POLL_TIMEOUT_MS;

		const check = async (): Promise< void > => {
			if ( cancelled ) {
				return;
			}
			const status = await window.api.auth.refresh();
			if ( cancelled ) {
				return;
			}
			if ( status.signedIn ) {
				setClaudeStatus( { kind: 'signed-in', status } );
				setPendingSignIn( false );
			} else if ( Date.now() >= deadline ) {
				setPendingSignIn( false );
			}
		};

		const interval = setInterval(
			() => void check(),
			SIGN_IN_POLL_INTERVAL_MS
		);
		const onFocus = (): void => void check();
		window.addEventListener( 'focus', onFocus );

		return () => {
			cancelled = true;
			clearInterval( interval );
			window.removeEventListener( 'focus', onFocus );
		};
	}, [ pendingSignIn ] );

	// The auth method is a preference, not a gated commit: persist it the
	// moment the user picks it so the screen has no global Save button.
	const onSelectAuthMode = ( next: AuthMode ): void => {
		if ( next === authMode ) {
			return;
		}
		setAuthMode( next );
		void window.api.settings.set( { authMode: next } );
	};

	const onApiKeyChange = ( value: string ): void => {
		setApiKey( value );
		setKeyJustSaved( false );
	};

	const trimmed = apiKey.trim();

	const onSaveKey = async (): Promise< void > => {
		if ( savingKey || trimmed.length === 0 ) {
			return;
		}
		setSavingKey( true );
		try {
			await window.api.settings.set( { anthropicApiKey: trimmed } );
			setApiKey( '' );
			setVisible( false );
			setKeyAlreadySet( true );
			setKeyJustSaved( true );
		} finally {
			setSavingKey( false );
		}
	};

	let statusAttr: 'true' | 'false' | undefined;
	if ( keyAlreadySet === true ) {
		statusAttr = 'true';
	} else if ( keyAlreadySet === false ) {
		statusAttr = 'false';
	}

	return (
		<section
			className="settings-screen"
			data-testid="screen-settings"
			data-key-set={ statusAttr }
			data-auth-mode={ authMode }
			aria-label="Settings"
		>
			<div className="settings-screen-content">
				<header className="settings-screen-header">
					<h1 className="settings-screen-title">Settings</h1>
				</header>

				<section
					className="settings-section"
					aria-labelledby="settings-section-claude-title"
				>
					<div className="settings-section-header">
						<div className="settings-section-heading">
							<h2
								className="settings-section-title"
								id="settings-section-claude-title"
							>
								Claude account
							</h2>
							<p className="settings-section-description">
								Choose how Studio Write authenticates with
								Claude.
							</p>
						</div>
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
								authMode === 'claude-code' ? 'true' : undefined
							}
							aria-selected={ authMode === 'claude-code' }
							onClick={ () => onSelectAuthMode( 'claude-code' ) }
						>
							Sign in with Claude
						</button>
						<button
							type="button"
							role="tab"
							className="dialog-segmented-option"
							data-testid="settings-auth-mode-api-key"
							data-active={
								authMode === 'api-key' ? 'true' : undefined
							}
							aria-selected={ authMode === 'api-key' }
							onClick={ () => onSelectAuthMode( 'api-key' ) }
						>
							Use API key
						</button>
					</div>

					{ authMode === 'claude-code' ? (
						<ClaudeCodeSection
							state={ claudeStatus }
							pending={ pendingSignIn }
							onRefresh={ () => {
								void refreshClaudeStatus();
							} }
							onSignIn={ async () => {
								await window.api.auth.startLogin();
								setPendingSignIn( true );
							} }
							onSignOut={ async () => {
								const next = await window.api.auth.logout();
								setClaudeStatus(
									next.signedIn
										? { kind: 'signed-in', status: next }
										: { kind: 'signed-out' }
								);
							} }
						/>
					) : (
						<ApiKeySection
							apiKey={ apiKey }
							onApiKeyChange={ onApiKeyChange }
							visible={ visible }
							onToggleVisible={ () => setVisible( ( v ) => ! v ) }
							saving={ savingKey }
							trimmedLength={ trimmed.length }
							keyAlreadySet={ keyAlreadySet === true }
							keyJustSaved={ keyJustSaved }
							onSave={ () => {
								void onSaveKey();
							} }
						/>
					) }
				</section>

				<WordpressSection
					connections={ wpConnections }
					onChanged={ refreshWpConnections }
					onAddClick={ () => setWpConnectOpen( true ) }
				/>
			</div>

			<WordpressConnectDialog
				open={ wpConnectOpen }
				onClose={ () => setWpConnectOpen( false ) }
				onConnected={ () => {
					void refreshWpConnections();
				} }
			/>
		</section>
	);
}

function ClaudeCodeSection( {
	state,
	pending,
	onRefresh,
	onSignIn,
	onSignOut,
}: {
	state: ClaudeStatusState;
	pending: boolean;
	onRefresh: () => void;
	onSignIn: () => Promise< void >;
	onSignOut: () => Promise< void >;
} ): React.ReactElement {
	const [ busy, setBusy ] = useState< 'signin' | 'signout' | null >( null );

	const runSignIn = async (): Promise< void > => {
		if ( busy ) {
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
		if ( busy ) {
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
	if ( state.kind === 'signed-in' ) {
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
	} else if ( pending ) {
		// A terminal sign-in is in progress; we're polling for completion.
		stateAttr = 'checking';
		statusText = 'Waiting for you to finish signing in…';
	} else if ( state.kind === 'checking' ) {
		stateAttr = 'checking';
		statusText = 'Checking Claude Code session…';
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
							disabled={ busy !== null }
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
							disabled={ busy !== null }
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
						disabled={ busy !== null }
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
						disabled={ busy !== null }
					>
						Refresh
					</button>
				</div>
			) }
			<div className="dialog-help">
				{ state.kind === 'signed-out' ? (
					<>
						Sign in opens a terminal running{ ' ' }
						<code>claude auth login</code>. Studio Write updates
						automatically once you finish the browser flow. Your
						OAuth tokens are managed by the bundled Claude binary —
						Studio Write never reads or stores them.
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

function ApiKeySection( {
	apiKey,
	onApiKeyChange,
	visible,
	onToggleVisible,
	saving,
	trimmedLength,
	keyAlreadySet,
	keyJustSaved,
	onSave,
}: {
	apiKey: string;
	onApiKeyChange: ( v: string ) => void;
	visible: boolean;
	onToggleVisible: () => void;
	saving: boolean;
	trimmedLength: number;
	keyAlreadySet: boolean;
	keyJustSaved: boolean;
	onSave: () => void;
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
					onKeyDown={ ( e ) => {
						if ( e.key === 'Enter' && trimmedLength > 0 ) {
							onSave();
						}
					} }
					placeholder={
						keyAlreadySet
							? 'Enter a new key to replace it'
							: 'Enter a key (sk-ant-…)'
					}
					aria-label="Anthropic API key"
					autoComplete="off"
					spellCheck={ false }
					disabled={ saving }
				/>
				<button
					type="button"
					className="dialog-button-secondary settings-toggle-visibility"
					data-testid="settings-toggle-visibility"
					onClick={ onToggleVisible }
					disabled={ saving || trimmedLength === 0 }
				>
					{ visible ? 'Hide' : 'Show' }
				</button>
				<button
					type="button"
					className="dialog-button-primary"
					data-testid="settings-save-key"
					onClick={ onSave }
					disabled={ saving || trimmedLength === 0 }
				>
					{ saving ? 'Saving…' : 'Save' }
				</button>
			</div>
			{ keyJustSaved ? (
				<div
					className="dialog-help settings-key-saved"
					data-testid="settings-key-saved"
				>
					API key saved.
				</div>
			) : (
				<div className="dialog-help">
					{ keyAlreadySet
						? 'A key is already saved. '
						: 'Required to chat with Claude. ' }
					Get one at{ ' ' }
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
			) }
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
	const [ siteSearch, setSiteSearch ] = useState( '' );

	const { accounts, flat } = groupWordpressConnections( connections );

	const searchLower = siteSearch.trim().toLowerCase();
	const isSearching = searchLower.length > 0;
	const showSiteSearch = connections.length >= 6;

	const filteredAccounts = useMemo( () => {
		if ( ! searchLower ) {
			return accounts;
		}
		const matches = ( c: WordpressConnectionPublic ): boolean =>
			c.label.toLowerCase().includes( searchLower ) ||
			c.siteUrl.toLowerCase().includes( searchLower );
		return accounts
			.map( ( group ) => ( {
				...group,
				connections: group.connections.filter( matches ),
			} ) )
			.filter( ( group ) => group.connections.length > 0 );
	}, [ accounts, searchLower ] );

	const filteredFlat = useMemo( () => {
		if ( ! searchLower ) {
			return flat;
		}
		return flat.filter(
			( c ) =>
				c.label.toLowerCase().includes( searchLower ) ||
				c.siteUrl.toLowerCase().includes( searchLower )
		);
	}, [ flat, searchLower ] );

	const isExpanded = ( group: WordpressAccountGroup ): boolean => {
		if ( isSearching ) {
			return true;
		}
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
				<div className="settings-section-heading">
					<h2
						className="settings-section-title"
						id="settings-section-wordpress-title"
					>
						WordPress sites
					</h2>
					<p className="settings-section-description">
						Connect sites to publish drafts and import existing
						posts.
					</p>
				</div>
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
					No sites connected yet.
				</p>
			) : (
				<>
					{ showSiteSearch && (
						<div className="project-wordpress-search">
							<SearchIcon size={ 14 } />
							<input
								type="text"
								className="project-wordpress-search-input"
								data-testid="settings-wordpress-search"
								placeholder="Filter sites…"
								value={ siteSearch }
								onChange={ ( e ) =>
									setSiteSearch( e.target.value )
								}
							/>
							{ siteSearch && (
								<button
									type="button"
									className="project-wordpress-search-clear"
									aria-label="Clear search"
									onClick={ () => setSiteSearch( '' ) }
								>
									<CloseIcon size={ 12 } />
								</button>
							) }
						</div>
					) }
					<ul
						className="settings-wordpress-list"
						data-testid="settings-wordpress-list"
					>
						{ filteredAccounts.map( ( group ) => {
							const expanded = isExpanded( group );
							const count = group.connections.length;
							return (
								<li
									key={ `account-${ group.accountId }` }
									className="settings-wordpress-account"
									data-testid={ `settings-wordpress-account-${ group.accountId }` }
									data-expanded={
										expanded ? 'true' : 'false'
									}
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
												requestDisconnectAccount(
													group
												);
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
														connection={
															connection
														}
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
						{ filteredFlat.map( ( connection ) => (
							<WordpressConnectionRow
								key={ connection.id }
								connection={ connection }
								onDisconnect={ requestDisconnect }
								disabled={ removingId === connection.id }
							/>
						) ) }
						{ isSearching &&
							filteredAccounts.length === 0 &&
							filteredFlat.length === 0 && (
								<li className="project-wordpress-no-results">
									No sites match &ldquo;
									{ siteSearch.trim() }&rdquo;
								</li>
							) }
					</ul>
				</>
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
