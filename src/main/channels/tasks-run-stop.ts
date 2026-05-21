import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getTaskManager } from './utils/task-manager';
import { IpcChannels } from '.';

export const tasksRunStop = defineChannel( {
	name: IpcChannels.tasksRunStop,
	input: z.object( {
		runId: z.string().min( 1 ),
	} ),
	handle: ( { runId } ) => ( {
		ok: getTaskManager().stopRun( runId ),
	} ),
} );
