import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { draftsForProject } from './utils/drafts-for-project';
import { listProjects } from './utils/projects-list';
import { IpcChannels } from '.';
import type { Draft } from '../../types';

export const draftsListAll = defineChannel( {
	name: IpcChannels.draftsListAll,
	input: z.void(),
	handle: (): Draft[] => {
		const out: Draft[] = [];
		for ( const project of listProjects() ) {
			out.push( ...draftsForProject( project ) );
		}
		out.sort( ( a, b ) => b.mtime - a.mtime );
		return out;
	},
} );
