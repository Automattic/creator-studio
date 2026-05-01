import React from 'react';

type Props = {
	projectId: string;
	relPath: string;
	title: string;
	onBack: () => void;
};

export function DraftEditorScreen( {
	title,
	onBack,
}: Props ): React.ReactElement {
	return (
		<section
			className="draft-editor-screen"
			data-testid="screen-draft-editor"
			aria-label="Draft editor"
		>
			<header className="draft-editor-header">
				<button
					type="button"
					className="draft-editor-back"
					data-testid="draft-editor-back"
					onClick={ onBack }
				>
					← Drafts
				</button>
				<h1
					className="draft-editor-title"
					data-testid="draft-editor-title"
				>
					{ title }
				</h1>
				<span
					className="draft-editor-status"
					data-testid="draft-editor-status"
					data-state="idle"
				/>
			</header>
			<div className="draft-editor-host" data-testid="draft-editor-host">
				Editor goes here
			</div>
		</section>
	);
}
