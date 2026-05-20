import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { removeConnectionsByWpcomAccountId } from './utils/wordpress-store';
import { IpcChannels } from '.';

const Input = z.object( {
	accountId: z.number().int().positive(),
} );

export const wordpressDisconnectAccount = defineChannel( {
	name: IpcChannels.wordpressDisconnectAccount,
	input: Input,
	handle: ( input ): { removedCount: number } => {
		return {
			removedCount: removeConnectionsByWpcomAccountId( input.accountId ),
		};
	},
} );
