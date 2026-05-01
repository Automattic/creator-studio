import React, { useEffect, useState } from 'react';

import type { Draft } from '../../types';

import { relativeDate } from '../lib/relativeDate';

type Props = {
	onSelectProject: ( projectId: string ) => void;
	onOpenDraft: ( draft: {
		projectId: string;
		relPath: string;
		title: string;
	} ) => void;
};

// Small wrapper around `relativeDate` to render the "today" / "1h ago" /
// "Apr 3" mix shown in the design. Today's edits collapse to "today" once
// they're past the "now" / "Xm" window; recent past-hour timestamps get an
// " ago" suffix; older ones keep `relativeDate`'s output verbatim.
function formatDraftTime( mtime: number, now: number = Date.now() ): string {
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

function readMinutes( wordCount: number ): number {
	return Math.max( 1, Math.round( wordCount / 200 ) );
}

type State =
	| { status: 'loading' }
	| { status: 'loaded'; drafts: Draft[] }
	| { status: 'error' };

export function DraftsScreen( {
	onSelectProject,
	onOpenDraft,
}: Props ): React.ReactElement {
	const [ state, setState ] = useState< State >( { status: 'loading' } );

	useEffect( () => {
		let cancelled = false;
		void window.api.drafts
			.listAll()
			.then( ( drafts ) => {
				if ( cancelled ) {
					return;
				}
				setState( { status: 'loaded', drafts } );
			} )
			.catch( () => {
				if ( cancelled ) {
					return;
				}
				setState( { status: 'error' } );
			} );
		return () => {
			cancelled = true;
		};
	}, [] );

	if ( state.status === 'loading' ) {
		return (
			<section
				className="drafts-screen"
				data-testid="screen-drafts"
				aria-label="Drafts"
			>
				<p className="drafts-screen-hint" data-testid="drafts-loading">
					Loading…
				</p>
			</section>
		);
	}

	if ( state.status === 'error' ) {
		return (
			<section
				className="drafts-screen"
				data-testid="screen-drafts"
				aria-label="Drafts"
			>
				<p className="drafts-screen-hint" data-testid="drafts-error">
					Couldn&apos;t read drafts.
				</p>
			</section>
		);
	}

	if ( state.drafts.length === 0 ) {
		return (
			<section
				className="drafts-screen"
				data-testid="screen-drafts"
				aria-label="Drafts"
			>
				<p className="drafts-screen-hint" data-testid="drafts-empty">
					No drafts yet — create a <code>.md</code> file under any
					project&apos;s <code>drafts/</code> folder.
				</p>
			</section>
		);
	}

	return (
		<section
			className="drafts-screen"
			data-testid="screen-drafts"
			aria-label="Drafts"
		>
			<ul
				className="drafts-list"
				data-testid="drafts-list"
				aria-label="Drafts across all projects"
			>
				{ state.drafts.map( ( draft ) => (
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
							<div
								className="draft-row-time"
								aria-hidden={ true }
							>
								{ formatDraftTime( draft.mtime ) }
							</div>
							<div className="draft-row-body">
								<h2 className="draft-row-title">
									{ draft.title }
								</h2>
								{ draft.description && (
									<p className="draft-row-description">
										{ draft.description }
									</p>
								) }
								<div className="draft-row-meta">
									<span>{ draft.wordCount } words</span>
									<span aria-hidden="true">·</span>
									<span>
										~{ readMinutes( draft.wordCount ) } min
										read
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
												onSelectProject(
													draft.projectId
												);
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
		</section>
	);
}
