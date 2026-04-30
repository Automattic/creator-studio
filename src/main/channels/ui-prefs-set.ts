import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { writeStore } from './utils/ui-prefs-store';
import { IpcChannels } from '.';

const uiPrefsPatch = z
	.object( {
		resourcesPanelOpen: z.boolean().optional(),
		closedChatIdsByProject: z
			.record( z.string(), z.array( z.string() ) )
			.optional(),
	} )
	.strict();

export const uiPrefsSet = defineChannel( {
	name: IpcChannels.uiPrefsSet,
	input: uiPrefsPatch,
	handle: ( patch ) => writeStore( patch ),
} );
