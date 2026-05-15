import React from 'react';
import { Dialog } from '@base-ui/react/dialog';

type Props = {
	onConfirm: () => void;
	onCancel: () => void;
};

// Confirmation dialog for the destructive "Reset defaults" action. Spells
// out which files get overwritten so the user can't lose edits to the
// default checks by accident.
export function ResetChecksDefaultsDialog( {
	onConfirm,
	onCancel,
}: Props ): React.ReactElement {
	return (
		<Dialog.Root
			open={ true }
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
					data-testid="draft-checks-reset-dialog"
				>
					<Dialog.Title className="dialog-title">
						Replace bundled checks?
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						This replaces <strong>Grammar and spelling</strong>,{ ' ' }
						<strong>Brevity</strong>, and{ ' ' }
						<strong>Passive voice</strong> with the originals from
						this app. Any edits you made to those files will be
						lost. Other checks are not affected.
					</Dialog.Description>
					<div className="dialog-footer">
						<button
							type="button"
							className="dialog-button-secondary"
							data-testid="draft-checks-reset-cancel"
							onClick={ onCancel }
						>
							Cancel
						</button>
						<button
							type="button"
							className="dialog-button-danger"
							data-testid="draft-checks-reset-confirm"
							onClick={ onConfirm }
						>
							Replace defaults
						</button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
