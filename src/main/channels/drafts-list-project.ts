import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { draftsForProject } from './utils/drafts-for-project';
import { listProjects } from './utils/projects-list';
import { IpcChannels } from '.';
import type { Draft } from '../../types';

export const draftsListProject = defineChannel( {
	name: IpcChannels.draftsListProject,
	input: z.object( { projectId: z.string().min( 1 ) } ),
	handle: ( { projectId } ): Draft[] => {
		const project = listProjects().find( ( p ) => p.id === projectId );
		if ( ! project ) {
			return [];
		}
		return draftsForProject( project );
	},
} );
