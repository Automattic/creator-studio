import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { readStore } from './utils/ui-prefs-store';
import { IpcChannels } from '.';

export const uiPrefsGet = defineChannel( {
	name: IpcChannels.uiPrefsGet,
	input: z.void(),
	handle: () => readStore(),
} );
