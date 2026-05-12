import { z } from 'zod';

import { AuthMode } from '../../types';
import { defineChannel } from './utils/define-channel';
import { readApiKey, writeApiKey } from './utils/env-file-store';
import { readStore, writeStore } from './utils/ui-prefs-store';
import { IpcChannels } from '.';

const settingsPatch = z
	.object( {
		anthropicApiKey: z.string().optional(),
		authMode: AuthMode.optional(),
	} )
	.strict();

export const settingsSet = defineChannel( {
	name: IpcChannels.settingsSet,
	input: settingsPatch,
	handle: ( patch ) => {
		if ( patch.anthropicApiKey !== undefined ) {
			writeApiKey( patch.anthropicApiKey );
		}
		if ( patch.authMode !== undefined ) {
			writeStore( { authMode: patch.authMode } );
		}
		return {
			anthropicApiKey: readApiKey(),
			authMode: readStore().authMode ?? 'api-key',
		};
	},
} );
