import React, { useEffect, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

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
	const [ loading, setLoading ] = useState( false );
	const [ submitting, setSubmitting ] = useState( false );

	useEffect( () => {
		if ( ! open ) {
			setVisible( false );
			setSubmitting( false );
			return;
		}
		let cancelled = false;
		setLoading( true );
		void window.api.settings
			.get()
			.then( ( settings ) => {
				if ( ! cancelled ) {
					setApiKey( settings.anthropicApiKey );
				}
			} )
			.finally( () => {
				if ( ! cancelled ) {
					setLoading( false );
				}
			} );
		return () => {
			cancelled = true;
		};
	}, [ open ] );

	const onSave = async (): Promise< void > => {
		setSubmitting( true );
		try {
			await window.api.settings.set( { anthropicApiKey: apiKey.trim() } );
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
				>
					<Dialog.Title className="dialog-title">
						Settings
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						Your Anthropic API key is written to a local .env file
						and used by every chat in this app.
					</Dialog.Description>

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
								placeholder="sk-ant-…"
								autoComplete="off"
								spellCheck={ false }
								disabled={ loading || submitting }
							/>
							<button
								type="button"
								className="dialog-button-secondary settings-toggle-visibility"
								data-testid="settings-toggle-visibility"
								onClick={ () => setVisible( ( v ) => ! v ) }
								disabled={ loading || submitting }
							>
								{ visible ? 'Hide' : 'Show' }
							</button>
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
							disabled={ loading || submitting }
						>
							{ submitting ? 'Saving…' : 'Save' }
						</button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
