import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import {
	getSiteInfo,
	normalizeSiteUrl,
	verifyConnection,
} from './utils/wordpress-client';
import {
	encryptSecret,
	findAppPasswordConnection,
	toPublic,
	upsertConnection,
} from './utils/wordpress-store';
import { IpcChannels } from '.';
import type {
	WordpressConnection,
	WordpressConnectionPublic,
} from '../../types';

const Input = z.object( {
	siteUrl: z.string().min( 1 ),
	username: z.string().min( 1 ),
	appPassword: z.string().min( 1 ),
	label: z.string().optional(),
} );

// The wp.com vs self-hosted split is enforced at the input layer:
// this channel only persists app-password connections. OAuth has its
// own channel (`wordpress:connectOauth`) so the renderer can dispatch
// to either without us having to inspect the URL.
export type ConnectAppPasswordResult =
	| { ok: true; connection: WordpressConnectionPublic }
	| {
			ok: false;
			reason:
				| 'invalid-url'
				| 'unauthorized'
				| 'forbidden'
				| 'rest-disabled'
				| 'not-found'
				| 'network'
				| 'http-error';
			status?: number;
			message?: string;
	  };

export const wordpressConnectAppPassword = defineChannel( {
	name: IpcChannels.wordpressConnectAppPassword,
	input: Input,
	handle: async ( input ): Promise< ConnectAppPasswordResult > => {
		const siteUrl = normalizeSiteUrl( input.siteUrl );
		if ( siteUrl.length === 0 || ! /^https?:\/\/.+/i.test( siteUrl ) ) {
			return { ok: false, reason: 'invalid-url' };
		}

		// If the same site+user is already connected, refresh that
		// record in place instead of duplicating. Reusing the
		// existing connection id keeps any drafts whose frontmatter
		// binds to it (wp_connection_id) linked across the
		// reconnection.
		const existing = findAppPasswordConnection( siteUrl, input.username );

		// Build a tentative record so the client helper can sign the
		// request — we only persist after verify succeeds.
		const candidate: WordpressConnection = {
			id: existing?.id ?? randomUUID(),
			label:
				input.label?.trim() ||
				existing?.label ||
				siteUrl.replace( /^https?:\/\//i, '' ),
			siteUrl,
			kind: 'app-password',
			username: input.username,
			secretCipher: encryptSecret( input.appPassword ),
			createdAt: existing?.createdAt ?? Date.now(),
		};

		const verify = await verifyConnection( candidate );
		if ( verify.ok === false ) {
			return {
				ok: false,
				reason:
					verify.reason === 'parse-error'
						? 'http-error'
						: verify.reason,
				status: verify.status,
				message: verify.message,
			};
		}

		// Try to read the site title to use as a nicer default label
		// when the user didn't provide one. Soft-fail: a missing site
		// title shouldn't block the connection.
		if ( ! input.label || input.label.trim().length === 0 ) {
			const siteInfo = await getSiteInfo( candidate );
			if ( siteInfo.ok && siteInfo.data.name ) {
				candidate.label = siteInfo.data.name;
			}
		}

		upsertConnection( candidate );
		return { ok: true, connection: toPublic( candidate ) };
	},
} );
