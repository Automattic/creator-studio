import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getTaskManager } from './utils/task-manager';
import { IpcChannels } from '.';

// Manually trigger a saved task. `runId` is null when no definition with that
// id exists in the project.
export const tasksRun = defineChannel( {
	name: IpcChannels.tasksRun,
	input: z.object( {
		projectId: z.string().min( 1 ),
		id: z.string().min( 1 ),
	} ),
	handle: ( { projectId, id } ) => ( {
		runId: getTaskManager().runDefinition( projectId, id, 'manual' ),
	} ),
} );
