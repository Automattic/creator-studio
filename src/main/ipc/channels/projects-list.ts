import { z } from 'zod';

import { IpcChannels } from '..';
import { listProjects } from '../../services/project';
import { defineChannel } from './utils/define-channel';

export const projectsList = defineChannel( {
	name: IpcChannels.projectsList,
	input: z.void(),
	handle: () => listProjects(),
} );
