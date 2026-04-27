import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { listProjects } from './utils/projects-list';
import { IpcChannels } from '.';

export const projectsList = defineChannel( {
	name: IpcChannels.projectsList,
	input: z.void(),
	handle: () => listProjects(),
} );
