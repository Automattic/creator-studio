import { z } from 'zod';

import { IpcChannels, PromptName } from '..';
import { loadPromptWithFolder } from '../../prompts';
import { resolveBundledPromptPath } from '../../services/agent';
import { getFolder } from '../../services/folder';
import { defineChannel } from '../define-channel';

export const promptsGet = defineChannel( {
	name: IpcChannels.promptsGet,
	input: z.object( {
		name: PromptName,
		folderId: z.string().min( 1 ),
	} ),
	handle: ( { name, folderId } ) => {
		const folder = getFolder( folderId );
		if ( ! folder ) {
			throw new Error( `Folder ${ folderId } is not linked.` );
		}
		return loadPromptWithFolder(
			resolveBundledPromptPath( `${ name }.md` ),
			folder.path
		);
	},
} );
