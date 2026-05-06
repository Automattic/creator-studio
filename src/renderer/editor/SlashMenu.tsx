import React, { useEffect, useRef, useState } from 'react';

export type SlashAction = 'image' | 'quote' | 'h1' | 'h2' | 'h3' | 'h4';

type Action = {
	id: SlashAction;
	icon: string;
	label: string;
};

const ACTIONS: readonly Action[] = [
	{ id: 'image', icon: '🖼', label: 'Image' },
	{ id: 'quote', icon: '"', label: 'Quote' },
	{ id: 'h1', icon: 'H₁', label: 'Heading 1' },
	{ id: 'h2', icon: 'H₂', label: 'Heading 2' },
	{ id: 'h3', icon: 'H₃', label: 'Heading 3' },
	{ id: 'h4', icon: 'H₄', label: 'Heading 4' },
];

export type SlashMenuPosition = { top: number; left: number };

type Props = {
	open: boolean;
	position: SlashMenuPosition | null;
	onSelect: ( action: SlashAction ) => void;
	onClose: () => void;
};

// The menu owns its own keyboard nav (Up/Down/Enter/Escape). We listen on
// `window` in capture phase + stopPropagation so the editor's keymap never
// sees those keys while the menu is open — otherwise Escape would close the
// editor and Enter would insert a newline.
export function SlashMenu( {
	open,
	position,
	onSelect,
	onClose,
}: Props ): React.ReactElement | null {
	const menuRef = useRef< HTMLDivElement | null >( null );
	const [ activeIndex, setActiveIndex ] = useState< number >( 0 );

	useEffect( () => {
		if ( open ) {
			setActiveIndex( 0 );
		}
	}, [ open ] );

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		const onMouseDown = ( e: MouseEvent ): void => {
			if (
				menuRef.current &&
				! menuRef.current.contains( e.target as Node )
			) {
				onClose();
			}
		};
		const onKeyDown = ( e: KeyboardEvent ): void => {
			if ( e.key === 'ArrowDown' ) {
				e.preventDefault();
				e.stopPropagation();
				setActiveIndex( ( i ) => ( i + 1 ) % ACTIONS.length );
				return;
			}
			if ( e.key === 'ArrowUp' ) {
				e.preventDefault();
				e.stopPropagation();
				setActiveIndex(
					( i ) => ( i - 1 + ACTIONS.length ) % ACTIONS.length
				);
				return;
			}
			if ( e.key === 'Enter' ) {
				e.preventDefault();
				e.stopPropagation();
				onSelect( ACTIONS[ activeIndex ].id );
				return;
			}
			if ( e.key === 'Escape' ) {
				e.preventDefault();
				e.stopPropagation();
				onClose();
				return;
			}
			// Modifier-only keys never close the menu.
			if (
				e.key === 'Shift' ||
				e.key === 'Meta' ||
				e.key === 'Alt' ||
				e.key === 'Control'
			) {
				return;
			}
			// Any other key dismisses the menu and falls through to CM —
			// typing a letter on the empty line is the natural exit path.
			onClose();
		};
		const onResize = (): void => onClose();
		window.addEventListener( 'mousedown', onMouseDown );
		window.addEventListener( 'keydown', onKeyDown, { capture: true } );
		window.addEventListener( 'resize', onResize );
		return () => {
			window.removeEventListener( 'mousedown', onMouseDown );
			window.removeEventListener( 'keydown', onKeyDown, {
				capture: true,
			} );
			window.removeEventListener( 'resize', onResize );
		};
	}, [ open, onClose, onSelect, activeIndex ] );

	if ( ! open || ! position ) {
		return null;
	}

	// Conservative clamp; precise sizing would need post-mount measurement.
	const menuWidth = 240;
	const menuHeight = ACTIONS.length * 32 + 12;
	const left = Math.min(
		position.left,
		Math.max( 8, window.innerWidth - menuWidth - 8 )
	);
	const top = Math.min(
		position.top,
		Math.max( 8, window.innerHeight - menuHeight - 8 )
	);

	return (
		<div
			ref={ menuRef }
			className="slash-menu"
			data-testid="slash-menu"
			role="menu"
			style={ { top, left } }
		>
			<ul className="slash-menu-list">
				{ ACTIONS.map( ( a, i ) => (
					<li key={ a.id }>
						<button
							type="button"
							className="slash-menu-action"
							data-testid={ `slash-menu-action-${ a.id }` }
							data-active={ i === activeIndex || undefined }
							onMouseEnter={ () => setActiveIndex( i ) }
							onClick={ () => onSelect( a.id ) }
						>
							<span
								className="slash-menu-action-glyph"
								aria-hidden="true"
							>
								{ a.icon }
							</span>
							<span>{ a.label }</span>
						</button>
					</li>
				) ) }
			</ul>
		</div>
	);
}
