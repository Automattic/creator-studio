import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { unsubscribe } from './utils/draft-watcher';
import { IpcChannels } from '.';

export const draftsUnwatch = defineChannel( {
	name: IpcChannels.draftsUnwatch,
	input: z.object( {} ),
	handle: ( _input, event ): { ok: true } => {
		unsubscribe( event.sender );
		return { ok: true };
	},
} );
