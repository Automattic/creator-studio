import React from 'react';
import { Dialog } from '@base-ui/react/dialog';

type Props = {
	pending: { name: string } | null;
	deleting: boolean;
	onConfirm: () => void;
	onCancel: () => void;
};

export function DeleteResourceDialog( {
	pending,
	deleting,
	onConfirm,
	onCancel,
}: Props ): React.ReactElement {
	const open = pending !== null;
	return (
		<Dialog.Root
			open={ open }
			onOpenChange={ ( isOpen ) => {
				if ( ! isOpen ) {
					onCancel();
				}
			} }
		>
			<Dialog.Portal>
				<Dialog.Backdrop className="dialog-backdrop" />
				<Dialog.Popup
					className="dialog-panel"
					data-testid="resource-delete-dialog"
				>
					<Dialog.Title className="dialog-title">
						Delete file
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						{ pending
							? `This will permanently remove “${ pending.name }” from disk. This can't be undone.`
							: '' }
					</Dialog.Description>
					<div className="dialog-footer">
						<button
							type="button"
							className="dialog-button-secondary"
							data-testid="resource-delete-cancel"
							onClick={ onCancel }
							disabled={ deleting }
						>
							Cancel
						</button>
						<button
							type="button"
							className="dialog-button-danger"
							data-testid="resource-delete-confirm"
							onClick={ onConfirm }
							disabled={ deleting }
						>
							{ deleting ? 'Deleting…' : 'Delete' }
						</button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
