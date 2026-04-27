import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

import type { Project } from '../../types';

import { SearchIcon } from '../icons';

type Props = {
	open: boolean;
	onClose: () => void;
	projects: Project[];
	onSelect: ( projectId: string ) => void;
};

export function SearchModal( {
	open,
	onClose,
	projects,
	onSelect,
}: Props ): React.ReactElement {
	const [ query, setQuery ] = useState( '' );
	const inputRef = useRef< HTMLInputElement >( null );

	useEffect( () => {
		if ( ! open ) {
			setQuery( '' );
		}
	}, [ open ] );

	const filtered = useMemo( () => {
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

	const handlePick = ( id: string ): void => {
		onSelect( id );
		onClose();
	};

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
						<div className="search-modal-section-label">
							Projects
						</div>
						{ filtered.length === 0 ? (
							<div
								className="search-modal-empty"
								data-testid="search-modal-empty"
							>
								No projects match.
							</div>
						) : (
							<ul
								className="search-modal-list"
								data-testid="search-modal-list"
							>
								{ filtered.map( ( project ) => (
									<li key={ project.id }>
										<button
											type="button"
											className="search-modal-item"
											data-testid={ `search-modal-item-${ project.id }` }
											onClick={ () =>
												handlePick( project.id )
											}
										>
											<span className="search-modal-item-text">
												<span className="search-modal-item-title">
													{ project.name }
												</span>
												{ project.goal && (
													<span className="search-modal-item-desc">
														{ project.goal }
													</span>
												) }
											</span>
										</button>
									</li>
								) ) }
							</ul>
						) }
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
