import { z } from 'zod';

import { IpcChannels } from '..';
import { loadPromptWithProjectPath } from '../../services/prompts';
import { resolveBundledPromptPath } from '../../services/agent';
import { getProject } from '../../services/project';
import { defineChannel } from './utils/define-channel';
import { PromptName } from '../../../types';

export const promptsGet = defineChannel( {
	name: IpcChannels.promptsGet,
	input: z.object( {
		name: PromptName,
		projectId: z.string().min( 1 ),
	} ),
	handle: ( { name, projectId } ) => {
		const project = getProject( projectId );
		if ( ! project ) {
			throw new Error( `Project ${ projectId } is not linked.` );
		}
		return loadPromptWithProjectPath(
			resolveBundledPromptPath( `${ name }.md` ),
			project.path
		);
	},
} );
