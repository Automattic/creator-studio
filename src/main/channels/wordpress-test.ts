import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { verifyConnection } from './utils/wordpress-client';
import { getConnection } from './utils/wordpress-store';
import { IpcChannels } from '.';

const Input = z.object( {
	id: z.string().min( 1 ),
} );

export type WordpressTestResult =
	| { ok: true; userName: string }
	| {
			ok: false;
			reason:
				| 'not-found'
				| 'unauthorized'
				| 'forbidden'
				| 'rest-disabled'
				| 'http-not-found'
				| 'network'
				| 'http-error';
			status?: number;
			message?: string;
	  };

export const wordpressTest = defineChannel( {
	name: IpcChannels.wordpressTest,
	input: Input,
	handle: async ( input ): Promise< WordpressTestResult > => {
		const connection = getConnection( input.id );
		if ( ! connection ) {
			return { ok: false, reason: 'not-found' };
		}
		const result = await verifyConnection( connection );
		if ( result.ok === true ) {
			return { ok: true, userName: result.data.name };
		}
		let reason:
			| 'unauthorized'
			| 'forbidden'
			| 'rest-disabled'
			| 'http-not-found'
			| 'network'
			| 'http-error';
		if ( result.reason === 'not-found' ) {
			reason = 'http-not-found';
		} else if ( result.reason === 'parse-error' ) {
			reason = 'http-error';
		} else {
			reason = result.reason;
		}
		return {
			ok: false,
			reason,
			status: result.status,
			message: result.message,
		};
	},
} );
