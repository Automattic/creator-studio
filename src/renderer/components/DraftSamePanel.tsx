import React from 'react';

import { hueFromString } from '../lib/hueFromString';
import type { Draft } from '../../types';

type Props = {
	projectId: string;
	projectName: string;
	currentRelPath: string;
	drafts: Draft[];
	onOpenDraft: ( draft: Draft ) => void;
	onOpenProjectCanvas: () => void;
};

export function DraftSamePanel( {
	projectId,
	projectName,
	currentRelPath,
	drafts,
	onOpenDraft,
	onOpenProjectCanvas,
}: Props ): React.ReactElement {
	const hue = hueFromString( projectId );
	const initial = ( projectName.trim()[ 0 ] ?? '?' ).toUpperCase();
	return (
		<div className="draft-same-panel" data-testid="draft-same-panel">
			<p className="draft-same-section-label">
				{ projectName }{ ' ' }
				<span className="draft-same-section-meta">(last 30 days)</span>
			</p>
			<ul className="draft-same-list" aria-label="Drafts in this project">
				{ drafts.map( ( d ) => {
					const isCurrent = d.relPath === currentRelPath;
					return (
						<li key={ d.relPath }>
							<button
								type="button"
								className="draft-same-row"
								data-testid="draft-same-row"
								data-current={ isCurrent ? 'true' : 'false' }
								title={ d.title }
								onClick={ () => {
									if ( ! isCurrent ) {
										onOpenDraft( d );
									}
								} }
							>
								<span
									className="draft-same-avatar"
									style={
										{
											// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
											'--avatar-hue': hue,
										} as React.CSSProperties
									}
									aria-hidden="true"
								>
									{ initial }
								</span>
								<span className="draft-same-title">
									{ d.title }
								</span>
								<span className="draft-same-status">draft</span>
							</button>
						</li>
					);
				} ) }
			</ul>
			<button
				type="button"
				className="draft-same-open-canvas"
				data-testid="draft-same-open-canvas"
				onClick={ onOpenProjectCanvas }
			>
				Open project canvas
				<span aria-hidden="true">{ ' →' }</span>
			</button>
		</div>
	);
}
