import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { removeConnection } from './utils/wordpress-store';
import { IpcChannels } from '.';

const Input = z.object( {
	id: z.string().min( 1 ),
} );

export const wordpressDisconnect = defineChannel( {
	name: IpcChannels.wordpressDisconnect,
	input: Input,
	handle: ( input ): { ok: boolean } => {
		return { ok: removeConnection( input.id ) };
	},
} );
