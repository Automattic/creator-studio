import React from 'react';

import { DraftChatPanel, type AddedSelection } from './DraftChatPanel';
import { DraftChecksPanel } from './DraftChecksPanel';
import { DraftOutlinePanel } from './DraftOutlinePanel';
import { ChatIcon, ChecksIcon, CloseIcon, OutlineIcon } from '../icons';
import type { DraftSidebarTab } from '../../types';

export type { AddedSelection };

type Props = {
	open: boolean;
	tab: DraftSidebarTab;
	onTabClick: ( tab: DraftSidebarTab ) => void;
	onClose: () => void;
	projectId: string;
	relPath: string;
	addedSelections: AddedSelection[];
	onClearAddedSelections: () => void;
};

const TABS: ReadonlyArray< {
	id: DraftSidebarTab;
	label: string;
	Icon: typeof ChatIcon;
} > = [
	{ id: 'chat', label: 'Chat', Icon: ChatIcon },
	{ id: 'checks', label: 'Checks', Icon: ChecksIcon },
	{ id: 'outline', label: 'Outline', Icon: OutlineIcon },
];

export function DraftSidebar( {
	open,
	tab,
	onTabClick,
	onClose,
	projectId,
	relPath,
	addedSelections,
	onClearAddedSelections,
}: Props ): React.ReactElement {
	const activeLabel = TABS.find( ( t ) => t.id === tab )?.label ?? '';
	return (
		<aside
			className="draft-sidebar"
			data-testid="draft-sidebar"
			data-open={ open ? 'true' : 'false' }
			aria-label="Draft sidebar"
		>
			<div
				className="draft-sidebar-panel"
				data-testid="draft-sidebar-panel"
				aria-hidden={ ! open }
			>
				<header className="draft-sidebar-panel-header">
					<h2 className="draft-sidebar-panel-title">
						{ activeLabel }
					</h2>
					<button
						type="button"
						className="draft-sidebar-panel-close"
						data-testid="draft-sidebar-close"
						aria-label="Close panel"
						onClick={ onClose }
					>
						<CloseIcon size={ 16 } />
					</button>
				</header>
				<div
					className="draft-sidebar-panel-body"
					data-testid="draft-sidebar-body"
					data-tab={ tab }
				>
					{ tab === 'chat' && (
						<DraftChatPanel
							projectId={ projectId }
							relPath={ relPath }
							addedSelections={ addedSelections }
							onClearAddedSelections={ onClearAddedSelections }
						/>
					) }
					{ tab === 'checks' && <DraftChecksPanel /> }
					{ tab === 'outline' && <DraftOutlinePanel /> }
				</div>
			</div>
			<div
				className="draft-sidebar-rail"
				role="tablist"
				aria-label="Draft sections"
			>
				{ TABS.map( ( t ) => {
					const isActive = open && tab === t.id;
					return (
						<button
							key={ t.id }
							type="button"
							role="tab"
							className="draft-sidebar-rail-btn"
							data-testid={ `draft-sidebar-tab-${ t.id }` }
							data-active={ isActive ? 'true' : 'false' }
							aria-selected={ isActive }
							aria-label={ t.label }
							title={ t.label }
							onClick={ () => onTabClick( t.id ) }
						>
							<t.Icon size={ 18 } />
						</button>
					);
				} ) }
			</div>
		</aside>
	);
}
