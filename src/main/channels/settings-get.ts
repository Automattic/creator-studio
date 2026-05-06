import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { readApiKey } from './utils/env-file-store';
import { IpcChannels } from '.';

export const settingsGet = defineChannel( {
	name: IpcChannels.settingsGet,
	input: z.void(),
	handle: () => ( { anthropicApiKey: readApiKey() } ),
} );
