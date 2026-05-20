import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getTaskManager } from './utils/task-manager';
import { IpcChannels } from '.';

// Task runs (most recent first). Omit `projectId` for the global Tasks view.
export const tasksRunList = defineChannel( {
	name: IpcChannels.tasksRunList,
	input: z.object( {
		projectId: z.string().min( 1 ).optional(),
	} ),
	handle: ( { projectId } ) => getTaskManager().listRuns( projectId ),
} );
