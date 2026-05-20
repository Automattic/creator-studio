import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getTaskManager } from './utils/task-manager';
import { IpcChannels } from '.';

// The transcript of a task run, as PersistedMessage[] — the same format the
// chat transcript uses, so the renderer can render it with ChatTranscript.
export const tasksRunLoad = defineChannel( {
	name: IpcChannels.tasksRunLoad,
	input: z.object( {
		projectId: z.string().min( 1 ),
		runId: z.string().min( 1 ),
	} ),
	handle: ( { projectId, runId } ) =>
		getTaskManager().getRunMessages( projectId, runId ),
} );
