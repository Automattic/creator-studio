import React from 'react';

import { FolderIcon, PlusIcon, WordpressIcon } from '../icons';
import { relativeDate } from '../lib/relativeDate';
import quotes from './quotes.json';

export type RecentProject = {
	id: string;
	name: string;
	lastActivity: number;
};

type Props = {
	onNewProject: () => void;
	onImportFolder: () => void;
	onImportWordPress: () => void;
	recentProjects: RecentProject[];
	onSelectProject: ( id: string ) => void;
};

type Quote = { text: string; author: string };

const QUOTES: Quote[] = quotes;
const ROTATION_MS = 7_000;

function shuffleIndices( length: number, avoidFirst?: number ): number[] {
	const order = Array.from( { length }, ( _, i ) => i );
	for ( let i = order.length - 1; i > 0; i -= 1 ) {
		const j = Math.floor( Math.random() * ( i + 1 ) );
		[ order[ i ], order[ j ] ] = [ order[ j ], order[ i ] ];
	}
	if ( length > 1 && avoidFirst !== undefined && order[ 0 ] === avoidFirst ) {
		[ order[ 0 ], order[ 1 ] ] = [ order[ 1 ], order[ 0 ] ];
	}
	return order;
}

export function HomeScreen( {
	onNewProject,
	onImportFolder,
	onImportWordPress,
	recentProjects,
	onSelectProject,
}: Props ): React.ReactElement {
	const now = Date.now();
	const queueRef = React.useRef< number[] >( [] );
	const [ quoteIndex, setQuoteIndex ] = React.useState( () => {
		queueRef.current = shuffleIndices( QUOTES.length );
		return queueRef.current.shift() ?? 0;
	} );

	React.useEffect( () => {
		const id = window.setInterval( () => {
			setQuoteIndex( ( prev ) => {
				if ( queueRef.current.length === 0 ) {
					queueRef.current = shuffleIndices( QUOTES.length, prev );
				}
				return queueRef.current.shift() ?? prev;
			} );
		}, ROTATION_MS );
		return () => window.clearInterval( id );
	}, [] );

	const quote = QUOTES[ quoteIndex ];

	return (
		<section
			className="home-screen"
			data-testid="screen-home"
			aria-label="Home"
		>
			<div className="home-hero">
				<h1 className="home-title">Studio Write</h1>
				<p className="home-subtitle">
					Research, draft, and publish with an AI writing partner.
					Create a project to get started.
				</p>
			</div>

			<div className="home-section-label">Get started</div>
			<div className="home-actions">
				<button
					type="button"
					className="home-action home-action-primary"
					data-testid="home-new-project"
					onClick={ onNewProject }
				>
					<span className="home-action-icon">
						<PlusIcon size={ 18 } />
					</span>
					<span className="home-action-text">
						<span className="home-action-label">New Project</span>
						<span className="home-action-desc">
							Create an empty project and start writing
						</span>
					</span>
				</button>

				<button
					type="button"
					className="home-action"
					data-testid="home-import-folder"
					onClick={ onImportFolder }
				>
					<span className="home-action-icon">
						<FolderIcon size={ 18 } />
					</span>
					<span className="home-action-text">
						<span className="home-action-label">Import Folder</span>
						<span className="home-action-desc">
							Link an existing folder as a project
						</span>
					</span>
				</button>

				<button
					type="button"
					className="home-action"
					data-testid="home-import-wordpress"
					onClick={ onImportWordPress }
				>
					<span className="home-action-icon">
						<WordpressIcon size={ 18 } />
					</span>
					<span className="home-action-text">
						<span className="home-action-label">
							Import from WordPress
						</span>
						<span className="home-action-desc">
							Pull posts from a WordPress site into a project
						</span>
					</span>
				</button>
			</div>

			{ recentProjects.length > 0 && (
				<>
					<div className="home-section-label">Recent projects</div>
					<ul
						className="home-recent-projects"
						data-testid="home-recent-projects"
					>
						{ recentProjects.map( ( project ) => (
							<li key={ project.id }>
								<button
									type="button"
									className="home-recent-project"
									data-testid={ `home-recent-project-${ project.id }` }
									onClick={ () =>
										onSelectProject( project.id )
									}
								>
									<span className="home-recent-project-name">
										{ project.name }
									</span>
									<span className="home-recent-project-time">
										{ relativeDate(
											project.lastActivity,
											now
										) }
									</span>
								</button>
							</li>
						) ) }
					</ul>
				</>
			) }

			<footer className="home-footer">
				<figure className="home-quote" key={ quoteIndex }>
					<blockquote className="home-quote-text">
						&ldquo;{ quote.text }&rdquo;
					</blockquote>
					<figcaption className="home-quote-author">
						— { quote.author }
					</figcaption>
				</figure>
			</footer>
		</section>
	);
}
