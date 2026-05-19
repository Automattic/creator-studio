import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

import type { WordpressConnectionPublic } from '../../types';

type Props = {
	open: boolean;
	onClose: () => void;
	// `connections` is the full set of records the user just
	// authenticated against — one entry for app-password, one per
	// blog for WordPress.com OAuth. Callers that need a single
	// "primary" record (e.g. pre-selecting in the create-project
	// modal) take connections[0].
	onConnected: ( connections: WordpressConnectionPublic[] ) => void;
};

type Mode = 'self-hosted' | 'wpcom';

type ConnectError = {
	reason: string;
	status?: number;
	message?: string;
};

const APP_PASSWORD_DOCS_URL =
	'https://developer.wordpress.org/advanced-administration/security/application-passwords/#creating-an-application-password-in-wp-admin';

function submitLabel( mode: Mode, submitting: boolean ): string {
	if ( submitting ) {
		return mode === 'wpcom' ? 'Waiting for sign-in…' : 'Connecting…';
	}
	return mode === 'wpcom' ? 'Sign in with WordPress.com' : 'Connect';
}

function describeError( error: ConnectError ): string {
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
			return 'Sign-in cancelled. Try again when you’re ready.';
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

export function WordpressConnectDialog( {
	open,
	onClose,
	onConnected,
}: Props ): React.ReactElement {
	const [ mode, setMode ] = useState< Mode >( 'wpcom' );
	const [ siteUrl, setSiteUrl ] = useState( '' );
	const [ username, setUsername ] = useState( '' );
	const [ appPassword, setAppPassword ] = useState( '' );
	const [ submitting, setSubmitting ] = useState( false );
	const [ error, setError ] = useState< ConnectError | null >( null );
	// Guards against a late `connectOauth()` resolution after the
	// user cancelled or dismissed the dialog — we still want to
	// ignore a success that arrives a moment after Cancel.
	const abortedRef = useRef( false );

	useEffect( () => {
		if ( ! open ) {
			setMode( 'wpcom' );
			setSiteUrl( '' );
			setUsername( '' );
			setAppPassword( '' );
			setSubmitting( false );
			setError( null );
			abortedRef.current = false;
		}
	}, [ open ] );

	const handleClose = (): void => {
		if ( submitting && mode === 'wpcom' ) {
			abortedRef.current = true;
			void window.api.wordpress.cancelOauth();
		}
		onClose();
	};

	const trimmedUrl = siteUrl.trim();
	const trimmedUser = username.trim();
	const trimmedPass = appPassword.trim();
	const canSubmit =
		! submitting &&
		( mode === 'wpcom' ||
			( trimmedUrl.length > 0 &&
				trimmedUser.length > 0 &&
				trimmedPass.length > 0 ) );

	const onSubmit = async (): Promise< void > => {
		if ( ! canSubmit ) {
			return;
		}
		setSubmitting( true );
		setError( null );
		abortedRef.current = false;
		try {
			if ( mode === 'wpcom' ) {
				const result = await window.api.wordpress.connectOauth();
				if ( abortedRef.current ) {
					return;
				}
				if ( result.ok === false ) {
					setError( {
						reason: result.reason,
						status: result.status,
						message: result.message,
					} );
				} else {
					onConnected( result.connections );
					onClose();
				}
				return;
			}

			const result = await window.api.wordpress.connectAppPassword( {
				siteUrl: trimmedUrl,
				username: trimmedUser,
				appPassword: trimmedPass,
			} );
			if ( result.ok === false ) {
				setError( {
					reason: result.reason,
					status: result.status,
					message: result.message,
				} );
			} else {
				onConnected( [ result.connection ] );
				onClose();
			}
		} finally {
			setSubmitting( false );
		}
	};

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
					data-testid="wordpress-connect-dialog"
				>
					<Dialog.Title className="dialog-title">
						Connect a WordPress site
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						Pick how this site authenticates. Self-hosted sites use
						an application password; WordPress.com sites sign in
						with OAuth.
					</Dialog.Description>

					<div
						className="dialog-segmented"
						role="tablist"
						aria-label="Connection type"
					>
						<button
							type="button"
							role="tab"
							className="dialog-segmented-option"
							data-testid="wordpress-connect-mode-wpcom"
							data-active={
								mode === 'wpcom' ? 'true' : undefined
							}
							aria-selected={ mode === 'wpcom' }
							onClick={ () => setMode( 'wpcom' ) }
						>
							WordPress.com
						</button>
						<button
							type="button"
							role="tab"
							className="dialog-segmented-option"
							data-testid="wordpress-connect-mode-self-hosted"
							data-active={
								mode === 'self-hosted' ? 'true' : undefined
							}
							aria-selected={ mode === 'self-hosted' }
							onClick={ () => setMode( 'self-hosted' ) }
						>
							Self-hosted
						</button>
					</div>

					{ mode === 'self-hosted' ? (
						<>
							<div className="dialog-field">
								<label
									className="dialog-label"
									htmlFor="wordpress-connect-site-url"
								>
									Site URL{ ' ' }
									<span className="dialog-required">*</span>
								</label>
								<input
									id="wordpress-connect-site-url"
									type="text"
									className="dialog-input"
									data-testid="wordpress-connect-site-url"
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
									htmlFor="wordpress-connect-username"
								>
									Username{ ' ' }
									<span className="dialog-required">*</span>
								</label>
								<input
									id="wordpress-connect-username"
									type="text"
									className="dialog-input"
									data-testid="wordpress-connect-username"
									value={ username }
									onChange={ ( e ) =>
										setUsername( e.target.value )
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
									htmlFor="wordpress-connect-app-password"
								>
									Application password{ ' ' }
									<span className="dialog-required">*</span>
								</label>
								<input
									id="wordpress-connect-app-password"
									type="password"
									className="dialog-input"
									data-testid="wordpress-connect-app-password"
									value={ appPassword }
									onChange={ ( e ) =>
										setAppPassword( e.target.value )
									}
									placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
									autoComplete="off"
									spellCheck={ false }
									disabled={ submitting }
								/>
								<div className="dialog-help">
									Generate one at{ ' ' }
									<strong>
										Users → Profile → Application Passwords
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
							className="dialog-field wordpress-connect-wpcom-section"
							data-testid="wordpress-connect-wpcom-section"
						>
							<p className="dialog-help">
								Your default browser will open to WordPress.com
								— sign in there using your existing session,
								password manager, or security key. After
								authorising Studio Write, return to this window.
								The access token is encrypted with your system
								keychain and never leaves this machine.
							</p>
						</div>
					) }

					{ error && (
						<p
							className="dialog-error"
							data-testid="wordpress-connect-error"
						>
							{ describeError( error ) }
						</p>
					) }

					<div className="dialog-footer">
						<button
							type="button"
							className="dialog-button-secondary"
							data-testid="wordpress-connect-cancel"
							onClick={ handleClose }
							disabled={ submitting && mode !== 'wpcom' }
						>
							Cancel
						</button>
						<button
							type="button"
							className="dialog-button-primary"
							data-testid="wordpress-connect-submit"
							onClick={ () => {
								void onSubmit();
							} }
							disabled={ ! canSubmit }
						>
							{ submitLabel( mode, submitting ) }
						</button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
