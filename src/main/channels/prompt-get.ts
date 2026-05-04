import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { loadPrompt } from './utils/prompts';
import { resolveBundledPromptPath } from './utils/resource-paths';
import { IpcChannels } from '.';
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
		return loadPrompt( resolveBundledPromptPath( `${ name }.md` ), {
			project: project.path,
		} );
	},
} );
