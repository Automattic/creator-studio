import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { readProjectUiPrefs } from './utils/project-ui-prefs-store';
import { IpcChannels } from '.';

export const projectUiPrefsGet = defineChannel( {
	name: IpcChannels.projectUiPrefsGet,
	input: z.object( { projectId: z.string().min( 1 ) } ),
	handle: ( { projectId } ) => readProjectUiPrefs( projectId ),
} );
