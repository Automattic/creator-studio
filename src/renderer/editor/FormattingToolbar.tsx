import React from 'react';

import type { EditorView } from '@codemirror/view';

type Props = {
	view: EditorView | null;
	visible: boolean;
};

// Step 3 ships the empty shell. The buttons land in Step 4 (inline +
// misc) and Step 5 (format-block dropdown). The whole thing renders only
// when there is a non-empty selection — the shell itself stays mounted
// (display: none rather than unmount) so internal state survives rapid
// selection changes when buttons get added.
export function FormattingToolbar( {
	view,
	visible,
}: Props ): React.ReactElement | null {
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
			{ /* Buttons land in Step 4 + Step 5. */ }
		</div>
	);
}
