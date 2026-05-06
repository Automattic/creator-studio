import React, { useCallback, useEffect, useRef, useState } from 'react';

import { redo, undo } from '@codemirror/commands';
import type { Command, EditorView } from '@codemirror/view';

import {
	applyBold,
	applyInlineCode,
	applyItalic,
	applyLink,
	applyStrikethrough,
	blockLabel,
	blockStyleAt,
	clearInlineFormatting,
	inlineFormatAt,
	setParagraph,
	toggleBulletList,
	toggleHeading,
	toggleNumberedList,
	toggleQuote,
	toggleTaskList,
	type BlockStyle,
	type InlineFormatFlags,
} from './markdown-keymap';

type Props = {
	view: EditorView | null;
	visible: boolean;
	canUndo: boolean;
	canRedo: boolean;
};

// `onMouseDown` (not `onClick`) preserves the editor selection — by the
// time `click` would fire, focus has already left the editor and the
// selection has collapsed. We `preventDefault()` to keep focus where it
// is, dispatch the command, and re-focus the view afterwards so the
// caret stays visible.
function bindButton(
	view: EditorView | null,
	command: Command
): ( e: React.MouseEvent ) => void {
	return ( e ) => {
		if ( ! view ) {
			return;
		}
		e.preventDefault();
		command( view );
		view.focus();
	};
}

const NO_FORMATS: InlineFormatFlags = {
	bold: false,
	italic: false,
	strikethrough: false,
	code: false,
	link: false,
};

export function FormattingToolbar( {
	view,
	visible,
	canUndo,
	canRedo,
}: Props ): React.ReactElement | null {
	const [ formats, setFormats ] = useState< InlineFormatFlags >(
		() => NO_FORMATS
	);
	const [ blockStyle, setBlockStyle ] = useState< BlockStyle >( 'paragraph' );

	useEffect( () => {
		if ( ! view || ! visible ) {
			return;
		}
		const head = view.state.selection.main.head;
		setFormats( inlineFormatAt( view, head ) );
		setBlockStyle( blockStyleAt( view, head ) );
	}, [ view, visible ] );

	if ( ! view ) {
		return null;
	}
	return (
		<div
			className="draft-editor-toolbar"
			data-testid="draft-editor-toolbar"
			role="toolbar"
			aria-label="Formatting"
		>
			<ToolbarButton
				label="Undo"
				shortcut="⌘Z"
				disabled={ ! canUndo }
				onMouseDown={ bindButton( view, undo ) }
				testid="toolbar-undo"
			>
				<UndoIcon />
			</ToolbarButton>
			<ToolbarButton
				label="Redo"
				shortcut="⌘⇧Z"
				disabled={ ! canRedo }
				onMouseDown={ bindButton( view, redo ) }
				testid="toolbar-redo"
			>
				<RedoIcon />
			</ToolbarButton>
			<div
				className="draft-editor-toolbar-formatting"
				data-testid="draft-editor-toolbar-formatting"
				data-visible={ visible ? 'true' : 'false' }
			>
				<Separator />
				<BlockStyleDropdown view={ view } current={ blockStyle } />
				<Separator />
				<ToolbarButton
					label="Bold"
					shortcut="⌘B"
					active={ formats.bold }
					onMouseDown={ bindButton( view, applyBold ) }
					testid="toolbar-bold"
				>
					<BoldIcon />
				</ToolbarButton>
				<ToolbarButton
					label="Italic"
					shortcut="⌘I"
					active={ formats.italic }
					onMouseDown={ bindButton( view, applyItalic ) }
					testid="toolbar-italic"
				>
					<ItalicIcon />
				</ToolbarButton>
				<ToolbarButton
					label="Strikethrough"
					active={ formats.strikethrough }
					onMouseDown={ bindButton( view, applyStrikethrough ) }
					testid="toolbar-strike"
				>
					<StrikeIcon />
				</ToolbarButton>
				<Separator />
				<ToolbarButton
					label="Link"
					shortcut="⌘K"
					active={ formats.link }
					onMouseDown={ bindButton( view, applyLink ) }
					testid="toolbar-link"
				>
					<LinkIcon />
				</ToolbarButton>
				<ToolbarButton
					label="Inline code"
					active={ formats.code }
					onMouseDown={ bindButton( view, applyInlineCode ) }
					testid="toolbar-code"
				>
					<CodeIcon />
				</ToolbarButton>
				<ToolbarButton
					label="Quote"
					onMouseDown={ bindButton( view, toggleQuote ) }
					testid="toolbar-quote"
				>
					<QuoteIcon />
				</ToolbarButton>
				<Separator />
				<ToolbarButton
					label="Clear formatting"
					onMouseDown={ bindButton( view, clearInlineFormatting ) }
					testid="toolbar-clear"
				>
					<ClearIcon />
				</ToolbarButton>
			</div>
		</div>
	);
}

function ToolbarButton( {
	label,
	shortcut,
	active,
	disabled,
	onMouseDown,
	testid,
	children,
}: {
	label: string;
	shortcut?: string;
	active?: boolean;
	disabled?: boolean;
	onMouseDown: ( e: React.MouseEvent ) => void;
	testid: string;
	children: React.ReactNode;
} ): React.ReactElement {
	const title = shortcut ? `${ label } (${ shortcut })` : label;
	return (
		<button
			type="button"
			aria-label={ label }
			aria-pressed={ active ? 'true' : undefined }
			data-active={ active ? 'true' : undefined }
			data-testid={ testid }
			title={ title }
			disabled={ disabled }
			onMouseDown={ onMouseDown }
		>
			{ children }
		</button>
	);
}

function Separator(): React.ReactElement {
	return (
		<span
			className="draft-editor-toolbar-sep"
			role="separator"
			aria-hidden="true"
		/>
	);
}

const BLOCK_OPTIONS: Array< {
	id: BlockStyle;
	run: Command;
	icon: () => React.ReactElement;
} > = [
	{ id: 'paragraph', run: setParagraph, icon: ParagraphIcon },
	{
		id: 'h1',
		run: toggleHeading( 1 ),
		icon: () => <HeadingIcon level={ 1 } />,
	},
	{
		id: 'h2',
		run: toggleHeading( 2 ),
		icon: () => <HeadingIcon level={ 2 } />,
	},
	{
		id: 'h3',
		run: toggleHeading( 3 ),
		icon: () => <HeadingIcon level={ 3 } />,
	},
	{
		id: 'h4',
		run: toggleHeading( 4 ),
		icon: () => <HeadingIcon level={ 4 } />,
	},
	{ id: 'bullet', run: toggleBulletList, icon: BulletListIcon },
	{ id: 'ordered', run: toggleNumberedList, icon: NumberedListIcon },
	{ id: 'task', run: toggleTaskList, icon: TodoListIcon },
];

function BlockStyleDropdown( {
	view,
	current,
}: {
	view: EditorView;
	current: BlockStyle;
} ): React.ReactElement {
	const [ open, setOpen ] = useState( false );
	const wrapRef = useRef< HTMLDivElement | null >( null );

	const close = useCallback( (): void => setOpen( false ), [] );

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		const onMouseDown = ( e: MouseEvent ): void => {
			if (
				wrapRef.current &&
				! wrapRef.current.contains( e.target as Node )
			) {
				close();
			}
		};
		const onKey = ( e: KeyboardEvent ): void => {
			if ( e.key === 'Escape' ) {
				close();
			}
		};
		window.addEventListener( 'mousedown', onMouseDown );
		window.addEventListener( 'keydown', onKey );
		return () => {
			window.removeEventListener( 'mousedown', onMouseDown );
			window.removeEventListener( 'keydown', onKey );
		};
	}, [ open, close ] );

	const label = blockLabel( current );
	const currentOption = BLOCK_OPTIONS.find( ( opt ) => opt.id === current );
	// Fall back to the paragraph glyph for block styles not in the menu
	// (h5/h6, quote, code) so the trigger always shows something sensible.
	const TriggerIcon = currentOption?.icon ?? ParagraphIcon;

	return (
		<div ref={ wrapRef } className="draft-editor-toolbar-block">
			<button
				type="button"
				className="draft-editor-toolbar-block-trigger"
				data-testid="toolbar-block-trigger"
				aria-haspopup="menu"
				aria-expanded={ open ? 'true' : 'false' }
				aria-label={ `Block style: ${ label }` }
				title={ label }
				onMouseDown={ ( e ) => {
					e.preventDefault();
					setOpen( ( v ) => ! v );
				} }
			>
				<TriggerIcon />
				<ChevronIcon />
			</button>
			{ open && (
				<div
					className="draft-editor-toolbar-block-menu"
					data-testid="toolbar-block-menu"
					role="menu"
				>
					{ BLOCK_OPTIONS.map( ( opt ) => {
						const Icon = opt.icon;
						return (
							<button
								key={ opt.id }
								type="button"
								role="menuitem"
								data-active={
									opt.id === current ? 'true' : undefined
								}
								data-testid={ `toolbar-block-${ opt.id }` }
								onMouseDown={ ( e ) => {
									e.preventDefault();
									opt.run( view );
									view.focus();
									setOpen( false );
								} }
							>
								<span className="draft-editor-toolbar-block-icon">
									<Icon />
								</span>
								<span className="draft-editor-toolbar-block-label">
									{ blockLabel( opt.id ) }
								</span>
								<span className="draft-editor-toolbar-block-check">
									{ opt.id === current ? '✓' : '' }
								</span>
							</button>
						);
					} ) }
				</div>
			) }
		</div>
	);
}

function ChevronIcon(): React.ReactElement {
	return (
		<svg { ...ICON_PROPS } width={ 12 } height={ 12 }>
			<path d="m6 8 4 4 4-4" />
		</svg>
	);
}

const ICON_PROPS = {
	width: 16,
	height: 16,
	viewBox: '0 0 20 20',
	fill: 'none',
	stroke: 'currentColor',
	strokeWidth: 1.5,
	strokeLinecap: 'round' as const,
	strokeLinejoin: 'round' as const,
	'aria-hidden': true,
};

function BoldIcon(): React.ReactElement {
	return (
		<svg { ...ICON_PROPS }>
			<path d="M6 4h5.5a2.5 2.5 0 0 1 0 5H6Z" />
			<path d="M6 9h6.5a2.5 2.5 0 0 1 0 5H6Z" />
		</svg>
	);
}

function ItalicIcon(): React.ReactElement {
	return (
		<svg { ...ICON_PROPS }>
			<path d="M11.5 4 8 16" />
			<path d="M9 4h5" />
			<path d="M6 16h5" />
		</svg>
	);
}

function StrikeIcon(): React.ReactElement {
	return (
		<svg { ...ICON_PROPS }>
			<path d="M3 10h14" />
			<path d="M14 6a4 4 0 0 0-4-2c-2 0-4 1-4 3 0 1 .5 2 2 2.5" />
			<path d="M6 14a4 4 0 0 0 4 2c2 0 4-1 4-3" />
		</svg>
	);
}

function LinkIcon(): React.ReactElement {
	return (
		<svg { ...ICON_PROPS }>
			<path d="M9 11a3 3 0 0 0 4 0l2-2a3 3 0 0 0-4-4l-1 1" />
			<path d="M11 9a3 3 0 0 0-4 0l-2 2a3 3 0 0 0 4 4l1-1" />
		</svg>
	);
}

function CodeIcon(): React.ReactElement {
	return (
		<svg { ...ICON_PROPS }>
			<path d="m7 6-4 4 4 4" />
			<path d="m13 6 4 4-4 4" />
		</svg>
	);
}

function QuoteIcon(): React.ReactElement {
	return (
		<svg { ...ICON_PROPS }>
			<path d="M5 6v8" />
			<path d="M9 7h8" />
			<path d="M9 10h8" />
			<path d="M9 13h6" />
		</svg>
	);
}

function ClearIcon(): React.ReactElement {
	return (
		<svg { ...ICON_PROPS }>
			<path d="M5 4h11" />
			<path d="m13 4-4 12" />
			<path d="M3 16h6" />
			<path d="m14 12 4 4" />
			<path d="m18 12-4 4" />
		</svg>
	);
}

function UndoIcon(): React.ReactElement {
	return (
		<svg { ...ICON_PROPS }>
			<path d="M3 8h9a4 4 0 0 1 0 8h-3" />
			<path d="m6 5-3 3 3 3" />
		</svg>
	);
}

function RedoIcon(): React.ReactElement {
	return (
		<svg { ...ICON_PROPS }>
			<path d="M17 8H8a4 4 0 0 0 0 8h3" />
			<path d="m14 5 3 3-3 3" />
		</svg>
	);
}

// Block-style menu icons. SVG paths copied from Lucide (lucide.dev,
// MIT-licensed) so the geometry is professionally drawn rather than
// hand-rolled. ViewBox 24x24 with stroke-width 2 is Lucide's standard.
const LUCIDE_PROPS = {
	width: 16,
	height: 16,
	viewBox: '0 0 24 24',
	fill: 'none',
	stroke: 'currentColor',
	strokeWidth: 2,
	strokeLinecap: 'round' as const,
	strokeLinejoin: 'round' as const,
	'aria-hidden': true,
};

function ParagraphIcon(): React.ReactElement {
	return (
		<svg { ...LUCIDE_PROPS }>
			<path d="M13 4v16" />
			<path d="M17 4v16" />
			<path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13" />
		</svg>
	);
}

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
	return <svg { ...LUCIDE_PROPS }>{ HEADING_PATHS[ level ] }</svg>;
}

function BulletListIcon(): React.ReactElement {
	return (
		<svg { ...LUCIDE_PROPS }>
			<path d="M3 12h.01" />
			<path d="M3 18h.01" />
			<path d="M3 6h.01" />
			<path d="M8 12h13" />
			<path d="M8 18h13" />
			<path d="M8 6h13" />
		</svg>
	);
}

function NumberedListIcon(): React.ReactElement {
	return (
		<svg { ...LUCIDE_PROPS }>
			<path d="M10 12h11" />
			<path d="M10 18h11" />
			<path d="M10 6h11" />
			<path d="M4 10h2" />
			<path d="M4 6h1v4" />
			<path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
		</svg>
	);
}

function TodoListIcon(): React.ReactElement {
	return (
		<svg { ...LUCIDE_PROPS }>
			<rect x="3" y="5" width="6" height="6" rx="1" />
			<path d="m3 17 2 2 4-4" />
			<path d="M13 6h8" />
			<path d="M13 12h8" />
			<path d="M13 18h8" />
		</svg>
	);
}
