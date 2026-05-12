import React from 'react';

import { MoreIcon } from '../icons';

// Controlled action menu for a resource card. Drafts get the full set
// (Edit / Add to chat / Open new chat / Delete); source markdown adds
// Rename; everything else gets the subset whose handlers are supplied.
// Each action is optional — items render only when their handler is
// provided. The open/close state lives in the parent so opening one card's
// menu auto-closes any other open menu in the same surface (see ResourcesGrid's
// `openMenuId` plus its Escape / outside-click effect, which also owns the ref
// handed in here).
type Props = {
	menuId: string;
	openMenuId: string | null;
	setOpenMenuId: ( id: string | null ) => void;
	menuRef: React.MutableRefObject< HTMLDivElement | null >;
	buttonTestId: string;
	ariaLabel: string;
	onEdit?: () => void;
	onAddToChat?: () => void;
	onOpenNewChat?: () => void;
	// "Add to chat" requires an active chat to attach to. The parent flips
	// this on when there's no active chat so the item still renders (so users
	// see it exists) but can't be invoked.
	addToChatDisabled?: boolean;
	onRename?: () => void;
	onDelete?: () => void;
};

export function ResourceActionMenu( {
	menuId,
	openMenuId,
	setOpenMenuId,
	menuRef,
	buttonTestId,
	ariaLabel,
	onEdit,
	onAddToChat,
	onOpenNewChat,
	addToChatDisabled,
	onRename,
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
					data-testid="resource-action-menu"
					role="menu"
				>
					{ onEdit && (
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
					) }
					{ onAddToChat && (
						<button
							type="button"
							className="resources-grid-card-menu-item"
							data-testid="draft-action-add-to-chat"
							role="menuitem"
							disabled={ addToChatDisabled }
							aria-disabled={ addToChatDisabled }
							title={
								addToChatDisabled
									? 'Open a chat first to attach this file'
									: undefined
							}
							onClick={ ( e ) => {
								e.stopPropagation();
								if ( addToChatDisabled ) {
									return;
								}
								setOpenMenuId( null );
								onAddToChat();
							} }
						>
							Add to chat
						</button>
					) }
					{ onOpenNewChat && (
						<button
							type="button"
							className="resources-grid-card-menu-item"
							data-testid="draft-action-new-chat"
							role="menuitem"
							onClick={ ( e ) => {
								e.stopPropagation();
								setOpenMenuId( null );
								onOpenNewChat();
							} }
						>
							Open new chat
						</button>
					) }
					{ onRename && (
						<button
							type="button"
							className="resources-grid-card-menu-item"
							data-testid="resource-action-rename"
							role="menuitem"
							onClick={ ( e ) => {
								e.stopPropagation();
								setOpenMenuId( null );
								onRename();
							} }
						>
							Rename
						</button>
					) }
					{ onDelete && (
						<button
							type="button"
							className="resources-grid-card-menu-item resources-grid-card-menu-item-danger"
							data-testid="resource-action-delete"
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
