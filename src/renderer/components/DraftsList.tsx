import React from 'react';

import type { Draft } from '../../types';

import { relativeDate } from '../lib/relativeDate';

// Renders the "today" / "1h ago" / "Apr 3" mix used by both the Drafts and
// Done screens. Today's edits collapse to "today" past the "now" / "Xm"
// window; recent past-hour timestamps get an " ago" suffix; older ones keep
// `relativeDate`'s output verbatim.
export function formatDraftTime(
	mtime: number,
	now: number = Date.now()
): string {
	const raw = relativeDate( mtime, now );
	const isSameDay =
		new Date( mtime ).toDateString() === new Date( now ).toDateString();
	if ( isSameDay && /^\d+m$/.test( raw ) ) {
		return 'today';
	}
	if ( raw === 'now' ) {
		return 'today';
	}
	if ( /^\d+[mhd]$/.test( raw ) ) {
		return `${ raw } ago`;
	}
	return raw;
}

export function readMinutes( wordCount: number ): number {
	return Math.max( 1, Math.round( wordCount / 200 ) );
}

type Props = {
	items: Draft[];
	ariaLabel: string;
	onSelectProject: ( projectId: string ) => void;
	onOpenDraft: ( draft: {
		projectId: string;
		relPath: string;
		title: string;
	} ) => void;
};

export function DraftsList( {
	items,
	ariaLabel,
	onSelectProject,
	onOpenDraft,
}: Props ): React.ReactElement {
	return (
		<ul
			className="drafts-list"
			data-testid="drafts-list"
			aria-label={ ariaLabel }
		>
			{ items.map( ( draft ) => (
				<li
					key={ `${ draft.projectId }:${ draft.relPath }` }
					className="draft-row"
				>
					<div
						role="button"
						tabIndex={ 0 }
						className="draft-row-button"
						data-testid={ `draft-row-${ draft.projectId }-${ draft.relPath }` }
						onClick={ () =>
							onOpenDraft( {
								projectId: draft.projectId,
								relPath: draft.relPath,
								title: draft.title,
							} )
						}
						onKeyDown={ ( e ) => {
							if ( e.key === 'Enter' || e.key === ' ' ) {
								e.preventDefault();
								onOpenDraft( {
									projectId: draft.projectId,
									relPath: draft.relPath,
									title: draft.title,
								} );
							}
						} }
					>
						<div className="draft-row-time" aria-hidden={ true }>
							{ formatDraftTime( draft.mtime ) }
						</div>
						<div className="draft-row-body">
							<h2 className="draft-row-title">{ draft.title }</h2>
							{ draft.description && (
								<p className="draft-row-description">
									{ draft.description }
								</p>
							) }
							<div className="draft-row-meta">
								<span>{ draft.wordCount } words</span>
								<span aria-hidden="true">·</span>
								<span>
									~{ readMinutes( draft.wordCount ) } min read
								</span>
								<span aria-hidden="true">·</span>
								<span>
									from{ ' ' }
									<button
										type="button"
										className="drafts-from-link"
										data-testid={ `draft-from-${ draft.projectId }-${ draft.relPath }` }
										onClick={ ( e ) => {
											e.stopPropagation();
											onSelectProject( draft.projectId );
										} }
									>
										<em>{ draft.projectName }</em>
									</button>
								</span>
							</div>
						</div>
					</div>
				</li>
			) ) }
		</ul>
	);
}
