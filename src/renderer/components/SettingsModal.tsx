import React, { useEffect, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

import type { AuthMode } from '../../types';

const KEYS_PAGE_URL = 'https://console.anthropic.com/settings/keys';

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

	useEffect( () => {
		if ( ! open ) {
			setApiKey( '' );
			setVisible( false );
			setSubmitting( false );
			setKeyAlreadySet( null );
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
		return () => {
			cancelled = true;
		};
	}, [ open ] );

	const trimmed = apiKey.trim();
	const canSubmit =
		! submitting &&
		( authMode === 'claude-code' || trimmed.length > 0 || keyAlreadySet );

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
						<ClaudeCodeSection disabled={ submitting } />
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
}: {
	disabled: boolean;
} ): React.ReactElement {
	return (
		<div className="dialog-field settings-claude-section">
			<div
				className="settings-claude-status"
				data-testid="settings-claude-status"
				data-state="checking"
			>
				Checking Claude Code session…
			</div>
			<div className="settings-claude-actions">
				<button
					type="button"
					className="dialog-button-secondary"
					data-testid="settings-claude-signin"
					disabled={ disabled }
				>
					Sign in with Claude
				</button>
				<button
					type="button"
					className="dialog-button-secondary"
					data-testid="settings-claude-refresh"
					disabled={ disabled }
				>
					Refresh
				</button>
			</div>
			<div className="dialog-help">
				Use the session from your installed Claude Code. We never read
				or store your OAuth tokens — the bundled SDK handles auth.
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
