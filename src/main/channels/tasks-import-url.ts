import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { resolveImportUrl } from './utils/resolve-import-url';
import { getTaskManager } from './utils/task-manager';
import { IpcChannels } from '.';

// Importing a resource URL runs as a one-off background task (no chat). The
// URL is classified and the matching import prompt is queued as the run's
// instructions.
export const tasksImportUrl = defineChannel( {
	name: IpcChannels.tasksImportUrl,
	input: z.object( {
		url: z.string().min( 1 ),
		projectId: z.string().min( 1 ),
		subPath: z.string().optional(),
	} ),
	handle: ( {
		url,
		projectId,
		subPath,
	} ): { runId: string | null; error: 'bad-url' | 'not-found' | null } => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { runId: null, error: 'not-found' };
		}
		const resolved = resolveImportUrl( url, project, subPath );
		if ( ! resolved ) {
			return { runId: null, error: 'bad-url' };
		}
		const runId = getTaskManager().enqueueOneOff( {
			projectId,
			title: `Import: ${ resolved.hostname }`,
			kind: 'import-url',
			prompt: resolved.prompt,
		} );
		if ( ! runId ) {
			return { runId: null, error: 'not-found' };
		}
		return { runId, error: null };
	},
} );
