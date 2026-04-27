import { z } from 'zod';

import { IpcChannels } from '../ipc';
import { listProjects } from '../services/projects-list';
import { defineChannel } from './utils/define-channel';

export const projectsList = defineChannel( {
	name: IpcChannels.projectsList,
	input: z.void(),
	handle: () => listProjects(),
} );
