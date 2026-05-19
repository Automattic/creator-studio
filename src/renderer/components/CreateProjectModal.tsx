import React, { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

import type {
	Project,
	WordpressConnectionPublic,
	WordpressImportProgress,
} from '../../types';

import {
	ChevronIcon,
	FolderIcon,
	FolderPlusIcon,
	PlusIcon,
	WordpressIcon,
} from '../icons';

import { WordpressConnectDialog } from './WordpressConnectDialog';

type Props = {
	open: boolean;
	onClose: () => void;
	onCreated: ( project: Project ) => void;
};

type Mode = 'new' | 'import' | 'wordpress';

function basename( filePath: string ): string {
	const parts = filePath.split( /[\\/]/ ).filter( Boolean );
	return parts[ parts.length - 1 ] ?? filePath;
}

function progressLabel( progress: WordpressImportProgress | null ): string {
	if ( ! progress ) {
		return 'Connecting to WordPress…';
	}
	if ( progress.phase === 'fetching' ) {
		return `Fetching posts (${ progress.current } so far)…`;
	}
	if ( progress.phase === 'writing' ) {
		return progress.total !== null
			? `Writing ${ progress.current } / ${ progress.total } posts…`
			: `Writing ${ progress.current } posts…`;
	}
	return 'Finishing up…';
}

function modeTitle( mode: Mode ): string {
	if ( mode === 'new' ) {
		return 'Start a new project';
	}
	if ( mode === 'import' ) {
		return 'Import an existing folder';
	}
	return 'Import a WordPress site';
}

function modeSubtitle( mode: Mode ): string {
	if ( mode === 'new' ) {
		return 'Give it a name and Studio Write will create a folder for it. Add a goal to shape how Claude approaches the work.';
	}
	if ( mode === 'import' ) {
		return 'Pick a folder and Claude will treat its files as project context. Add a goal to shape how Claude approaches the work.';
	}
	return 'Pick a connected WordPress site. Studio Write creates a project folder and downloads every post — published into done/, drafts into drafts/.';
}

function previewFolderName( name: string ): string {
	const cleaned = name
		.trim()
		.replace( /[\\/]+/g, '-' )
		.replace( /\s+/g, ' ' )
		.replace( /^\.+/, '' );
	return cleaned.length > 0 ? cleaned : 'project';
}

export function CreateProjectModal( {
	open,
	onClose,
	onCreated,
}: Props ): React.ReactElement {
	const [ mode, setMode ] = useState< Mode >( 'new' );
	const [ name, setName ] = useState( '' );
	const [ goal, setGoal ] = useState( '' );
	const [ importPath, setImportPath ] = useState< string | null >( null );
	const [ parentDir, setParentDir ] = useState< string | null >( null );
	const [ defaultParentDir, setDefaultParentDir ] = useState< string | null >(
		null
	);
	const [ advancedOpen, setAdvancedOpen ] = useState( false );
	const [ submitting, setSubmitting ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );
	const [ wpConnections, setWpConnections ] = useState<
		WordpressConnectionPublic[]
	>( [] );
	const [ wpConnectionId, setWpConnectionId ] = useState< string | null >(
		null
	);
	const [ wpConnectDialogOpen, setWpConnectDialogOpen ] = useState( false );
	const [ importProgress, setImportProgress ] =
		useState< WordpressImportProgress | null >( null );

	useEffect( () => {
		if ( ! open ) {
			setMode( 'new' );
			setName( '' );
			setGoal( '' );
			setImportPath( null );
			setParentDir( null );
			setAdvancedOpen( false );
			setSubmitting( false );
			setError( null );
			setWpConnectionId( null );
			setImportProgress( null );
		}
	}, [ open ] );

	const refreshWpConnections = async (): Promise< void > => {
		const list = await window.api.wordpress.list();
		setWpConnections( list );
		setWpConnectionId( ( prev ) => {
			if ( prev && list.some( ( c ) => c.id === prev ) ) {
				return prev;
			}
			return list[ 0 ]?.id ?? null;
		} );
	};

	useEffect( () => {
		if ( open ) {
			void refreshWpConnections();
		}
	}, [ open ] );

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		const off = window.api.wordpress.onImportProgress( ( payload ) => {
			setImportProgress( payload );
		} );
		return off;
	}, [ open ] );

	useEffect( () => {
		if ( ! open || defaultParentDir !== null ) {
			return;
		}
		let cancelled = false;
		void window.api.project.defaultParentDir().then( ( dir ) => {
			if ( ! cancelled ) {
				setDefaultParentDir( dir );
			}
		} );
		return () => {
			cancelled = true;
		};
	}, [ open, defaultParentDir ] );

	const onPickImportFolder = async (): Promise< void > => {
		const chosen = await window.api.project.pickPath();
		if ( ! chosen ) {
			return;
		}
		setImportPath( chosen );
		setName( ( prev ) =>
			prev.trim().length > 0 ? prev : basename( chosen )
		);
	};

	const onPickParentDir = async (): Promise< void > => {
		const chosen = await window.api.project.pickPath();
		if ( ! chosen ) {
			return;
		}
		setParentDir( chosen );
	};

	const trimmedName = name.trim();
	const effectiveParent = parentDir ?? defaultParentDir;
	const previewPath = useMemo( () => {
		if ( ! effectiveParent ) {
			return null;
		}
		return `${ effectiveParent }/${ previewFolderName( trimmedName ) }`;
	}, [ effectiveParent, trimmedName ] );

	const canSubmit =
		trimmedName.length > 0 &&
		! submitting &&
		( mode === 'new' ||
			( mode === 'import' && importPath !== null ) ||
			( mode === 'wordpress' && wpConnectionId !== null ) );

	const onSwitchMode = ( next: Mode ): void => {
		if ( next === mode ) {
			return;
		}
		setMode( next );
		setError( null );
	};

	const onSubmit = async (): Promise< void > => {
		if ( ! canSubmit ) {
			return;
		}
		setSubmitting( true );
		setError( null );
		try {
			const trimmedGoal = goal.trim();
			if ( mode === 'new' ) {
				const result = await window.api.project.createNew( {
					name: trimmedName,
					goal: trimmedGoal.length > 0 ? trimmedGoal : undefined,
					parentDir: parentDir ?? undefined,
				} );
				if ( result.status === 'ok' ) {
					onCreated( result.project );
					onClose();
				} else if ( result.status === 'already-linked' ) {
					setError(
						`This folder is already linked as "${ result.existing.name }".`
					);
				} else if ( result.status === 'target-exists' ) {
					setError(
						`A folder already exists at ${ result.targetPath }. Pick a different name or import that folder instead.`
					);
				} else {
					setError(
						`Couldn't create the project folder: ${ result.message }`
					);
				}
			} else if ( mode === 'import' ) {
				if ( ! importPath ) {
					return;
				}
				const result = await window.api.project.create( {
					path: importPath,
					name: trimmedName,
					goal: trimmedGoal.length > 0 ? trimmedGoal : undefined,
				} );
				if ( result.status === 'already-linked' ) {
					setError(
						`This folder is already linked as "${ result.existing.name }".`
					);
					return;
				}
				onCreated( result.project );
				onClose();
			} else {
				if ( ! wpConnectionId ) {
					return;
				}
				setImportProgress( null );
				const result = await window.api.wordpress.importProject( {
					name: trimmedName,
					goal: trimmedGoal.length > 0 ? trimmedGoal : undefined,
					parentDir: parentDir ?? undefined,
					connectionId: wpConnectionId,
				} );
				if ( result.status === 'ok' ) {
					onCreated( result.project );
					onClose();
				} else if ( result.status === 'already-linked' ) {
					setError(
						`This folder is already linked as "${ result.existing.name }".`
					);
				} else if ( result.status === 'target-exists' ) {
					setError(
						`A folder already exists at ${ result.targetPath }. Pick a different name.`
					);
				} else if ( result.status === 'connection-not-found' ) {
					setError(
						'The selected WordPress connection no longer exists.'
					);
					void refreshWpConnections();
				} else if ( result.status === 'fetch-error' ) {
					setError(
						`Couldn't fetch posts from WordPress: ${ result.message }`
					);
				} else {
					setError(
						`Couldn't create the project folder: ${ result.message }`
					);
				}
			}
		} finally {
			setSubmitting( false );
		}
	};

	const title = modeTitle( mode );
	const subtitle = modeSubtitle( mode );

	return (
		<>
			<Dialog.Root
				open={ open }
				onOpenChange={ ( isOpen ) => {
					if ( ! isOpen ) {
						onClose();
					}
				} }
			>
				<Dialog.Portal>
					<Dialog.Backdrop className="dialog-backdrop" />
					<Dialog.Popup
						className="dialog-panel"
						data-testid="create-project-modal"
					>
						<Dialog.Title className="dialog-title">
							{ title }
						</Dialog.Title>
						<Dialog.Description className="dialog-subtitle">
							{ subtitle }
						</Dialog.Description>

						<div
							className="dialog-segmented"
							role="tablist"
							aria-label="Project source"
						>
							<button
								type="button"
								role="tab"
								className="dialog-segmented-option"
								data-testid="project-mode-new"
								data-active={
									mode === 'new' ? 'true' : undefined
								}
								aria-selected={ mode === 'new' }
								onClick={ () => onSwitchMode( 'new' ) }
							>
								New project
							</button>
							<button
								type="button"
								role="tab"
								className="dialog-segmented-option"
								data-testid="project-mode-import"
								data-active={
									mode === 'import' ? 'true' : undefined
								}
								aria-selected={ mode === 'import' }
								onClick={ () => onSwitchMode( 'import' ) }
							>
								Import folder
							</button>
							<button
								type="button"
								role="tab"
								className="dialog-segmented-option"
								data-testid="project-mode-wordpress"
								data-active={
									mode === 'wordpress' ? 'true' : undefined
								}
								aria-selected={ mode === 'wordpress' }
								onClick={ () => onSwitchMode( 'wordpress' ) }
							>
								WordPress site
							</button>
						</div>

						{ mode === 'import' && (
							<div className="dialog-field">
								<span
									className="dialog-label"
									id="project-pick-folder-label"
								>
									Choose folder
								</span>
								<button
									type="button"
									className="dialog-folder-picker"
									data-testid="project-pick-folder"
									aria-labelledby="project-pick-folder-label"
									onClick={ () => {
										void onPickImportFolder();
									} }
								>
									<FolderPlusIcon />
									<span className="dialog-folder-picker-path">
										{ importPath ?? 'Pick a folder…' }
									</span>
								</button>
							</div>
						) }

						{ mode === 'wordpress' && (
							<div className="dialog-field project-wordpress-picker">
								<span className="dialog-label">
									WordPress site
								</span>
								{ wpConnections.length === 0 ? (
									<p
										className="dialog-help"
										data-testid="project-wordpress-empty"
									>
										No WordPress sites connected yet.
									</p>
								) : (
									<ul
										className="project-wordpress-list"
										role="radiogroup"
										aria-label="WordPress site"
									>
										{ wpConnections.map( ( connection ) => (
											<li key={ connection.id }>
												<label
													className="project-wordpress-row"
													htmlFor={ `wp-connection-${ connection.id }` }
													data-active={
														wpConnectionId ===
														connection.id
															? 'true'
															: undefined
													}
												>
													<input
														id={ `wp-connection-${ connection.id }` }
														type="radio"
														name="wp-connection"
														data-testid={ `project-wordpress-connection-${ connection.id }` }
														checked={
															wpConnectionId ===
															connection.id
														}
														onChange={ () =>
															setWpConnectionId(
																connection.id
															)
														}
													/>
													<WordpressIcon
														size={ 18 }
													/>
													<span className="project-wordpress-row-text">
														<span className="project-wordpress-row-label">
															{ connection.label }
														</span>
														<span className="project-wordpress-row-url">
															{
																connection.siteUrl
															}
														</span>
													</span>
												</label>
											</li>
										) ) }
									</ul>
								) }
								<button
									type="button"
									className="dialog-button-secondary project-wordpress-add"
									data-testid="project-wordpress-add-connection"
									onClick={ () =>
										setWpConnectDialogOpen( true )
									}
								>
									<PlusIcon size={ 14 } />
									<span>Add WordPress site</span>
								</button>
								{ submitting && (
									<p
										className="dialog-help"
										data-testid="project-wordpress-import-progress"
									>
										{ progressLabel( importProgress ) }
									</p>
								) }
							</div>
						) }

						<div className="dialog-field">
							<label
								className="dialog-label"
								htmlFor="project-name"
							>
								Name <span className="dialog-required">*</span>
							</label>
							<input
								id="project-name"
								type="text"
								className="dialog-input"
								data-testid="project-name"
								value={ name }
								onChange={ ( e ) => setName( e.target.value ) }
								placeholder="Project name"
							/>
						</div>

						<div className="dialog-field">
							<label
								className="dialog-label"
								htmlFor="project-goal"
							>
								Goal
							</label>
							<textarea
								id="project-goal"
								className="dialog-textarea"
								data-testid="project-goal"
								rows={ 3 }
								value={ goal }
								onChange={ ( e ) => setGoal( e.target.value ) }
								placeholder="Tell Claude how to work in this project (optional)"
							/>
						</div>

						{ ( mode === 'new' || mode === 'wordpress' ) && (
							<div className="dialog-advanced">
								<button
									type="button"
									className="dialog-advanced-toggle"
									data-testid="project-advanced-toggle"
									data-open={
										advancedOpen ? 'true' : undefined
									}
									aria-expanded={ advancedOpen }
									onClick={ () =>
										setAdvancedOpen( ( v ) => ! v )
									}
								>
									<ChevronIcon
										className={
											advancedOpen
												? 'dialog-advanced-chevron dialog-advanced-chevron-open'
												: 'dialog-advanced-chevron'
										}
									/>
									<span>Advanced</span>
								</button>
								{ advancedOpen && (
									<div className="dialog-advanced-body">
										<div className="dialog-field">
											<span
												className="dialog-label"
												id="project-advanced-parent-label"
											>
												Parent folder
											</span>
											<button
												type="button"
												className="dialog-folder-picker"
												data-testid="project-advanced-parent"
												aria-labelledby="project-advanced-parent-label"
												onClick={ () => {
													void onPickParentDir();
												} }
											>
												<FolderIcon />
												<span className="dialog-folder-picker-path">
													{ effectiveParent ??
														'Loading…' }
												</span>
											</button>
										</div>
									</div>
								) }
								{ previewPath && trimmedName.length > 0 && (
									<p
										className="dialog-path-preview"
										data-testid="project-path-preview"
									>
										Will be created at{ ' ' }
										<code>{ previewPath }</code>
									</p>
								) }
							</div>
						) }

						{ error && (
							<p
								className="dialog-error"
								data-testid="project-create-error"
							>
								{ error }
							</p>
						) }

						<div className="dialog-footer">
							<button
								type="button"
								className="dialog-button-secondary"
								data-testid="project-cancel"
								onClick={ onClose }
								disabled={ submitting }
							>
								Cancel
							</button>
							<button
								type="button"
								className="dialog-button-primary"
								data-testid="project-create"
								onClick={ () => {
									void onSubmit();
								} }
								disabled={ ! canSubmit }
							>
								{ submitting ? 'Creating…' : 'Create' }
							</button>
						</div>
					</Dialog.Popup>
				</Dialog.Portal>
			</Dialog.Root>
			<WordpressConnectDialog
				open={ wpConnectDialogOpen }
				onClose={ () => setWpConnectDialogOpen( false ) }
				onConnected={ ( connections ) => {
					if ( connections.length > 0 ) {
						setWpConnectionId( connections[ 0 ].id );
					}
					void refreshWpConnections();
				} }
			/>
		</>
	);
}
