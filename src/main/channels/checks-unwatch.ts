import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { unsubscribeFolder } from './utils/folder-watcher';
import { IpcChannels } from '.';

export const checksUnwatch = defineChannel( {
	name: IpcChannels.checksUnwatch,
	input: z.object( {} ),
	handle: ( _input, event ): { ok: true } => {
		unsubscribeFolder( event.sender );
		return { ok: true };
	},
} );
