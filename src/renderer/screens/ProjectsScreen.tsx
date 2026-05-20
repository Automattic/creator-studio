import React, { useEffect, useRef, useState } from 'react';

import { MoreIcon } from '../icons';
import type { Project } from '../../types';

type Props = {
	projects: Project[];
	onSelect: ( id: string ) => void;
	onRename: ( id: string ) => void;
	onUpdateGoal: ( id: string ) => void;
	onSetUpVoice: ( id: string, action: 'create' | 'update' ) => void;
	onRemove: ( id: string ) => void;
};

function ProjectCard( {
	project,
	onSelect,
	onRename,
	onUpdateGoal,
	onSetUpVoice,
	onRemove,
}: {
	project: Project;
	onSelect: ( id: string ) => void;
	onRename: ( id: string ) => void;
	onUpdateGoal: ( id: string ) => void;
	onSetUpVoice: ( id: string, action: 'create' | 'update' ) => void;
	onRemove: ( id: string ) => void;
} ): React.ReactElement {
	const [ menuOpen, setMenuOpen ] = useState< boolean >( false );
	const [ voiceAction, setVoiceAction ] = useState<
		'create' | 'update' | null
	>( null );

	useEffect( () => {
		let cancelled = false;
		void window.api.checks
			.read( project.id, 'voice.md' )
			.then( ( res ) => {
				if ( cancelled ) {
					return;
				}
				if ( ! res ) {
					setVoiceAction( 'create' );
					return;
				}
				const body = res.body.trim();
				const isPlaceholder =
					body.length === 0 ||
					body.startsWith( '(No voice defined yet' );
				setVoiceAction( isPlaceholder ? 'create' : 'update' );
			} )
			.catch( () => {
				if ( ! cancelled ) {
					setVoiceAction( 'create' );
				}
			} );
		return () => {
			cancelled = true;
		};
	}, [ project.id ] );
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
							className="project-card-menu-item"
							data-testid={ `project-card-menu-rename-${ project.id }` }
							role="menuitem"
							onClick={ ( e ) => {
								e.stopPropagation();
								setMenuOpen( false );
								onRename( project.id );
							} }
						>
							Rename
						</button>
						<button
							type="button"
							className="project-card-menu-item"
							data-testid={ `project-card-menu-goal-${ project.id }` }
							role="menuitem"
							onClick={ ( e ) => {
								e.stopPropagation();
								setMenuOpen( false );
								onUpdateGoal( project.id );
							} }
						>
							Update goal
						</button>
						<button
							type="button"
							className="project-card-menu-item"
							data-testid={ `project-card-menu-voice-${ project.id }` }
							role="menuitem"
							disabled={ voiceAction === null }
							onClick={ ( e ) => {
								e.stopPropagation();
								setMenuOpen( false );
								onSetUpVoice(
									project.id,
									voiceAction ?? 'create'
								);
							} }
						>
							{ voiceAction === 'update'
								? 'Update voice'
								: 'Set up voice' }
						</button>
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
	onRename,
	onUpdateGoal,
	onSetUpVoice,
	onRemove,
}: Props ): React.ReactElement {
	return (
		<section
			className="projects-screen"
			data-testid="screen-projects"
			aria-label="Projects"
		>
			<header className="projects-screen-header">
				<h1 className="projects-screen-title">Projects</h1>
			</header>

			{ projects.length === 0 ? (
				<div
					className="projects-screen-empty"
					data-testid="projects-empty"
				>
					No projects yet.
				</div>
			) : (
				<ul className="projects-grid" data-testid="projects-grid">
					{ projects.map( ( project ) => (
						<ProjectCard
							key={ project.id }
							project={ project }
							onSelect={ onSelect }
							onRename={ onRename }
							onUpdateGoal={ onUpdateGoal }
							onSetUpVoice={ onSetUpVoice }
							onRemove={ onRemove }
						/>
					) ) }
				</ul>
			) }
		</section>
	);
}
