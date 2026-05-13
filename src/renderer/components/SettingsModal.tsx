import React, { useCallback, useEffect, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

import type { AuthMode, ClaudeAuthStatus } from '../../types';

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
		return () => {
			cancelled = true;
		};
	}, [ open, refreshClaudeStatus ] );

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

					<div
						className="dialog-field settings-auth-mode"
						role="radiogroup"
						aria-label="Authentication method"
					>
						<label
							className="settings-auth-mode-option"
							htmlFor="settings-auth-mode-claude-code"
						>
							<input
								id="settings-auth-mode-claude-code"
								type="radio"
								name="settings-auth-mode"
								value="claude-code"
								checked={ authMode === 'claude-code' }
								onChange={ () => setAuthMode( 'claude-code' ) }
								data-testid="settings-auth-mode-claude-code"
								disabled={ submitting }
							/>
							<span>Sign in with Claude</span>
						</label>
						<label
							className="settings-auth-mode-option"
							htmlFor="settings-auth-mode-api-key"
						>
							<input
								id="settings-auth-mode-api-key"
								type="radio"
								name="settings-auth-mode"
								value="api-key"
								checked={ authMode === 'api-key' }
								onChange={ () => setAuthMode( 'api-key' ) }
								data-testid="settings-auth-mode-api-key"
								disabled={ submitting }
							/>
							<span>Use API key</span>
						</label>
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
								const next = await window.api.auth.logout();
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
							onToggleVisible={ () => setVisible( ( v ) => ! v ) }
							submitting={ submitting }
							trimmedLength={ trimmed.length }
						/>
					) }

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
				Signed in as{ ' ' }
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
				{ statusText }
			</div>
			<div className="settings-claude-actions">
				{ state.kind === 'signed-in' ? (
					<button
						type="button"
						className="dialog-button-secondary"
						data-testid="settings-claude-signout"
						onClick={ () => {
							void runSignOut();
						} }
						disabled={ disabled || busy !== null }
					>
						{ busy === 'signout' ? 'Signing out…' : 'Sign out' }
					</button>
				) : (
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
				) }
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
			<label className="dialog-label" htmlFor="settings-api-key">
				Anthropic API key
			</label>
			<div className="settings-input-row">
				<input
					id="settings-api-key"
					type={ visible ? 'text' : 'password' }
					className="dialog-input"
					data-testid="settings-input-api-key"
					value={ apiKey }
					onChange={ ( e ) => onApiKeyChange( e.target.value ) }
					placeholder="Enter a new key (sk-ant-…)"
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
