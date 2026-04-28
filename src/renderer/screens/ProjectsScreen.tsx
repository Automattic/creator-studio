import React from 'react';

import type { Project } from '../../types';

type Props = {
	projects: Project[];
	onSelect: ( id: string ) => void;
	onCreate: () => void;
};

export function ProjectsScreen( {
	projects,
	onSelect,
	onCreate,
}: Props ): React.ReactElement {
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
					<p>No projects yet.</p>
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
