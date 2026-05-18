import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { seedDefaultChecks } from './utils/checks-seed';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

export type CheckResetDefaultsResult =
	| { ok: true; written: string[] }
	| { ok: false; reason: 'not-found' | 'io-error' };

export const checksResetDefaults = defineChannel( {
	name: IpcChannels.checksResetDefaults,
	input: z.object( {
		projectId: z.string().min( 1 ),
	} ),
	handle: ( { projectId } ): CheckResetDefaultsResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		return seedDefaultChecks( project.path );
	},
} );
