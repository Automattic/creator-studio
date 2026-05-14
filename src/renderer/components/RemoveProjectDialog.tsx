import React from 'react';
import { Dialog } from '@base-ui/react/dialog';

type Props = {
	open: boolean;
	projectName: string;
	projectPath: string;
	busy: boolean;
	error: 'io-error' | null;
	onConfirm: () => void;
	onCancel: () => void;
};

export function RemoveProjectDialog( {
	open,
	projectName,
	projectPath,
	busy,
	error,
	onConfirm,
	onCancel,
}: Props ): React.ReactElement {
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
					data-testid="remove-project-dialog"
				>
					<Dialog.Title className="dialog-title">
						Remove project from app
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						<strong>{ projectName }</strong> will no longer appear
						here. The folder on your disk ({ ' ' }
						<code>{ projectPath }</code> ) is left untouched —
						re-add it any time with <strong>Add project</strong>.
					</Dialog.Description>
					{ error === 'io-error' && (
						<p
							className="dialog-error"
							data-testid="remove-project-error"
						>
							Couldn’t remove the project — try again.
						</p>
					) }
					<div className="dialog-footer">
						<button
							type="button"
							className="dialog-button-secondary"
							data-testid="remove-project-cancel"
							onClick={ onCancel }
							disabled={ busy }
						>
							Cancel
						</button>
						<button
							type="button"
							className="dialog-button-danger"
							data-testid="remove-project-confirm"
							onClick={ onConfirm }
							disabled={ busy }
						>
							{ busy ? 'Removing…' : 'Remove' }
						</button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
