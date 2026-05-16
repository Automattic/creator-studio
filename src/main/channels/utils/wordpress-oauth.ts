import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';

import { BrowserWindow } from 'electron';

const WPCOM_AUTHORIZE_URL = 'https://public-api.wordpress.com/oauth2/authorize';
const WPCOM_TOKEN_URL = 'https://public-api.wordpress.com/oauth2/token';
// Minimal site info we read back from /rest/v1.1/me/sites — used to
// label the connection and to remember the blog id so REST calls can
// hit /wp/v2/sites/<blogId>/...
const WPCOM_ME_SITES_URL =
	'https://public-api.wordpress.com/rest/v1.1/me/sites?fields=ID,name,URL';

export type OauthTokenResult = {
	accessToken: string;
	blogId: number;
	blogUrl: string;
	blogName: string;
};

export type OauthError =
	| { kind: 'missing-client-id' }
	| { kind: 'user-cancelled' }
	| { kind: 'token-exchange-failed'; status?: number; body?: string }
	| { kind: 'no-site'; message: string }
	| { kind: 'network'; message: string };

function base64url( buf: Buffer ): string {
	return buf
		.toString( 'base64' )
		.replace( /\+/g, '-' )
		.replace( /\//g, '_' )
		.replace( /=+$/, '' );
}

function generateVerifier(): string {
	return base64url( randomBytes( 32 ) );
}

function generateChallenge( verifier: string ): string {
	return base64url( createHash( 'sha256' ).update( verifier ).digest() );
}

// Resolves a free ephemeral port the OS hands us. The HTTP server is
// started inside `runOauthFlow` so we never bind without a callback
// waiting; this just reserves a port number for the auth URL we open.
function pickPort(): Promise< number > {
	return new Promise( ( resolve, reject ) => {
		const server = http.createServer();
		server.unref();
		server.listen( 0, '127.0.0.1', () => {
			const address = server.address();
			if ( address && typeof address === 'object' ) {
				const { port } = address;
				server.close( () => resolve( port ) );
			} else {
				server.close( () => reject( new Error( 'no-port' ) ) );
			}
		} );
		server.on( 'error', reject );
	} );
}

export function getClientId(): string | null {
	const value = process.env.WPCOM_CLIENT_ID?.trim();
	return value && value.length > 0 ? value : null;
}

// Drives the full PKCE authorization-code flow. Blocks until the user
// either completes the browser flow (success), closes the popup
// (user-cancelled), or some IO breaks. On success the loopback server
// is shut down and the returned token has been verified against
// /me/sites so we already know which blog it belongs to.
export async function runOauthFlow(): Promise<
	{ ok: true; data: OauthTokenResult } | { ok: false; error: OauthError }
> {
	const clientId = getClientId();
	if ( ! clientId ) {
		return { ok: false, error: { kind: 'missing-client-id' } };
	}

	const verifier = generateVerifier();
	const challenge = generateChallenge( verifier );
	const port = await pickPort();
	const redirectUri = `http://127.0.0.1:${ port }/callback`;

	const authUrl = new URL( WPCOM_AUTHORIZE_URL );
	authUrl.searchParams.set( 'response_type', 'code' );
	authUrl.searchParams.set( 'client_id', clientId );
	authUrl.searchParams.set( 'redirect_uri', redirectUri );
	authUrl.searchParams.set( 'scope', 'global' );
	authUrl.searchParams.set( 'code_challenge', challenge );
	authUrl.searchParams.set( 'code_challenge_method', 'S256' );

	// Loopback server waits for the redirect. We resolve `codePromise`
	// with the captured code (or an error) and shut the server down
	// regardless of outcome via the `cleanup` closure.
	const server = http.createServer();
	const codePromise = new Promise<
		{ ok: true; code: string } | { ok: false; reason: string }
	>( ( resolve ) => {
		server.on( 'request', ( req, res ) => {
			try {
				const reqUrl = new URL(
					req.url ?? '/',
					`http://127.0.0.1:${ port }`
				);
				if ( reqUrl.pathname !== '/callback' ) {
					res.statusCode = 404;
					res.end( 'not found' );
					return;
				}
				const code = reqUrl.searchParams.get( 'code' );
				const error = reqUrl.searchParams.get( 'error' );
				if ( error || ! code ) {
					res.statusCode = 400;
					res.setHeader( 'Content-Type', 'text/html' );
					res.end(
						`<html><body style="font-family:system-ui;padding:24px">WordPress sign-in failed: ${
							error ?? 'no code'
						}. You can close this window.</body></html>`
					);
					resolve( { ok: false, reason: error ?? 'no-code' } );
					return;
				}
				res.statusCode = 200;
				res.setHeader( 'Content-Type', 'text/html' );
				res.end(
					'<html><body style="font-family:system-ui;padding:24px">Signed in. You can close this window.</body></html>'
				);
				resolve( { ok: true, code } );
			} catch ( err ) {
				res.statusCode = 500;
				res.end( 'error' );
				resolve( {
					ok: false,
					reason:
						err instanceof Error ? err.message : 'callback-error',
				} );
			}
		} );
		server.listen( port, '127.0.0.1' );
	} );

	const oauthWindow = new BrowserWindow( {
		width: 520,
		height: 720,
		title: 'Sign in with WordPress.com',
		webPreferences: { nodeIntegration: false, contextIsolation: true },
	} );

	const cancelledPromise = new Promise< { ok: false; reason: string } >(
		( resolve ) => {
			oauthWindow.on( 'closed', () => {
				resolve( { ok: false, reason: 'user-cancelled' } );
			} );
		}
	);

	void oauthWindow.loadURL( authUrl.toString() );

	const captured = await Promise.race( [ codePromise, cancelledPromise ] );

	server.close();
	if ( ! oauthWindow.isDestroyed() ) {
		oauthWindow.close();
	}

	if ( captured.ok === false ) {
		if ( captured.reason === 'user-cancelled' ) {
			return { ok: false, error: { kind: 'user-cancelled' } };
		}
		return {
			ok: false,
			error: {
				kind: 'token-exchange-failed',
				body: captured.reason,
			},
		};
	}

	// Exchange the code for a token. WP.com expects
	// `application/x-www-form-urlencoded` here, not JSON.
	const tokenBody = new URLSearchParams( {
		grant_type: 'authorization_code',
		code: captured.code,
		redirect_uri: redirectUri,
		client_id: clientId,
		code_verifier: verifier,
	} );

	let tokenResp: Response;
	try {
		tokenResp = await fetch( WPCOM_TOKEN_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json',
			},
			body: tokenBody.toString(),
		} );
	} catch ( err ) {
		return {
			ok: false,
			error: {
				kind: 'network',
				message: err instanceof Error ? err.message : String( err ),
			},
		};
	}

	if ( ! tokenResp.ok ) {
		const text = await tokenResp.text().catch( () => '' );
		return {
			ok: false,
			error: {
				kind: 'token-exchange-failed',
				status: tokenResp.status,
				body: text.slice( 0, 240 ),
			},
		};
	}

	const tokenData = ( await tokenResp.json().catch( () => null ) ) as {
		access_token?: string;
		blog_id?: number | string;
		blog_url?: string;
	} | null;
	if ( ! tokenData?.access_token ) {
		return {
			ok: false,
			error: {
				kind: 'token-exchange-failed',
				status: tokenResp.status,
				body: 'no access_token in response',
			},
		};
	}

	// Even when WP.com returned a blog_id/url at token time, fetch
	// /me/sites so we have the human-readable site name to label the
	// connection. Falls back to the token-time values if /me/sites is
	// empty (unusual but possible for tokens with global scope).
	let siteName = '';
	let blogId = Number( tokenData.blog_id ?? 0 );
	let blogUrl = tokenData.blog_url ?? '';
	try {
		const sitesResp = await fetch( WPCOM_ME_SITES_URL, {
			headers: {
				Authorization: `Bearer ${ tokenData.access_token }`,
				Accept: 'application/json',
			},
		} );
		if ( sitesResp.ok ) {
			const sitesData = ( await sitesResp.json() ) as {
				sites?: Array< { ID: number; name: string; URL: string } >;
			};
			const first = sitesData.sites?.[ 0 ];
			if ( first ) {
				if ( blogId === 0 ) {
					blogId = first.ID;
				}
				if ( ! blogUrl ) {
					blogUrl = first.URL;
				}
				siteName = first.name;
			}
		}
	} catch {
		// Best-effort label lookup — soft-fail.
	}

	if ( blogId === 0 ) {
		return {
			ok: false,
			error: {
				kind: 'no-site',
				message: "Couldn't determine which blog this token belongs to.",
			},
		};
	}

	return {
		ok: true,
		data: {
			accessToken: tokenData.access_token,
			blogId,
			blogUrl: blogUrl || `https://wordpress.com/blog/${ blogId }`,
			blogName: siteName || blogUrl || `Site ${ blogId }`,
		},
	};
}
