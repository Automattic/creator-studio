import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { unsubscribe } from './utils/note-watcher';
import { IpcChannels } from '.';

export const notesUnwatch = defineChannel( {
	name: IpcChannels.notesUnwatch,
	input: z.object( {} ),
	handle: ( _input, event ): { ok: true } => {
		unsubscribe( event.sender );
		return { ok: true };
	},
} );
