import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

import type { Draft, Project } from '../../types';

import { SearchIcon } from '../icons';

type Props = {
	open: boolean;
	onClose: () => void;
	projects: Project[];
	onSelect: ( projectId: string ) => void;
	onSelectDraft: ( draft: {
		projectId: string;
		relPath: string;
		title: string;
	} ) => void;
};

export function SearchModal( {
	open,
	onClose,
	projects,
	onSelect,
	onSelectDraft,
}: Props ): React.ReactElement {
	const [ query, setQuery ] = useState( '' );
	const [ drafts, setDrafts ] = useState< Draft[] >( [] );
	const inputRef = useRef< HTMLInputElement >( null );

	useEffect( () => {
		if ( ! open ) {
			setQuery( '' );
		}
	}, [ open ] );

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		let cancelled = false;
		void window.api.drafts
			.listAll()
			.then( ( list ) => {
				if ( cancelled ) {
					return;
				}
				setDrafts( list );
			} )
			.catch( () => {
				if ( cancelled ) {
					return;
				}
				setDrafts( [] );
			} );
		return () => {
			cancelled = true;
		};
	}, [ open ] );

	const filteredProjects = useMemo( () => {
		const q = query.trim().toLowerCase();
		if ( ! q ) {
			return projects;
		}
		return projects.filter( ( p ) => {
			return (
				p.name.toLowerCase().includes( q ) ||
				( p.goal?.toLowerCase().includes( q ) ?? false )
			);
		} );
	}, [ projects, query ] );

	const filteredDrafts = useMemo( () => {
		const q = query.trim().toLowerCase();
		if ( ! q ) {
			return drafts;
		}
		return drafts.filter( ( d ) => {
			return (
				d.title.toLowerCase().includes( q ) ||
				d.description.toLowerCase().includes( q ) ||
				d.projectName.toLowerCase().includes( q ) ||
				d.relPath.toLowerCase().includes( q )
			);
		} );
	}, [ drafts, query ] );

	const handlePickProject = ( id: string ): void => {
		onSelect( id );
		onClose();
	};

	const handlePickDraft = ( draft: Draft ): void => {
		onSelectDraft( {
			projectId: draft.projectId,
			relPath: draft.relPath,
			title: draft.title,
		} );
		onClose();
	};

	const hasResults = filteredProjects.length > 0 || filteredDrafts.length > 0;

	return (
		<Dialog.Root
			open={ open }
			onOpenChange={ ( isOpen ) => {
				if ( ! isOpen ) {
					onClose();
				}
			} }
		>
			<Dialog.Portal>
				<Dialog.Backdrop className="dialog-backdrop search-modal-backdrop" />
				<Dialog.Popup
					className="search-modal"
					data-testid="search-modal"
					initialFocus={ inputRef }
				>
					<Dialog.Title className="search-modal-srtitle">
						Search projects
					</Dialog.Title>
					<div className="search-modal-input-row">
						<SearchIcon />
						<input
							ref={ inputRef }
							type="text"
							className="search-modal-input"
							data-testid="search-modal-input"
							placeholder="Search projects, drafts, published…"
							value={ query }
							onChange={ ( e ) => setQuery( e.target.value ) }
						/>
						<kbd className="search-modal-esc">esc</kbd>
					</div>
					<div className="search-modal-body">
						{ ! hasResults ? (
							<div
								className="search-modal-empty"
								data-testid="search-modal-empty"
							>
								No matches.
							</div>
						) : (
							<>
								{ filteredProjects.length > 0 && (
									<>
										<div className="search-modal-section-label">
											Projects
										</div>
										<ul
											className="search-modal-list"
											data-testid="search-modal-list"
										>
											{ filteredProjects.map(
												( project ) => (
													<li key={ project.id }>
														<button
															type="button"
															className="search-modal-item"
															data-testid={ `search-modal-item-${ project.id }` }
															onClick={ () =>
																handlePickProject(
																	project.id
																)
															}
														>
															<span className="search-modal-item-text">
																<span className="search-modal-item-title">
																	{
																		project.name
																	}
																</span>
																{ project.goal && (
																	<span className="search-modal-item-desc">
																		{
																			project.goal
																		}
																	</span>
																) }
															</span>
														</button>
													</li>
												)
											) }
										</ul>
									</>
								) }
								{ filteredDrafts.length > 0 && (
									<>
										<div className="search-modal-section-label">
											Drafts
										</div>
										<ul
											className="search-modal-list"
											data-testid="search-modal-drafts-list"
										>
											{ filteredDrafts.map( ( draft ) => (
												<li
													key={ `${ draft.projectId }:${ draft.relPath }` }
												>
													<button
														type="button"
														className="search-modal-item"
														data-testid={ `search-modal-draft-${ draft.projectId }-${ draft.relPath }` }
														onClick={ () =>
															handlePickDraft(
																draft
															)
														}
													>
														<span className="search-modal-item-text">
															<span className="search-modal-item-title">
																{ draft.title }
															</span>
															<span className="search-modal-item-desc">
																{
																	draft.projectName
																}
																{ draft.description
																	? ` — ${ draft.description }`
																	: '' }
															</span>
														</span>
													</button>
												</li>
											) ) }
										</ul>
									</>
								) }
							</>
						) }
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
