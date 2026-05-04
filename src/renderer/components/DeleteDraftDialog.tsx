import React from 'react';
import { Dialog } from '@base-ui/react/dialog';

type Props = {
	pending: { relPath: string; name: string } | null;
	deleting: boolean;
	onConfirm: () => void;
	onCancel: () => void;
};

export function DeleteDraftDialog( {
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
					data-testid="draft-delete-dialog"
				>
					<Dialog.Title className="dialog-title">
						Delete draft
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
							data-testid="draft-delete-cancel"
							onClick={ onCancel }
							disabled={ deleting }
						>
							Cancel
						</button>
						<button
							type="button"
							className="dialog-button-danger"
							data-testid="draft-delete-confirm"
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
