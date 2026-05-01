import React, { useEffect, useState } from 'react';

import { redo, undo } from '@codemirror/commands';
import type { Command, EditorView } from '@codemirror/view';

import {
	applyBold,
	applyInlineCode,
	applyItalic,
	applyLink,
	applyStrikethrough,
	clearInlineFormatting,
	inlineFormatAt,
	insertHr,
	toggleQuote,
	type InlineFormatFlags,
} from './markdown-keymap';

type Props = {
	view: EditorView | null;
	visible: boolean;
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
}: Props ): React.ReactElement | null {
	const [ formats, setFormats ] = useState< InlineFormatFlags >(
		() => NO_FORMATS
	);

	useEffect( () => {
		if ( ! view || ! visible ) {
			return;
		}
		setFormats( inlineFormatAt( view, view.state.selection.main.head ) );
	}, [ view, visible ] );

	if ( ! view ) {
		return null;
	}
	return (
		<div
			className="draft-editor-toolbar"
			data-testid="draft-editor-toolbar"
			data-visible={ visible ? 'true' : 'false' }
			role="toolbar"
			aria-label="Formatting"
		>
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
				label="Horizontal rule"
				onMouseDown={ bindButton( view, insertHr ) }
				testid="toolbar-hr"
			>
				<HrIcon />
			</ToolbarButton>
			<ToolbarButton
				label="Clear formatting"
				onMouseDown={ bindButton( view, clearInlineFormatting ) }
				testid="toolbar-clear"
			>
				<ClearIcon />
			</ToolbarButton>
			<Separator />
			<ToolbarButton
				label="Undo"
				shortcut="⌘Z"
				onMouseDown={ bindButton( view, undo ) }
				testid="toolbar-undo"
			>
				<UndoIcon />
			</ToolbarButton>
			<ToolbarButton
				label="Redo"
				shortcut="⌘⇧Z"
				onMouseDown={ bindButton( view, redo ) }
				testid="toolbar-redo"
			>
				<RedoIcon />
			</ToolbarButton>
		</div>
	);
}

function ToolbarButton( {
	label,
	shortcut,
	active,
	onMouseDown,
	testid,
	children,
}: {
	label: string;
	shortcut?: string;
	active?: boolean;
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

function HrIcon(): React.ReactElement {
	return (
		<svg { ...ICON_PROPS }>
			<path d="M3 10h14" />
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
