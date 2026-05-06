import React, { useEffect, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

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
	const [ apiKey, setApiKey ] = useState( '' );
	const [ visible, setVisible ] = useState( false );
	const [ keyAlreadySet, setKeyAlreadySet ] = useState< boolean | null >(
		null
	);
	const [ submitting, setSubmitting ] = useState( false );

	// On open: reset the input (the saved key is never displayed) and check
	// whether one is configured so we can tell the user "your existing key
	// will be replaced" vs "no key is set yet".
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
			if ( ! cancelled ) {
				setKeyAlreadySet( settings.anthropicApiKey !== '' );
			}
		} );
		return () => {
			cancelled = true;
		};
	}, [ open ] );

	const trimmed = apiKey.trim();
	const canSubmit = trimmed.length > 0 && ! submitting;

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
			await window.api.settings.set( { anthropicApiKey: trimmed } );
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
				>
					<Dialog.Title className="dialog-title">
						Settings
					</Dialog.Title>

					<div className="dialog-field">
						<label
							className="dialog-label"
							htmlFor="settings-api-key"
						>
							Anthropic API key
						</label>
						<div className="settings-input-row">
							<input
								id="settings-api-key"
								type={ visible ? 'text' : 'password' }
								className="dialog-input"
								data-testid="settings-input-api-key"
								value={ apiKey }
								onChange={ ( e ) =>
									setApiKey( e.target.value )
								}
								placeholder="Enter a new key (sk-ant-…)"
								autoComplete="off"
								spellCheck={ false }
								disabled={ submitting }
							/>
							<button
								type="button"
								className="dialog-button-secondary settings-toggle-visibility"
								data-testid="settings-toggle-visibility"
								onClick={ () => setVisible( ( v ) => ! v ) }
								disabled={ submitting || trimmed.length === 0 }
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
									void window.api.shell.openExternal(
										KEYS_PAGE_URL
									);
								} }
							>
								console.anthropic.com
							</button>
							.
						</div>
					</div>

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
