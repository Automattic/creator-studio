import { z } from 'zod';

import { listProjects } from '../services/projects-list';
import { defineChannel } from './utils/define-channel';
import { IpcChannels } from '.';

export const projectsList = defineChannel( {
	name: IpcChannels.projectsList,
	input: z.void(),
	handle: () => listProjects(),
} );
