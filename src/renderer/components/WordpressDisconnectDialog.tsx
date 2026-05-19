import React from 'react';
import { Dialog } from '@base-ui/react/dialog';

export type WordpressDisconnectPending =
	| { kind: 'site'; id: string; label: string }
	| {
			kind: 'account';
			accountId: number;
			username: string;
			siteCount: number;
	  };

type Props = {
	pending: WordpressDisconnectPending | null;
	working: boolean;
	onConfirm: () => void;
	onCancel: () => void;
};

function describe( pending: WordpressDisconnectPending ): {
	title: string;
	body: string;
	confirmLabel: string;
	pendingLabel: string;
} {
	if ( pending.kind === 'site' ) {
		return {
			title: 'Disconnect site',
			body: `Studio Write will no longer be able to publish to or import from “${ pending.label }”. Existing drafts stay where they are.`,
			confirmLabel: 'Disconnect',
			pendingLabel: 'Disconnecting…',
		};
	}
	const sites =
		pending.siteCount === 1 ? '1 site' : `${ pending.siteCount } sites`;
	return {
		title: `Disconnect ${ pending.username }'s sites`,
		body: `This removes ${ sites } that were added with ${ pending.username }'s WordPress.com account. Existing drafts stay where they are.`,
		confirmLabel: 'Disconnect all',
		pendingLabel: 'Disconnecting…',
	};
}

export function WordpressDisconnectDialog( {
	pending,
	working,
	onConfirm,
	onCancel,
}: Props ): React.ReactElement {
	const open = pending !== null;
	const copy = pending
		? describe( pending )
		: {
				title: '',
				body: '',
				confirmLabel: 'Disconnect',
				pendingLabel: 'Disconnecting…',
		  };
	return (
		<Dialog.Root
			open={ open }
			onOpenChange={ ( isOpen ) => {
				if ( ! isOpen && ! working ) {
					onCancel();
				}
			} }
		>
			<Dialog.Portal>
				<Dialog.Backdrop className="dialog-backdrop" />
				<Dialog.Popup
					className="dialog-panel"
					data-testid="wordpress-disconnect-dialog"
				>
					<Dialog.Title className="dialog-title">
						{ copy.title }
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						{ copy.body }
					</Dialog.Description>
					<div className="dialog-footer">
						<button
							type="button"
							className="dialog-button-secondary"
							data-testid="wordpress-disconnect-cancel"
							onClick={ onCancel }
							disabled={ working }
						>
							Cancel
						</button>
						<button
							type="button"
							className="dialog-button-danger"
							data-testid="wordpress-disconnect-confirm"
							onClick={ onConfirm }
							disabled={ working }
						>
							{ working ? copy.pendingLabel : copy.confirmLabel }
						</button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
