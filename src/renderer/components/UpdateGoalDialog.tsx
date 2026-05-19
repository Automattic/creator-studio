import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

type Props = {
	open: boolean;
	currentGoal: string;
	busy: boolean;
	error: 'io-error' | null;
	onConfirm: ( goal: string ) => void;
	onCancel: () => void;
};

export function UpdateGoalDialog( {
	open,
	currentGoal,
	busy,
	error,
	onConfirm,
	onCancel,
}: Props ): React.ReactElement {
	const [ value, setValue ] = useState( '' );
	const inputRef = useRef< HTMLTextAreaElement | null >( null );

	useEffect( () => {
		if ( open ) {
			setValue( currentGoal );
			queueMicrotask( () => {
				inputRef.current?.focus();
			} );
		}
	}, [ open, currentGoal ] );

	const trimmed = value.trim();
	const changed = trimmed !== currentGoal;
	const canConfirm = ! busy && changed;

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
					data-testid="update-goal-dialog"
				>
					<Dialog.Title className="dialog-title">
						Update goal
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						Describe what this project is about. The goal is shown
						on the project card and guides the AI assistant.
					</Dialog.Description>
					<div className="dialog-field">
						<textarea
							ref={ inputRef }
							className="dialog-textarea"
							data-testid="update-goal-input"
							value={ value }
							onChange={ ( e ) => setValue( e.target.value ) }
							onKeyDown={ ( e ) => {
								if (
									e.key === 'Enter' &&
									( e.metaKey || e.ctrlKey ) &&
									canConfirm
								) {
									e.preventDefault();
									onConfirm( trimmed );
								}
							} }
							disabled={ busy }
							rows={ 3 }
							aria-label="Project goal"
						/>
						{ error === 'io-error' && (
							<p
								className="dialog-help"
								data-testid="update-goal-error"
								data-state="error"
							>
								Couldn&apos;t update the goal — try again.
							</p>
						) }
					</div>
					<div className="dialog-footer">
						<button
							type="button"
							className="dialog-button-secondary"
							data-testid="update-goal-cancel"
							onClick={ onCancel }
							disabled={ busy }
						>
							Cancel
						</button>
						<button
							type="button"
							className="dialog-button-primary"
							data-testid="update-goal-confirm"
							onClick={ () => onConfirm( trimmed ) }
							disabled={ ! canConfirm }
						>
							{ busy ? 'Saving…' : 'Save' }
						</button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
