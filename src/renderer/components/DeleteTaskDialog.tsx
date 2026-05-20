import React from 'react';
import { Dialog } from '@base-ui/react/dialog';

type Props = {
	open: boolean;
	taskTitle: string;
	onConfirm: () => void;
	onCancel: () => void;
};

export function DeleteTaskDialog( {
	open,
	taskTitle,
	onConfirm,
	onCancel,
}: Props ): React.ReactElement {
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
					data-testid="delete-task-dialog"
				>
					<Dialog.Title className="dialog-title">
						Delete task
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						Delete “{ taskTitle }”? This removes the saved task and
						its schedule. Past runs are kept.
					</Dialog.Description>
					<div className="dialog-footer">
						<button
							type="button"
							className="dialog-button-secondary"
							data-testid="delete-task-cancel"
							onClick={ onCancel }
						>
							Cancel
						</button>
						<button
							type="button"
							className="dialog-button-danger"
							data-testid="delete-task-confirm"
							onClick={ onConfirm }
						>
							Delete
						</button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
