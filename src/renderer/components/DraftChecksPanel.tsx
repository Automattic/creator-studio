import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

import { ResetChecksDefaultsDialog } from './ResetChecksDefaultsDialog';
import { EditIcon, MoreIcon, PlusIcon, TrashIcon } from '../icons';
import { hueFromString } from '../lib/hueFromString';
import { DraftCheckIssue, DraftCheckMeta } from '../../types';

// Slug used only for testid suffixes. Lower-cases, strips `.md`, replaces
// non-alphanumerics with `-`. Derived from the full relPath so two checks
// with the same display title produce distinct testids.
function testidSlug( relPath: string ): string {
	return relPath
		.toLowerCase()
		.replace( /\.md$/i, '' )
		.replace( /[^a-z0-9]+/g, '-' )
		.replace( /^-+|-+$/g, '' );
}

// CSS variable bag carrying the per-check accent. The HSL split (hue from a
// stable hash; fixed saturation + lightness) keeps all check colors visually
// in the same family while still being distinguishable from each other and
// from the chrome.
function checkColorStyle( relPath: string ): React.CSSProperties {
	const hue = hueFromString( relPath );
	return {
		[ '--check-color' as string ]: `hsl(${ hue } 72% 52%)`,
		[ '--check-color-soft' as string ]: `hsl(${ hue } 72% 52% / 0.14)`,
	};
}

type Props = {
	checks?: DraftCheckMeta[];
	issues?: DraftCheckIssue[];
	activeIssueId?: string | null;
	running?: boolean;
	errorByCheck?: Record< string, string >;
	editingRelPath?: string | null;
	onToggleEnabled?: ( relPath: string, next: boolean ) => void;
	onRun?: () => void;
	onCreateCheck?: () => void;
	onEditCheck?: ( relPath: string ) => void;
	onDeleteCheck?: ( relPath: string ) => void;
	onResetDefaults?: () => void;
	onSelectIssue?: ( id: string ) => void;
	onApplyIssues?: ( ids: string[] ) => void;
	onDismissIssues?: ( ids: string[] ) => void;
	renderEditor?: ( relPath: string ) => React.ReactNode;
};

export function DraftChecksPanel( {
	checks = [],
	issues = [],
	activeIssueId = null,
	running = false,
	errorByCheck = {},
	editingRelPath = null,
	onToggleEnabled,
	onRun,
	onCreateCheck,
	onEditCheck,
	onDeleteCheck,
	onResetDefaults,
	onSelectIssue,
	onApplyIssues,
	onDismissIssues,
	renderEditor,
}: Props ): React.ReactElement {
	const [ menuOpen, setMenuOpen ] = useState( false );
	const [ resetDialogOpen, setResetDialogOpen ] = useState( false );
	const [ pendingDelete, setPendingDelete ] =
		useState< DraftCheckMeta | null >( null );
	const menuRef = useRef< HTMLDivElement | null >( null );

	useEffect( () => {
		if ( ! menuOpen ) {
			return;
		}
		const handler = ( e: MouseEvent ): void => {
			if (
				menuRef.current &&
				! menuRef.current.contains( e.target as Node )
			) {
				setMenuOpen( false );
			}
		};
		document.addEventListener( 'mousedown', handler );
		return () => document.removeEventListener( 'mousedown', handler );
	}, [ menuOpen ] );

	const enabledCount = useMemo(
		() => checks.filter( ( c ) => c.enabled ).length,
		[ checks ]
	);

	// Group issues by checkRelPath. Capture each group's display title from
	// the first issue in the group — at dispatch time the runner stamped
	// the title that was current then, which is what we want to render here.
	const groups = useMemo( () => {
		const map = new Map<
			string,
			{ title: string; issues: DraftCheckIssue[] }
		>();
		for ( const issue of issues ) {
			let entry = map.get( issue.checkRelPath );
			if ( ! entry ) {
				entry = { title: issue.checkTitle, issues: [] };
				map.set( issue.checkRelPath, entry );
			}
			entry.issues.push( issue );
		}
		return map;
	}, [ issues ] );

	const total = issues.length;
	const hasResults = total > 0 || Object.keys( errorByCheck ).length > 0;
	const allIds = useMemo( () => issues.map( ( i ) => i.id ), [ issues ] );

	const canRun = enabledCount > 0 && ! running;

	if ( editingRelPath && renderEditor ) {
		return (
			<div
				className="draft-checks-panel draft-checks-panel-editing"
				data-testid="draft-checks-panel"
				data-editing="true"
			>
				{ renderEditor( editingRelPath ) }
			</div>
		);
	}

	return (
		<div className="draft-checks-panel" data-testid="draft-checks-panel">
			<section className="draft-checks-run-card">
				<header
					className="draft-checks-section-header"
					data-testid="draft-checks-panel-header"
				>
					<span className="draft-checks-section-header-title">
						Choose checks to run
					</span>
					<div className="draft-checks-section-header-actions">
						<button
							type="button"
							className="draft-checks-icon-button"
							data-testid="draft-checks-new"
							aria-label="New check"
							title="New check"
							onClick={ () => onCreateCheck?.() }
						>
							<PlusIcon size={ 14 } />
						</button>
						<div
							className="draft-checks-panel-menu-wrap"
							ref={ menuRef }
						>
							<button
								type="button"
								className="draft-checks-icon-button"
								data-testid="draft-checks-menu"
								aria-haspopup="menu"
								aria-expanded={ menuOpen }
								aria-label="More actions"
								title="More actions"
								onClick={ () => setMenuOpen( ( v ) => ! v ) }
							>
								<MoreIcon size={ 16 } />
							</button>
							{ menuOpen && (
								<div
									className="draft-checks-panel-menu"
									role="menu"
								>
									<button
										type="button"
										role="menuitem"
										className="draft-checks-panel-menu-item"
										data-testid="draft-checks-reset-defaults"
										onClick={ () => {
											setMenuOpen( false );
											setResetDialogOpen( true );
										} }
									>
										Reset to defaults
									</button>
								</div>
							) }
						</div>
					</div>
				</header>
				{ checks.length === 0 ? (
					<p
						className="draft-checks-empty"
						data-testid="draft-checks-empty"
					>
						No checks yet. Add one with the&nbsp;+&nbsp;button, or
						pick &ldquo;Reset to defaults&rdquo; to seed the bundled
						set.
					</p>
				) : (
					<ul className="draft-checks-panel-list">
						{ checks.map( ( meta ) => {
							const slug = testidSlug( meta.relPath );
							const inputId = `draft-checks-enabled-${ slug }`;
							return (
								<li
									key={ meta.relPath }
									className="draft-checks-panel-item"
									data-testid="draft-checks-row"
									data-rel-path={ meta.relPath }
									style={ checkColorStyle( meta.relPath ) }
								>
									<input
										id={ inputId }
										type="checkbox"
										data-testid={ inputId }
										className="draft-checks-panel-checkbox"
										checked={ meta.enabled }
										disabled={
											running || !! meta.parseError
										}
										onChange={ ( e ) =>
											onToggleEnabled?.(
												meta.relPath,
												e.target.checked
											)
										}
									/>
									<label
										className="draft-checks-panel-label"
										htmlFor={ inputId }
									>
										<span className="draft-checks-panel-label-title">
											<span
												className="draft-checks-kind-dot"
												aria-hidden="true"
											/>
											<span className="draft-checks-panel-label-name">
												{ meta.title }
											</span>
										</span>
										{ meta.parseError && (
											<span
												className="draft-checks-panel-warning"
												data-testid={ `draft-checks-row-warning-${ slug }` }
											>
												invalid frontmatter
											</span>
										) }
									</label>
									<div className="draft-checks-row-actions">
										<button
											type="button"
											className="draft-checks-icon-button"
											data-testid="draft-checks-row-edit"
											aria-label={ `Edit ${ meta.title }` }
											title="Edit"
											onClick={ () =>
												onEditCheck?.( meta.relPath )
											}
										>
											<EditIcon size={ 14 } />
										</button>
										<button
											type="button"
											className="draft-checks-icon-button draft-checks-icon-button-danger"
											data-testid="draft-checks-row-delete"
											aria-label={ `Delete ${ meta.title }` }
											title="Delete"
											onClick={ () =>
												setPendingDelete( meta )
											}
										>
											<TrashIcon size={ 14 } />
										</button>
									</div>
								</li>
							);
						} ) }
					</ul>
				) }
				<button
					type="button"
					className="draft-checks-panel-run"
					data-testid="draft-checks-run"
					disabled={ ! canRun }
					onClick={ () => onRun?.() }
				>
					{ ( () => {
						if ( running ) {
							return 'Checking…';
						}
						if ( enabledCount === 0 ) {
							return 'No checks enabled';
						}
						const noun = enabledCount === 1 ? 'check' : 'checks';
						return `Run ${ enabledCount } ${ noun }`;
					} )() }
				</button>
			</section>
			{ hasResults && total > 0 && (
				<section
					className="draft-checks-summary-bar"
					data-testid="draft-checks-summary"
					data-running={ running ? 'true' : 'false' }
				>
					<span className="draft-checks-summary-count">
						{ total } { total === 1 ? 'issue' : 'issues' }
					</span>
					<div className="draft-checks-summary-actions">
						<button
							type="button"
							className="check-action-button check-action-button-ghost"
							data-testid="draft-checks-summary-dismiss-all"
							onClick={ () => onDismissIssues?.( allIds ) }
						>
							Dismiss all
						</button>
						<button
							type="button"
							className="check-action-button check-action-button-primary"
							data-testid="draft-checks-summary-apply-all"
							onClick={ () => onApplyIssues?.( allIds ) }
						>
							Apply all ({ total })
						</button>
					</div>
				</section>
			) }
			{ hasResults && (
				<div
					className="draft-checks-results"
					data-testid="draft-checks-results"
					data-running={ running ? 'true' : 'false' }
				>
					{ Array.from( groups.entries() ).map(
						( [ relPath, group ] ) => {
							const slug = testidSlug( relPath );
							const err = errorByCheck[ relPath ];
							const groupIds = group.issues.map( ( i ) => i.id );
							return (
								<section
									key={ relPath }
									className="draft-checks-results-group"
									data-check-rel-path={ relPath }
									style={ checkColorStyle( relPath ) }
								>
									<header className="draft-checks-results-title">
										<span
											className="draft-checks-kind-dot"
											aria-hidden="true"
										/>
										<span className="draft-checks-results-title-label">
											{ group.title }
										</span>
										<span className="draft-checks-results-count">
											{ group.issues.length }
										</span>
										{ group.issues.length >= 2 && (
											<button
												type="button"
												className="check-action-button check-action-button-ghost draft-checks-group-apply-all"
												data-testid={ `draft-checks-group-apply-all-${ slug }` }
												onClick={ () =>
													onApplyIssues?.( groupIds )
												}
											>
												Apply all
											</button>
										) }
									</header>
									{ err && (
										<p
											className="draft-checks-results-error"
											data-testid={ `draft-checks-error-${ slug }` }
										>
											{ err }
										</p>
									) }
									<ul className="draft-checks-results-list">
										{ group.issues.map( ( issue ) => (
											<li
												key={ issue.id }
												className="draft-checks-result"
												data-testid={ `draft-checks-result-${ issue.id }` }
												data-active={
													activeIssueId === issue.id
														? 'true'
														: 'false'
												}
											>
												<button
													type="button"
													className="draft-checks-result-body"
													onClick={ () =>
														onSelectIssue?.(
															issue.id
														)
													}
												>
													<span className="draft-checks-result-message">
														{ issue.message }
													</span>
													<span className="draft-checks-result-change">
														<span className="draft-checks-result-original">
															{ issue.original }
														</span>
														<span
															className="draft-checks-result-arrow"
															aria-hidden="true"
														>
															→
														</span>
														<span className="draft-checks-result-replacement">
															{
																issue.replacement
															}
														</span>
													</span>
												</button>
												<div className="draft-checks-result-actions">
													<button
														type="button"
														className="check-action-button check-action-button-ghost"
														data-testid={ `draft-checks-result-dismiss-${ issue.id }` }
														onClick={ () =>
															onDismissIssues?.( [
																issue.id,
															] )
														}
													>
														Dismiss
													</button>
													<button
														type="button"
														className="check-action-button check-action-button-primary"
														data-testid={ `draft-checks-result-apply-${ issue.id }` }
														onClick={ () =>
															onApplyIssues?.( [
																issue.id,
															] )
														}
													>
														Apply
													</button>
												</div>
											</li>
										) ) }
									</ul>
								</section>
							);
						}
					) }
					{ /* Surface errors for groups that produced no issues but
					     reported a per-check error (auth, parse, etc.). */ }
					{ Object.entries( errorByCheck ).map(
						( [ relPath, err ] ) => {
							if ( groups.has( relPath ) ) {
								return null;
							}
							const slug = testidSlug( relPath );
							const title =
								checks.find( ( c ) => c.relPath === relPath )
									?.title ?? relPath.replace( /\.md$/i, '' );
							return (
								<section
									key={ relPath }
									className="draft-checks-results-group"
									data-check-rel-path={ relPath }
									style={ checkColorStyle( relPath ) }
								>
									<header className="draft-checks-results-title">
										<span
											className="draft-checks-kind-dot"
											aria-hidden="true"
										/>
										<span className="draft-checks-results-title-label">
											{ title }
										</span>
									</header>
									<p
										className="draft-checks-results-error"
										data-testid={ `draft-checks-error-${ slug }` }
									>
										{ err }
									</p>
								</section>
							);
						}
					) }
				</div>
			) }
			{ resetDialogOpen && (
				<ResetChecksDefaultsDialog
					onCancel={ () => setResetDialogOpen( false ) }
					onConfirm={ () => {
						setResetDialogOpen( false );
						onResetDefaults?.();
					} }
				/>
			) }
			{ pendingDelete && (
				<DeleteCheckDialog
					meta={ pendingDelete }
					onCancel={ () => setPendingDelete( null ) }
					onConfirm={ () => {
						const target = pendingDelete;
						setPendingDelete( null );
						onDeleteCheck?.( target.relPath );
					} }
				/>
			) }
		</div>
	);
}

type DeleteCheckDialogProps = {
	meta: DraftCheckMeta;
	onCancel: () => void;
	onConfirm: () => void;
};

function DeleteCheckDialog( {
	meta,
	onCancel,
	onConfirm,
}: DeleteCheckDialogProps ): React.ReactElement {
	return (
		<Dialog.Root
			open={ true }
			onOpenChange={ ( isOpen ) => {
				if ( ! isOpen ) {
					onCancel();
				}
			} }
		>
			<Dialog.Portal>
				<Dialog.Backdrop className="dialog-backdrop" />
				<Dialog.Popup
					className="dialog-panel"
					data-testid="draft-checks-delete-dialog"
				>
					<Dialog.Title className="dialog-title">
						Delete this check?
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						“{ meta.title }” will be removed from the project. The
						file <code>checks/{ meta.relPath }</code> will be
						deleted.
					</Dialog.Description>
					<div className="dialog-footer">
						<button
							type="button"
							className="dialog-button-secondary"
							data-testid="draft-checks-delete-cancel"
							onClick={ onCancel }
						>
							Cancel
						</button>
						<button
							type="button"
							className="dialog-button-danger"
							data-testid="draft-checks-delete-confirm"
							onClick={ onConfirm }
						>
							Delete
						</button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
