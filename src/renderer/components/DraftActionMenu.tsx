import React from 'react';

import { MoreIcon } from '../icons';

// Controlled action menu for a draft (Edit / Chat / optional Delete). The
// open/close state lives in the parent so that opening one draft's menu can
// auto-close any other open menu in the same surface — see ResourcesGrid's
// `openMenuId` plus its Escape / outside-click effect, which also owns the
// ref handed in here.
type Props = {
	menuId: string;
	openMenuId: string | null;
	setOpenMenuId: ( id: string | null ) => void;
	menuRef: React.MutableRefObject< HTMLDivElement | null >;
	buttonTestId: string;
	ariaLabel: string;
	onEdit: () => void;
	onChat: () => void;
	onDelete?: () => void;
};

export function DraftActionMenu( {
	menuId,
	openMenuId,
	setOpenMenuId,
	menuRef,
	buttonTestId,
	ariaLabel,
	onEdit,
	onChat,
	onDelete,
}: Props ): React.ReactElement {
	const isOpen = openMenuId === menuId;
	return (
		<>
			<button
				type="button"
				className="resources-grid-card-menu-button"
				data-testid={ buttonTestId }
				aria-haspopup="menu"
				aria-expanded={ isOpen }
				aria-label={ ariaLabel }
				onClick={ ( e ) => {
					e.stopPropagation();
					setOpenMenuId( isOpen ? null : menuId );
				} }
			>
				<MoreIcon size={ 14 } />
			</button>
			{ isOpen && (
				<div
					ref={ menuRef }
					className="resources-grid-card-menu"
					data-testid="draft-action-menu"
					role="menu"
				>
					<button
						type="button"
						className="resources-grid-card-menu-item"
						data-testid="draft-action-edit"
						role="menuitem"
						onClick={ ( e ) => {
							e.stopPropagation();
							setOpenMenuId( null );
							onEdit();
						} }
					>
						Edit
					</button>
					<button
						type="button"
						className="resources-grid-card-menu-item"
						data-testid="draft-action-chat"
						role="menuitem"
						onClick={ ( e ) => {
							e.stopPropagation();
							setOpenMenuId( null );
							onChat();
						} }
					>
						Chat
					</button>
					{ onDelete && (
						<button
							type="button"
							className="resources-grid-card-menu-item resources-grid-card-menu-item-danger"
							data-testid="draft-action-delete"
							role="menuitem"
							onClick={ ( e ) => {
								e.stopPropagation();
								setOpenMenuId( null );
								onDelete();
							} }
						>
							Delete
						</button>
					) }
				</div>
			) }
		</>
	);
}
