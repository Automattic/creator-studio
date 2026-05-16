import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getClientId, runOauthFlow } from './utils/wordpress-oauth';
import {
	addConnection,
	encryptSecret,
	toPublic,
} from './utils/wordpress-store';
import { IpcChannels } from '.';
import type {
	WordpressConnection,
	WordpressConnectionPublic,
} from '../../types';

const Input = z.object( {} ).optional();

export type ConnectOauthResult =
	| { ok: true; connection: WordpressConnectionPublic }
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

		const { accessToken, blogId, blogUrl, blogName } = result.data;
		const connection: WordpressConnection = {
			id: randomUUID(),
			label: blogName,
			siteUrl: blogUrl,
			kind: 'wpcom-oauth',
			secretCipher: encryptSecret( accessToken ),
			wpcomBlogId: blogId,
			createdAt: Date.now(),
		};
		addConnection( connection );
		return { ok: true, connection: toPublic( connection ) };
	},
} );
