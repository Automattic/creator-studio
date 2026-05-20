import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getTaskManager } from './utils/task-manager';
import { IpcChannels } from '.';

// Saved task definitions. Omit `projectId` for every project (the global
// Tasks view); pass it to scope to one project.
export const tasksList = defineChannel( {
	name: IpcChannels.tasksList,
	input: z.object( {
		projectId: z.string().min( 1 ).optional(),
	} ),
	handle: ( { projectId } ) => getTaskManager().listDefinitions( projectId ),
} );
