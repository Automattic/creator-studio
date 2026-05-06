import React from 'react';

import { CodeIcon, DownloadIcon, MarkdownIcon } from '../icons';

type Props = {
	body: string;
	relPath: string;
	projectId: string;
};

export function DraftSharePanel( {
	body,
	relPath,
	projectId,
}: Props ): React.ReactElement {
	const ready =
		body.length >= 0 && relPath.length > 0 && projectId.length > 0;
	return (
		<div className="draft-share-panel" data-testid="draft-share-panel">
			<div className="draft-share-actions">
				<button
					type="button"
					className="draft-share-action"
					data-testid="draft-share-action-copy-md"
					disabled={ ! ready }
				>
					<MarkdownIcon size={ 18 } />
					<span className="draft-share-action-label">
						Copy as Markdown
					</span>
				</button>
				<button
					type="button"
					className="draft-share-action"
					data-testid="draft-share-action-copy-html"
					disabled={ ! ready }
				>
					<CodeIcon size={ 18 } />
					<span className="draft-share-action-label">
						Copy as HTML
					</span>
				</button>
				<button
					type="button"
					className="draft-share-action"
					data-testid="draft-share-action-download-md"
					disabled={ ! ready }
				>
					<DownloadIcon size={ 18 } />
					<span className="draft-share-action-label">
						Download .md
					</span>
				</button>
			</div>
		</div>
	);
}
