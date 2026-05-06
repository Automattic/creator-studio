import React, { useEffect, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

type Props = {
	open: boolean;
	onClose: () => void;
	// Resolved with the URL the user submitted (already trimmed). Parent handles
	// classification + chat creation; this component only validates that the
	// input is non-empty so submit can't fire on whitespace.
	onSubmit: ( url: string ) => Promise< void >;
};

export function ImportUrlModal( {
	open,
	onClose,
	onSubmit,
}: Props ): React.ReactElement {
	const [ url, setUrl ] = useState( '' );
	const [ submitting, setSubmitting ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );

	useEffect( () => {
		if ( ! open ) {
			setUrl( '' );
			setSubmitting( false );
			setError( null );
		}
	}, [ open ] );

	const trimmed = url.trim();
	const canSubmit = trimmed.length > 0 && ! submitting;

	const submit = async (): Promise< void > => {
		if ( ! canSubmit ) {
			return;
		}
		setSubmitting( true );
		setError( null );
		try {
			await onSubmit( trimmed );
			onClose();
		} catch ( err ) {
			const message = err instanceof Error ? err.message : String( err );
			setError( message );
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
					data-testid="import-url-modal"
				>
					<Dialog.Title className="dialog-title">
						Import a URL
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						Claude will fetch the page, extract the metadata it can
						find (title, author, date, summary, …), and save the
						result as a markdown file in <code>sources/</code>.
					</Dialog.Description>

					<div className="dialog-field">
						<label
							className="dialog-label"
							htmlFor="import-url-input"
						>
							URL <span className="dialog-required">*</span>
						</label>
						<input
							id="import-url-input"
							type="url"
							className="dialog-input"
							data-testid="import-url-input"
							value={ url }
							onChange={ ( e ) => setUrl( e.target.value ) }
							onKeyDown={ ( e ) => {
								if ( e.key === 'Enter' && canSubmit ) {
									e.preventDefault();
									void submit();
								}
							} }
							placeholder="https://example.com/article"
						/>
					</div>

					{ error && (
						<div
							className="dialog-error"
							data-testid="import-url-error"
							role="alert"
						>
							{ error }
						</div>
					) }

					<div className="dialog-footer">
						<button
							type="button"
							className="dialog-button-secondary"
							data-testid="import-url-cancel"
							onClick={ onClose }
							disabled={ submitting }
						>
							Cancel
						</button>
						<button
							type="button"
							className="dialog-button-primary"
							data-testid="import-url-submit"
							onClick={ () => {
								void submit();
							} }
							disabled={ ! canSubmit }
						>
							{ submitting ? 'Importing…' : 'Import' }
						</button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
