import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { readApiKey, writeApiKey } from './utils/env-file-store';
import { IpcChannels } from '.';

const settingsPatch = z
	.object( {
		anthropicApiKey: z.string(),
	} )
	.strict();

export const settingsSet = defineChannel( {
	name: IpcChannels.settingsSet,
	input: settingsPatch,
	handle: ( patch ) => {
		writeApiKey( patch.anthropicApiKey );
		return { anthropicApiKey: readApiKey() };
	},
} );
