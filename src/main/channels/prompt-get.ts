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
		// Absolute file path; used by contextual prompts (e.g. discuss-draft)
		// that need to point the agent at a specific file. Substitutes
		// `{{file}}` in the template.
		filePath: z.string().optional(),
	} ),
	handle: ( { name, projectId, filePath } ) => {
		const project = getProject( projectId );
		if ( ! project ) {
			throw new Error( `Project ${ projectId } is not linked.` );
		}
		const vars: Record< string, string > = { project: project.path };
		if ( filePath !== undefined ) {
			vars.file = filePath;
		}
		return loadPrompt( resolveBundledPromptPath( `${ name }.md` ), vars );
	},
} );
