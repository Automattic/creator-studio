import React, { useEffect, useRef, useState } from 'react';

export type SlashAction = 'image' | 'quote' | 'h1' | 'h2' | 'h3' | 'h4';

type Action = {
	id: SlashAction;
	Icon: () => React.ReactElement;
	label: string;
	hint: string;
};

// Lucide-style icon defaults — same geometry conventions as the
// FormattingToolbar so the slash menu reads as part of the same family.
const ICON_PROPS = {
	width: 18,
	height: 18,
	viewBox: '0 0 24 24',
	fill: 'none',
	stroke: 'currentColor',
	strokeWidth: 2,
	strokeLinecap: 'round' as const,
	strokeLinejoin: 'round' as const,
	'aria-hidden': true,
};

function ImageIcon(): React.ReactElement {
	return (
		<svg { ...ICON_PROPS }>
			<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
			<circle cx="9" cy="9" r="2" />
			<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
		</svg>
	);
}

function QuoteIcon(): React.ReactElement {
	return (
		<svg { ...ICON_PROPS }>
			<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
			<path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
		</svg>
	);
}

// Heading paths mirror FormattingToolbar's HEADING_PATHS so the visual
// language stays identical between the toolbar's block-style dropdown
// and the slash menu.
const HEADING_PATHS: Record< 1 | 2 | 3 | 4, React.ReactNode > = {
	1: (
		<>
			<path d="M4 12h8" />
			<path d="M4 18V6" />
			<path d="M12 18V6" />
			<path d="m17 12 3-2v8" />
		</>
	),
	2: (
		<>
			<path d="M4 12h8" />
			<path d="M4 18V6" />
			<path d="M12 18V6" />
			<path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" />
		</>
	),
	3: (
		<>
			<path d="M4 12h8" />
			<path d="M4 18V6" />
			<path d="M12 18V6" />
			<path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2" />
			<path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2" />
		</>
	),
	4: (
		<>
			<path d="M4 12h8" />
			<path d="M4 18V6" />
			<path d="M12 18V6" />
			<path d="M17 10v4h4" />
			<path d="M21 10v8" />
		</>
	),
};

function HeadingIcon( {
	level,
}: {
	level: 1 | 2 | 3 | 4;
} ): React.ReactElement {
	return <svg { ...ICON_PROPS }>{ HEADING_PATHS[ level ] }</svg>;
}

const ACTIONS: readonly Action[] = [
	{ id: 'image', Icon: ImageIcon, label: 'Image', hint: 'Embed a picture' },
	{
		id: 'quote',
		Icon: QuoteIcon,
		label: 'Quote',
		hint: 'Highlight a passage',
	},
	{
		id: 'h1',
		Icon: () => <HeadingIcon level={ 1 } />,
		label: 'Heading 1',
		hint: 'Big section title',
	},
	{
		id: 'h2',
		Icon: () => <HeadingIcon level={ 2 } />,
		label: 'Heading 2',
		hint: 'Medium section title',
	},
	{
		id: 'h3',
		Icon: () => <HeadingIcon level={ 3 } />,
		label: 'Heading 3',
		hint: 'Small section title',
	},
	{
		id: 'h4',
		Icon: () => <HeadingIcon level={ 4 } />,
		label: 'Heading 4',
		hint: 'Sub-section title',
	},
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
	const menuWidth = 280;
	const menuHeight = ACTIONS.length * 44 + 12;
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
				{ ACTIONS.map( ( a, i ) => {
					const Icon = a.Icon;
					return (
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
									<Icon />
								</span>
								<span className="slash-menu-action-text">
									<span className="slash-menu-action-label">
										{ a.label }
									</span>
									<span className="slash-menu-action-hint">
										{ a.hint }
									</span>
								</span>
							</button>
						</li>
					);
				} ) }
			</ul>
		</div>
	);
}
