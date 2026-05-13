import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

type Props = {
	open: boolean;
	parentLabel: string;
	busy: boolean;
	error: 'invalid-name' | 'collision' | 'io-error' | null;
	onConfirm: ( name: string ) => void;
	onCancel: () => void;
};

const INVALID_NAME = /[\\/]|^\.|[\x00-\x1f]/;

export function CreateFolderDialog( {
	open,
	parentLabel,
	busy,
	error,
	onConfirm,
	onCancel,
}: Props ): React.ReactElement {
	const [ value, setValue ] = useState< string >( '' );
	const inputRef = useRef< HTMLInputElement | null >( null );

	useEffect( () => {
		if ( open ) {
			setValue( '' );
			queueMicrotask( () => {
				inputRef.current?.focus();
			} );
		}
	}, [ open ] );

	const trimmed = value.trim();
	const validShape = trimmed.length > 0 && ! INVALID_NAME.test( trimmed );
	const canConfirm = ! busy && validShape;

	let helperState: 'idle' | 'preview' | 'error';
	if ( error || ( value.length > 0 && ! validShape ) ) {
		helperState = 'error';
	} else if ( validShape ) {
		helperState = 'preview';
	} else {
		helperState = 'idle';
	}

	let helperText: string;
	if ( error === 'collision' ) {
		helperText = 'A folder with that name already exists.';
	} else if ( error === 'io-error' ) {
		helperText = 'Couldn’t create the folder — try again.';
	} else if (
		error === 'invalid-name' ||
		( value.length > 0 && ! validShape )
	) {
		helperText = 'Folder names cannot contain / or \\ or start with a dot.';
	} else if ( validShape ) {
		helperText = `Creates ${ parentLabel } / ${ trimmed }`;
	} else {
		helperText = `New folder under ${ parentLabel }.`;
	}

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
					data-testid="create-folder-dialog"
				>
					<Dialog.Title className="dialog-title">
						New folder
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						Add a folder under { parentLabel }.
					</Dialog.Description>
					<div className="dialog-field">
						<input
							ref={ inputRef }
							type="text"
							className="dialog-input"
							data-testid="create-folder-input"
							value={ value }
							onChange={ ( e ) => setValue( e.target.value ) }
							onKeyDown={ ( e ) => {
								if ( e.key === 'Enter' && canConfirm ) {
									e.preventDefault();
									onConfirm( trimmed );
								}
							} }
							disabled={ busy }
							placeholder="Folder name"
							aria-label="New folder name"
						/>
						<p
							className="dialog-help"
							data-testid="create-folder-helper"
							data-state={ helperState }
						>
							{ helperText }
						</p>
					</div>
					<div className="dialog-footer">
						<button
							type="button"
							className="dialog-button-secondary"
							data-testid="create-folder-cancel"
							onClick={ onCancel }
							disabled={ busy }
						>
							Cancel
						</button>
						<button
							type="button"
							className="dialog-button-primary"
							data-testid="create-folder-confirm"
							onClick={ () => onConfirm( trimmed ) }
							disabled={ ! canConfirm }
						>
							{ busy ? 'Creating…' : 'Create' }
						</button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
