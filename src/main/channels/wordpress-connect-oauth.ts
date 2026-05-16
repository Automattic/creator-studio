import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getClientId, runOauthFlow } from './utils/wordpress-oauth';
import {
	encryptSecret,
	findByWpcomBlogId,
	toPublic,
	upsertConnection,
} from './utils/wordpress-store';
import { IpcChannels } from '.';
import type {
	WordpressConnection,
	WordpressConnectionPublic,
} from '../../types';

const Input = z.object( {} ).optional();

export type ConnectOauthResult =
	| {
			ok: true;
			// Every connection touched by this OAuth round-trip — new
			// sites plus existing ones whose token we just refreshed.
			// Sorted in the order returned by /me/sites so the picker
			// reflects the user's account.
			connections: WordpressConnectionPublic[];
			createdCount: number;
			updatedCount: number;
	  }
	| {
			ok: false;
			reason:
				| 'missing-client-id'
				| 'user-cancelled'
				| 'token-exchange-failed'
				| 'no-site'
				| 'network';
			status?: number;
			message?: string;
	  };

export const wordpressConnectOauth = defineChannel( {
	name: IpcChannels.wordpressConnectOauth,
	input: Input,
	handle: async (): Promise< ConnectOauthResult > => {
		if ( ! getClientId() ) {
			return { ok: false, reason: 'missing-client-id' };
		}

		const result = await runOauthFlow();
		if ( result.ok === false ) {
			const err = result.error;
			if ( err.kind === 'token-exchange-failed' ) {
				return {
					ok: false,
					reason: 'token-exchange-failed',
					status: err.status,
					message: err.body,
				};
			}
			if ( err.kind === 'network' || err.kind === 'no-site' ) {
				return {
					ok: false,
					reason: err.kind,
					message: err.message,
				};
			}
			return { ok: false, reason: err.kind };
		}

		const { accessToken, sites } = result.data;
		const cipher = encryptSecret( accessToken );
		const connections: WordpressConnectionPublic[] = [];
		let createdCount = 0;
		let updatedCount = 0;

		// One connection per blog. Dedup is by numeric wpcomBlogId —
		// if we already have a record for that blog we refresh its
		// token (and label, in case it was renamed on WP.com) while
		// preserving the existing connection id so any drafts whose
		// frontmatter binds to it stay linked.
		for ( const site of sites ) {
			const existing = findByWpcomBlogId( site.blogId );
			const connection: WordpressConnection = {
				id: existing?.id ?? randomUUID(),
				label: site.blogName,
				siteUrl: site.blogUrl,
				kind: 'wpcom-oauth',
				secretCipher: cipher,
				wpcomBlogId: site.blogId,
				createdAt: existing?.createdAt ?? Date.now(),
			};
			upsertConnection( connection );
			connections.push( toPublic( connection ) );
			if ( existing ) {
				updatedCount += 1;
			} else {
				createdCount += 1;
			}
		}

		return { ok: true, connections, createdCount, updatedCount };
	},
} );
