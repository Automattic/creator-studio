import { z } from 'zod';

import { defaultParentDir } from './project-create-new';
import { defineChannel } from './utils/define-channel';
import { IpcChannels } from '.';

// Exposes the default parent directory for newly created projects so the
// renderer can preview the resolved path without hardcoding the Electron
// userData/documents layout.
export const projectDefaultParentDir = defineChannel( {
	name: IpcChannels.projectDefaultParentDir,
	input: z.void(),
	handle: (): string => defaultParentDir(),
} );
