import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

import type {
	Project,
	WordpressConnectionPublic,
	WordpressImportProgress,
} from '../../types';

import { ChevronIcon, FolderIcon, PlusIcon, WordpressIcon } from '../icons';

type Props = {
	open: boolean;
	onClose: () => void;
	onCreated: ( project: Project ) => void;
};

type ConnectionMode = 'self-hosted' | 'wpcom';

type ConnectError = {
	reason: string;
	status?: number;
	message?: string;
};

const APP_PASSWORD_DOCS_URL =
	'https://developer.wordpress.org/advanced-administration/security/application-passwords/#creating-an-application-password-in-wp-admin';

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

function previewFolderName( name: string ): string {
	const cleaned = name
		.trim()
		.replace( /[\\/]+/g, '-' )
		.replace( /\s+/g, ' ' )
		.replace( /^\.+/, '' );
	return cleaned.length > 0 ? cleaned : 'project';
}

function describeConnectError( error: ConnectError ): string {
	switch ( error.reason ) {
		case 'invalid-url':
			return 'Enter a valid site URL (e.g. https://example.com).';
		case 'unauthorized':
			return 'Wrong username or application password — WordPress refused the credentials.';
		case 'forbidden':
			return "Authenticated, but the account isn't allowed to access the REST API.";
		case 'rest-disabled':
			return 'The WordPress REST API is disabled on this site.';
		case 'not-found':
			return "Couldn't find a WordPress REST API at that URL.";
		case 'network':
			return error.message
				? `Network error: ${ error.message }`
				: 'Network error — the site is unreachable.';
		case 'http-error':
			return error.status
				? `WordPress returned an unexpected error (HTTP ${ error.status }).`
				: 'WordPress returned an unexpected error.';
		case 'missing-client-id':
			return 'WordPress.com sign-in is unavailable: this build has no WPCOM_CLIENT_ID configured. Set it before launch or use the Self-hosted tab.';
		case 'user-cancelled':
			return "Sign-in cancelled. Try again when you're ready.";
		case 'state-mismatch':
			return 'Sign-in could not be verified. Try again.';
		case 'token-exchange-failed':
			return error.status
				? `WordPress.com refused to exchange the auth code (HTTP ${ error.status }).`
				: 'WordPress.com refused to exchange the auth code.';
		case 'no-site':
			return "Couldn't find a WordPress.com site on this account.";
		default:
			return 'Connection failed.';
	}
}

export function ImportWordPressModal( {
	open,
	onClose,
	onCreated,
}: Props ): React.ReactElement {
	const [ name, setName ] = useState( '' );
	const [ goal, setGoal ] = useState( '' );
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
	const [ addingNew, setAddingNew ] = useState( false );
	const [ connectionMode, setConnectionMode ] =
		useState< ConnectionMode >( 'wpcom' );
	const [ siteUrl, setSiteUrl ] = useState( '' );
	const [ username, setUsername ] = useState( '' );
	const [ appPassword, setAppPassword ] = useState( '' );
	const [ importProgress, setImportProgress ] =
		useState< WordpressImportProgress | null >( null );
	const abortedRef = useRef( false );

	useEffect( () => {
		if ( ! open ) {
			setName( '' );
			setGoal( '' );
			setParentDir( null );
			setAdvancedOpen( false );
			setSubmitting( false );
			setError( null );
			setWpConnectionId( null );
			setAddingNew( false );
			setConnectionMode( 'wpcom' );
			setSiteUrl( '' );
			setUsername( '' );
			setAppPassword( '' );
			setImportProgress( null );
			abortedRef.current = false;
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
		if ( list.length === 0 ) {
			setAddingNew( true );
		}
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

	const useExistingConnection = ! addingNew && wpConnectionId !== null;
	const trimmedUrl = siteUrl.trim();
	const trimmedUser = username.trim();
	const trimmedPass = appPassword.trim();
	const selfHostedReady =
		trimmedUrl.length > 0 &&
		trimmedUser.length > 0 &&
		trimmedPass.length > 0;

	const canSubmit =
		trimmedName.length > 0 &&
		! submitting &&
		( useExistingConnection ||
			( addingNew && connectionMode === 'wpcom' ) ||
			( addingNew &&
				connectionMode === 'self-hosted' &&
				selfHostedReady ) );

	const handleClose = (): void => {
		if ( submitting && addingNew && connectionMode === 'wpcom' ) {
			abortedRef.current = true;
			void window.api.wordpress.cancelOauth();
		}
		onClose();
	};

	const doImport = async ( connectionId: string ): Promise< void > => {
		setImportProgress( null );
		const trimmedGoal = goal.trim();
		const result = await window.api.wordpress.importProject( {
			name: trimmedName,
			goal: trimmedGoal.length > 0 ? trimmedGoal : undefined,
			parentDir: parentDir ?? undefined,
			connectionId,
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
			setError( 'The selected WordPress connection no longer exists.' );
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
	};

	const onSubmit = async (): Promise< void > => {
		if ( ! canSubmit ) {
			return;
		}
		setSubmitting( true );
		setError( null );
		abortedRef.current = false;
		try {
			if ( useExistingConnection ) {
				await doImport( wpConnectionId );
				return;
			}
			if ( connectionMode === 'wpcom' ) {
				const result = await window.api.wordpress.connectOauth();
				if ( abortedRef.current ) {
					return;
				}
				if ( result.ok === false ) {
					setError(
						describeConnectError( {
							reason: result.reason,
							status: result.status,
							message: result.message,
						} )
					);
					return;
				}
				await refreshWpConnections();
				const newId = result.connections[ 0 ]?.id;
				if ( ! newId ) {
					setError( 'Connected but no site was found.' );
					return;
				}
				await doImport( newId );
			} else {
				const result = await window.api.wordpress.connectAppPassword( {
					siteUrl: trimmedUrl,
					username: trimmedUser,
					appPassword: trimmedPass,
				} );
				if ( result.ok === false ) {
					setError(
						describeConnectError( {
							reason: result.reason,
							status: result.status,
							message: result.message,
						} )
					);
					return;
				}
				await refreshWpConnections();
				await doImport( result.connection.id );
			}
		} finally {
			setSubmitting( false );
		}
	};

	const showInlineConnect = addingNew || wpConnections.length === 0;

	return (
		<Dialog.Root
			open={ open }
			onOpenChange={ ( isOpen ) => {
				if ( ! isOpen ) {
					handleClose();
				}
			} }
		>
			<Dialog.Portal>
				<Dialog.Backdrop className="dialog-backdrop" />
				<Dialog.Popup
					className="dialog-panel"
					data-testid="import-wordpress-modal"
				>
					<Dialog.Title className="dialog-title">
						Import a WordPress site
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						Pick a connected WordPress site. Studio Write creates a
						project folder and downloads every post — published into
						done/, drafts into drafts/.
					</Dialog.Description>

					<div className="dialog-field">
						<label className="dialog-label" htmlFor="project-name">
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
						<label className="dialog-label" htmlFor="project-goal">
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

					<div className="dialog-field project-wordpress-picker">
						<span className="dialog-label">WordPress site</span>

						{ wpConnections.length > 0 && ! addingNew && (
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
												wpConnectionId === connection.id
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
											<WordpressIcon size={ 18 } />
											<span className="project-wordpress-row-text">
												<span className="project-wordpress-row-label">
													{ connection.label }
												</span>
												<span className="project-wordpress-row-url">
													{ connection.siteUrl }
												</span>
											</span>
										</label>
									</li>
								) ) }
							</ul>
						) }

						{ wpConnections.length > 0 && ! addingNew && (
							<button
								type="button"
								className="dialog-button-secondary project-wordpress-add"
								data-testid="project-wordpress-add-connection"
								onClick={ () => setAddingNew( true ) }
							>
								<PlusIcon size={ 14 } />
								<span>Add new connection</span>
							</button>
						) }

						{ showInlineConnect && (
							<>
								{ wpConnections.length > 0 && (
									<button
										type="button"
										className="dialog-link project-wordpress-back"
										onClick={ () => setAddingNew( false ) }
									>
										Back to existing connections
									</button>
								) }

								<div
									className="dialog-segmented"
									role="tablist"
									aria-label="Connection type"
								>
									<button
										type="button"
										role="tab"
										className="dialog-segmented-option"
										data-testid="project-wordpress-connect-mode-wpcom"
										data-active={
											connectionMode === 'wpcom'
												? 'true'
												: undefined
										}
										aria-selected={
											connectionMode === 'wpcom'
										}
										onClick={ () =>
											setConnectionMode( 'wpcom' )
										}
									>
										WordPress.com
									</button>
									<button
										type="button"
										role="tab"
										className="dialog-segmented-option"
										data-testid="project-wordpress-connect-mode-self-hosted"
										data-active={
											connectionMode === 'self-hosted'
												? 'true'
												: undefined
										}
										aria-selected={
											connectionMode === 'self-hosted'
										}
										onClick={ () =>
											setConnectionMode( 'self-hosted' )
										}
									>
										Self-hosted
									</button>
								</div>

								{ connectionMode === 'self-hosted' ? (
									<>
										<div className="dialog-field">
											<label
												className="dialog-label"
												htmlFor="project-wp-site-url"
											>
												Site URL{ ' ' }
												<span className="dialog-required">
													*
												</span>
											</label>
											<input
												id="project-wp-site-url"
												type="text"
												className="dialog-input"
												data-testid="project-wordpress-site-url"
												value={ siteUrl }
												onChange={ ( e ) =>
													setSiteUrl( e.target.value )
												}
												placeholder="https://example.com"
												autoComplete="off"
												spellCheck={ false }
												disabled={ submitting }
											/>
										</div>
										<div className="dialog-field">
											<label
												className="dialog-label"
												htmlFor="project-wp-username"
											>
												Username{ ' ' }
												<span className="dialog-required">
													*
												</span>
											</label>
											<input
												id="project-wp-username"
												type="text"
												className="dialog-input"
												data-testid="project-wordpress-username"
												value={ username }
												onChange={ ( e ) =>
													setUsername(
														e.target.value
													)
												}
												placeholder="WordPress username"
												autoComplete="off"
												spellCheck={ false }
												disabled={ submitting }
											/>
										</div>
										<div className="dialog-field">
											<label
												className="dialog-label"
												htmlFor="project-wp-app-password"
											>
												Application password{ ' ' }
												<span className="dialog-required">
													*
												</span>
											</label>
											<input
												id="project-wp-app-password"
												type="password"
												className="dialog-input"
												data-testid="project-wordpress-app-password"
												value={ appPassword }
												onChange={ ( e ) =>
													setAppPassword(
														e.target.value
													)
												}
												placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
												autoComplete="off"
												spellCheck={ false }
												disabled={ submitting }
											/>
											<div className="dialog-help">
												Generate one at{ ' ' }
												<strong>
													Users → Profile →
													Application Passwords
												</strong>{ ' ' }
												in your WP admin.{ ' ' }
												<button
													type="button"
													className="dialog-link"
													onClick={ () => {
														void window.api.shell.openExternal(
															APP_PASSWORD_DOCS_URL
														);
													} }
												>
													Learn more
												</button>
											</div>
										</div>
									</>
								) : (
									<div
										className="dialog-field"
										data-testid="project-wordpress-wpcom-section"
									>
										<p className="dialog-help">
											Your default browser will open to
											WordPress.com — sign in there using
											your existing session, password
											manager, or security key. After
											authorising Studio Write, return to
											this window.
										</p>
									</div>
								) }
							</>
						) }

						{ submitting && (
							<p
								className="dialog-help"
								data-testid="project-wordpress-import-progress"
							>
								{ progressLabel( importProgress ) }
							</p>
						) }
					</div>

					<div className="dialog-advanced">
						<button
							type="button"
							className="dialog-advanced-toggle"
							data-testid="project-advanced-toggle"
							data-open={ advancedOpen ? 'true' : undefined }
							aria-expanded={ advancedOpen }
							onClick={ () => setAdvancedOpen( ( v ) => ! v ) }
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
											{ effectiveParent ?? 'Loading…' }
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
								Will be created at <code>{ previewPath }</code>
							</p>
						) }
					</div>

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
							onClick={ handleClose }
							disabled={
								submitting &&
								! ( addingNew && connectionMode === 'wpcom' )
							}
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
							{ submitting ? 'Importing…' : 'Import' }
						</button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
