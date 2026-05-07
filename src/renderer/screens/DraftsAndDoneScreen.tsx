import React from 'react';

import { DoneScreen } from './DoneScreen';
import { DraftsScreen } from './DraftsScreen';

export type LibraryTab = 'drafts' | 'done';

type Props = {
	tab: LibraryTab;
	onSelectTab: ( tab: LibraryTab ) => void;
	onSelectProject: ( projectId: string ) => void;
	onOpenDraft: ( draft: {
		projectId: string;
		relPath: string;
		title: string;
		folder?: 'drafts' | 'done';
	} ) => void;
};

export function DraftsAndDoneScreen( {
	tab,
	onSelectTab,
	onSelectProject,
	onOpenDraft,
}: Props ): React.ReactElement {
	return (
		<div className="library-screen" data-testid="screen-library">
			<div
				className="library-tabs"
				role="tablist"
				aria-label="Drafts and Done"
				data-testid="library-tabs"
			>
				<button
					type="button"
					role="tab"
					className="library-tab"
					data-testid="library-tab-drafts"
					data-active={ tab === 'drafts' ? 'true' : undefined }
					aria-selected={ tab === 'drafts' }
					onClick={ () => onSelectTab( 'drafts' ) }
				>
					Drafts
				</button>
				<button
					type="button"
					role="tab"
					className="library-tab"
					data-testid="library-tab-done"
					data-active={ tab === 'done' ? 'true' : undefined }
					aria-selected={ tab === 'done' }
					onClick={ () => onSelectTab( 'done' ) }
				>
					Done
				</button>
			</div>
			<div className="library-body" data-testid="library-body">
				{ tab === 'drafts' ? (
					<DraftsScreen
						onSelectProject={ onSelectProject }
						onOpenDraft={ onOpenDraft }
					/>
				) : (
					<DoneScreen
						onSelectProject={ onSelectProject }
						onOpenDraft={ ( draft ) =>
							onOpenDraft( { ...draft, folder: 'done' } )
						}
					/>
				) }
			</div>
		</div>
	);
}
