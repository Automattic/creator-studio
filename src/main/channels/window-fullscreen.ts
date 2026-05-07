import { z } from 'zod';

import { defineEvent } from './utils/define-channel';
import { IpcChannels } from '.';

export const windowFullscreen = defineEvent( {
	name: IpcChannels.windowFullscreen,
	payload: z.boolean(),
} );
