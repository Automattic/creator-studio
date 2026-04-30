import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { writeProjectUiPrefs } from './utils/project-ui-prefs-store';
import { IpcChannels } from '.';

const patchSchema = z
	.object( {
		resourcesCollapsed: z.record( z.string(), z.boolean() ).optional(),
	} )
	.strict();

export const projectUiPrefsSet = defineChannel( {
	name: IpcChannels.projectUiPrefsSet,
	input: z.object( {
		projectId: z.string().min( 1 ),
		patch: patchSchema,
	} ),
	handle: ( { projectId, patch } ) => writeProjectUiPrefs( projectId, patch ),
} );
