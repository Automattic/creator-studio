import { z } from 'zod';

import { IpcChannels } from '../ipc';
import { loadPromptWithProjectPath } from '../services/utilities/prompts';
import { resolveBundledPromptPath } from '../services/utilities/resource-paths';
import { getProject } from '../services/project-get';
import { defineChannel } from './utils/define-channel';
import { PromptName } from '../../types';

export const promptGet = defineChannel( {
	name: IpcChannels.promptGet,
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
