import { z } from 'zod';

import { getPrompt } from '../services/prompt-get';
import { defineChannel } from './utils/define-channel';
import { IpcChannels } from '.';
import { PromptName } from '../../types';

export const promptGet = defineChannel( {
	name: IpcChannels.promptGet,
	input: z.object( {
		name: PromptName,
		projectId: z.string().min( 1 ),
	} ),
	handle: ( { name, projectId } ) => getPrompt( name, projectId ),
} );
