import React, { useEffect, useRef, useState } from 'react';

import { MoreIcon } from '../icons';

// Overflow menu in the draft-editor titlebar. Single-instance and
// self-contained: it owns its own open state and outside-click / Escape
// handling, unlike ResourceActionMenu which delegates state to a parent
// managing many cards. Future actions extend the dropdown body here.
type Props = {
	onDelete: () => void;
};

export function DraftEditorActionMenu( {
	onDelete,
}: Props ): React.ReactElement {
	const [ open, setOpen ] = useState< boolean >( false );
	const wrapperRef = useRef< HTMLDivElement | null >( null );

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		const onKey = ( e: KeyboardEvent ): void => {
			if ( e.key === 'Escape' ) {
				setOpen( false );
			}
		};
		const onDocClick = ( e: MouseEvent ): void => {
			if (
				wrapperRef.current &&
				! wrapperRef.current.contains( e.target as Node )
			) {
				setOpen( false );
			}
		};
		document.addEventListener( 'keydown', onKey );
		document.addEventListener( 'mousedown', onDocClick );
		return () => {
			document.removeEventListener( 'keydown', onKey );
			document.removeEventListener( 'mousedown', onDocClick );
		};
	}, [ open ] );

	return (
		<div ref={ wrapperRef } className="draft-editor-action-menu-wrapper">
			<button
				type="button"
				className="draft-editor-action-menu-button"
				data-testid="draft-editor-more-button"
				aria-haspopup="menu"
				aria-expanded={ open }
				aria-label="Draft actions"
				onClick={ ( e ) => {
					e.stopPropagation();
					setOpen( ( prev ) => ! prev );
				} }
			>
				<MoreIcon size={ 14 } />
			</button>
			{ open && (
				<div
					className="draft-editor-action-menu"
					data-testid="draft-editor-more-menu"
					role="menu"
				>
					<button
						type="button"
						className="draft-editor-action-menu-item draft-editor-action-menu-item-danger"
						data-testid="draft-editor-action-delete"
						role="menuitem"
						onClick={ ( e ) => {
							e.stopPropagation();
							setOpen( false );
							onDelete();
						} }
					>
						Delete
					</button>
				</div>
			) }
		</div>
	);
}
