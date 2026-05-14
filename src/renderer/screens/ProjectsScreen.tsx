import React, { useEffect, useRef, useState } from 'react';

import { MoreIcon } from '../icons';
import type { Project } from '../../types';
import quotes from './quotes.json';

type Props = {
	projects: Project[];
	onSelect: ( id: string ) => void;
	onCreate: () => void;
	onRemove: ( id: string ) => void;
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

function ProjectCard( {
	project,
	onSelect,
	onRemove,
}: {
	project: Project;
	onSelect: ( id: string ) => void;
	onRemove: ( id: string ) => void;
} ): React.ReactElement {
	const [ menuOpen, setMenuOpen ] = useState< boolean >( false );
	const wrapperRef = useRef< HTMLDivElement | null >( null );

	useEffect( () => {
		if ( ! menuOpen ) {
			return;
		}
		const onKey = ( e: KeyboardEvent ): void => {
			if ( e.key === 'Escape' ) {
				setMenuOpen( false );
			}
		};
		const onDocClick = ( e: MouseEvent ): void => {
			if (
				wrapperRef.current &&
				! wrapperRef.current.contains( e.target as Node )
			) {
				setMenuOpen( false );
			}
		};
		document.addEventListener( 'keydown', onKey );
		document.addEventListener( 'mousedown', onDocClick );
		return () => {
			document.removeEventListener( 'keydown', onKey );
			document.removeEventListener( 'mousedown', onDocClick );
		};
	}, [ menuOpen ] );

	return (
		<li className="project-card-wrapper">
			<button
				type="button"
				className="project-card"
				data-testid={ `project-card-${ project.id }` }
				onClick={ () => onSelect( project.id ) }
			>
				<div className="project-card-name">{ project.name }</div>
				<div className="project-card-path">{ project.path }</div>
				{ project.goal && (
					<div className="project-card-goal">{ project.goal }</div>
				) }
			</button>
			<div ref={ wrapperRef } className="project-card-menu-wrapper">
				<button
					type="button"
					className="project-card-menu-button"
					data-testid={ `project-card-menu-button-${ project.id }` }
					aria-haspopup="menu"
					aria-expanded={ menuOpen }
					aria-label={ `Actions for ${ project.name }` }
					onClick={ ( e ) => {
						e.stopPropagation();
						setMenuOpen( ( prev ) => ! prev );
					} }
				>
					<MoreIcon size={ 14 } />
				</button>
				{ menuOpen && (
					<div
						className="project-card-menu"
						data-testid={ `project-card-menu-${ project.id }` }
						role="menu"
					>
						<button
							type="button"
							className="project-card-menu-item project-card-menu-item-danger"
							data-testid={ `project-card-menu-remove-${ project.id }` }
							role="menuitem"
							onClick={ ( e ) => {
								e.stopPropagation();
								setMenuOpen( false );
								onRemove( project.id );
							} }
						>
							Remove from app
						</button>
					</div>
				) }
			</div>
		</li>
	);
}

export function ProjectsScreen( {
	projects,
	onSelect,
	onCreate,
	onRemove,
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
						<ProjectCard
							key={ project.id }
							project={ project }
							onSelect={ onSelect }
							onRemove={ onRemove }
						/>
					) ) }
				</ul>
			) }
		</section>
	);
}
