import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

type Props = {
	open: boolean;
	currentName: string;
	busy: boolean;
	error: 'io-error' | null;
	onConfirm: ( name: string ) => void;
	onCancel: () => void;
};

export function RenameProjectDialog( {
	open,
	currentName,
	busy,
	error,
	onConfirm,
	onCancel,
}: Props ): React.ReactElement {
	const [ value, setValue ] = useState( '' );
	const inputRef = useRef< HTMLInputElement | null >( null );

	useEffect( () => {
		if ( open ) {
			setValue( currentName );
			queueMicrotask( () => {
				inputRef.current?.focus();
				inputRef.current?.select();
			} );
		}
	}, [ open, currentName ] );

	const trimmed = value.trim();
	const canConfirm = ! busy && trimmed.length > 0 && trimmed !== currentName;

	return (
		<Dialog.Root
			open={ open }
			onOpenChange={ ( isOpen ) => {
				if ( ! isOpen && ! busy ) {
					onCancel();
				}
			} }
		>
			<Dialog.Portal>
				<Dialog.Backdrop className="dialog-backdrop" />
				<Dialog.Popup
					className="dialog-panel"
					data-testid="rename-project-dialog"
				>
					<Dialog.Title className="dialog-title">
						Rename project
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						Choose a new display name for this project.
					</Dialog.Description>
					<div className="dialog-field">
						<input
							ref={ inputRef }
							type="text"
							className="dialog-input"
							data-testid="rename-project-input"
							value={ value }
							onChange={ ( e ) => setValue( e.target.value ) }
							onKeyDown={ ( e ) => {
								if ( e.key === 'Enter' && canConfirm ) {
									e.preventDefault();
									onConfirm( trimmed );
								}
							} }
							disabled={ busy }
							aria-label="New project name"
						/>
						{ error === 'io-error' && (
							<p
								className="dialog-help"
								data-testid="rename-project-error"
								data-state="error"
							>
								Couldn&apos;t rename — try again.
							</p>
						) }
					</div>
					<div className="dialog-footer">
						<button
							type="button"
							className="dialog-button-secondary"
							data-testid="rename-project-cancel"
							onClick={ onCancel }
							disabled={ busy }
						>
							Cancel
						</button>
						<button
							type="button"
							className="dialog-button-primary"
							data-testid="rename-project-confirm"
							onClick={ () => onConfirm( trimmed ) }
							disabled={ ! canConfirm }
						>
							{ busy ? 'Renaming…' : 'Rename' }
						</button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
