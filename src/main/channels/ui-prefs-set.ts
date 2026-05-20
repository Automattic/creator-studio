import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { writeStore } from './utils/ui-prefs-store';
import { DraftSidebarTab } from '../../types';
import { IpcChannels } from '.';

const uiPrefsPatch = z
	.object( {
		resourcesPanelOpen: z.boolean().optional(),
		closedChatIdsByProject: z
			.record( z.string(), z.array( z.string() ) )
			.optional(),
		draftSidebarOpen: z.boolean().optional(),
		draftSidebarTab: DraftSidebarTab.optional(),
		languageAidEnabled: z.boolean().optional(),
	} )
	.strict();

export const uiPrefsSet = defineChannel( {
	name: IpcChannels.uiPrefsSet,
	input: uiPrefsPatch,
	handle: ( patch ) => writeStore( patch ),
} );
