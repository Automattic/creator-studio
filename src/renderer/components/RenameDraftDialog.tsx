import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

import { slugifyTitle } from '../../main/channels/utils/slugify';

type Props = {
	open: boolean;
	currentBasename: string;
	busy: boolean;
	error: 'invalid-name' | 'collision' | 'io-error' | null;
	onConfirm: ( desired: string ) => void;
	onCancel: () => void;
	// Swaps the noun in user-visible strings ("Rename draft" / "draft's
	// title…" / "A draft with that name…") for source notes. Defaults to
	// 'draft' so the dedicated DraftEditorScreen consumer stays unchanged.
	noun?: 'draft' | 'note';
};

export function RenameDraftDialog( {
	open,
	currentBasename,
	busy,
	error,
	onConfirm,
	onCancel,
	noun = 'draft',
}: Props ): React.ReactElement {
	const [ value, setValue ] = useState< string >( '' );
	const inputRef = useRef< HTMLInputElement | null >( null );

	// Reset the input each time the dialog opens so it always starts from the
	// current basename — a previous failed attempt (collision) shouldn't leak
	// into the next open. Focus the input on open via a ref instead of the
	// `autoFocus` attribute (jsx-a11y forbids it for accessibility reasons:
	// autoFocus on every mount is disorienting; we only want focus when the
	// dialog actually opens).
	useEffect( () => {
		if ( open ) {
			setValue( currentBasename );
			// Defer to a microtask so the input has mounted (Base UI portals
			// the popup; the input isn't in the DOM until after this effect
			// fires the first time the dialog opens).
			queueMicrotask( () => {
				inputRef.current?.focus();
				inputRef.current?.select();
			} );
		}
	}, [ open, currentBasename ] );

	const slug = slugifyTitle( value );
	const willChange = slug !== null && slug !== currentBasename;
	const sameAsCurrent = slug !== null && slug === currentBasename;
	const canConfirm = ! busy && slug !== null && willChange;

	let helperState: 'idle' | 'preview' | 'error';
	if ( error || ( value.length > 0 && slug === null ) ) {
		helperState = 'error';
	} else if ( willChange ) {
		helperState = 'preview';
	} else {
		helperState = 'idle';
	}

	let helperText: string;
	if ( error === 'collision' ) {
		helperText = `A ${ noun } with that name already exists.`;
	} else if ( error === 'io-error' ) {
		helperText = 'Couldn’t rename — try again.';
	} else if (
		error === 'invalid-name' ||
		( value.length > 0 && slug === null )
	) {
		helperText = 'Pick a name with at least one letter or number.';
	} else if ( sameAsCurrent ) {
		helperText = 'Same as the current name.';
	} else if ( slug ) {
		helperText = `Saves as ${ slug }.md`;
	} else {
		helperText = 'Type a new name.';
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
					data-testid="rename-draft-dialog"
				>
					<Dialog.Title className="dialog-title">
						{ noun === 'note' ? 'Rename note' : 'Rename draft' }
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						Choose a new filename. The { noun }’s title isn’t
						affected.
					</Dialog.Description>
					<div className="dialog-field">
						<input
							ref={ inputRef }
							type="text"
							className="dialog-input"
							data-testid="rename-draft-input"
							value={ value }
							onChange={ ( e ) => setValue( e.target.value ) }
							onKeyDown={ ( e ) => {
								if ( e.key === 'Enter' && canConfirm ) {
									e.preventDefault();
									onConfirm( value );
								}
							} }
							disabled={ busy }
							aria-label={ `New ${ noun } filename` }
						/>
						<p
							className="dialog-help"
							data-testid="rename-draft-helper"
							data-state={ helperState }
						>
							{ helperText }
						</p>
					</div>
					<div className="dialog-footer">
						<button
							type="button"
							className="dialog-button-secondary"
							data-testid="rename-draft-cancel"
							onClick={ onCancel }
							disabled={ busy }
						>
							Cancel
						</button>
						<button
							type="button"
							className="dialog-button-primary"
							data-testid="rename-draft-confirm"
							onClick={ () => onConfirm( value ) }
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
