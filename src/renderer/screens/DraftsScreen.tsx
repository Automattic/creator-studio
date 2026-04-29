import React from 'react';

import { relativeDate } from '../lib/relativeDate';

type DraftRow = {
	key: string;
	mtime: number;
	title: string;
	description: string;
	wordCount: number;
	projectName: string;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

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

const NOW = Date.now();

const SAMPLE_ROWS: DraftRow[] = [
	{
		key: 'sample-1',
		mtime: NOW - 30 * 60 * 1000,
		title: 'April 2026: what r/WordPress was talking about',
		description:
			"A roundup of the month's top conversations on r/WordPress — the themes, the drama, and the posts worth reading.",
		wordCount: 840,
		projectName: 'WordPress Reddit (last 30 days)',
	},
	{
		key: 'sample-2',
		mtime: NOW - 26 * DAY,
		title: 'March 2026: what r/WordPress was talking about',
		description:
			"March's top r/WordPress threads. Block editor, performance, and a surprise debate about plugin economics.",
		wordCount: 910,
		projectName: 'WordPress Reddit (last 30 days)',
	},
	{
		key: 'sample-3',
		mtime: NOW - HOUR,
		title: '2026 W17 — team snapshot',
		description:
			'This week: 42 commits across 3 repos, two shipped features, and the thing we deprioritized.',
		wordCount: 420,
		projectName: 'Team snapshots',
	},
];

export function DraftsScreen(): React.ReactElement {
	const noop = (): void => {
		/* hooked up in a later step */
	};

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
				{ SAMPLE_ROWS.map( ( row ) => (
					<li
						key={ row.key }
						className="draft-row"
						data-testid={ `draft-row-${ row.key }` }
					>
						<div className="draft-row-time" aria-hidden={ true }>
							{ formatDraftTime( row.mtime ) }
						</div>
						<div className="draft-row-body">
							<h2 className="draft-row-title">{ row.title }</h2>
							<p className="draft-row-description">
								{ row.description }
							</p>
							<div className="draft-row-meta">
								<span>{ row.wordCount } words</span>
								<span aria-hidden="true">·</span>
								<span>
									~{ readMinutes( row.wordCount ) } min read
								</span>
								<span aria-hidden="true">·</span>
								<span>
									from{ ' ' }
									<button
										type="button"
										className="drafts-from-link"
										onClick={ noop }
									>
										<em>{ row.projectName }</em>
									</button>
								</span>
							</div>
						</div>
					</li>
				) ) }
			</ul>
		</section>
	);
}
