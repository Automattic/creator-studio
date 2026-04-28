import React from 'react';

import type { Project } from '../../types';
import quotes from './quotes.json';

type Props = {
	projects: Project[];
	onSelect: ( id: string ) => void;
	onCreate: () => void;
};

type Quote = { text: string; author: string };

const QUOTES: Quote[] = quotes;

const ROTATION_MS = 7_000;

/* Fisher–Yates shuffle. `avoidFirst` keeps a fresh shuffle from leading with the
   quote we just finished showing, so transitions never repeat the same line. */
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

export function ProjectsScreen( {
	projects,
	onSelect,
	onCreate,
}: Props ): React.ReactElement {
	const queueRef = React.useRef< number[] >( [] );
	const [ quoteIndex, setQuoteIndex ] = React.useState( () => {
		queueRef.current = shuffleIndices( QUOTES.length );
		return queueRef.current.shift() ?? 0;
	} );

	React.useEffect( () => {
		if ( projects.length > 0 ) {
			return;
		}
		const id = window.setInterval( () => {
			setQuoteIndex( ( prev ) => {
				if ( queueRef.current.length === 0 ) {
					queueRef.current = shuffleIndices( QUOTES.length, prev );
				}
				return queueRef.current.shift() ?? prev;
			} );
		}, ROTATION_MS );
		return () => window.clearInterval( id );
	}, [ projects.length ] );

	const quote = QUOTES[ quoteIndex ];

	return (
		<section
			className="projects-screen"
			data-testid="screen-projects"
			aria-label="Projects"
		>
			<header className="projects-screen-header">
				<h1 className="projects-screen-title">Projects</h1>
				<button
					type="button"
					className="projects-screen-cta"
					data-testid="projects-new"
					onClick={ onCreate }
				>
					New project
				</button>
			</header>

			{ projects.length === 0 ? (
				<div
					className="projects-screen-empty"
					data-testid="projects-empty"
				>
					<figure
						className="projects-screen-quote"
						key={ quoteIndex }
					>
						<blockquote className="projects-screen-quote-text">
							“{ quote.text }”
						</blockquote>
						<figcaption className="projects-screen-quote-author">
							— { quote.author }
						</figcaption>
					</figure>
				</div>
			) : (
				<ul className="projects-grid" data-testid="projects-grid">
					{ projects.map( ( project ) => (
						<li key={ project.id }>
							<button
								type="button"
								className="project-card"
								data-testid={ `project-card-${ project.id }` }
								onClick={ () => onSelect( project.id ) }
							>
								<div className="project-card-name">
									{ project.name }
								</div>
								<div className="project-card-path">
									{ project.path }
								</div>
								{ project.goal && (
									<div className="project-card-goal">
										{ project.goal }
									</div>
								) }
							</button>
						</li>
					) ) }
				</ul>
			) }
		</section>
	);
}
