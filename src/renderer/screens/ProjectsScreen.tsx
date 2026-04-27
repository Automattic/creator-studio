import React from 'react';

import type { Folder } from '../../types';

type Props = {
	folders: Folder[];
	onSelect: ( id: string ) => void;
	onCreate: () => void;
};

export function ProjectsScreen( {
	folders,
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
					+ New project
				</button>
			</header>

			{ folders.length === 0 ? (
				<div
					className="projects-screen-empty"
					data-testid="projects-empty"
				>
					<p>No projects yet.</p>
					<button
						type="button"
						className="projects-screen-cta"
						data-testid="projects-empty-cta"
						onClick={ onCreate }
					>
						Link a folder
					</button>
				</div>
			) : (
				<ul className="projects-grid" data-testid="projects-grid">
					{ folders.map( ( folder ) => (
						<li key={ folder.id }>
							<button
								type="button"
								className="project-card"
								data-testid={ `project-card-${ folder.id }` }
								onClick={ () => onSelect( folder.id ) }
							>
								<div className="project-card-name">
									{ folder.name }
								</div>
								<div className="project-card-path">
									{ folder.path }
								</div>
								{ folder.goal && (
									<div className="project-card-goal">
										{ folder.goal }
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
