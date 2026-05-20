import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { resolveImportUrl } from './utils/resolve-import-url';
import { IpcChannels } from '.';
import { ResolvedUrlImport } from '../../types';

// Renderer-facing entry point for the legacy "Import URL" chat flow. Returns
// null on an unparseable URL so the modal can surface a validation error
// instead of throwing across IPC.
export const importResolveUrl = defineChannel( {
	name: IpcChannels.importResolveUrl,
	input: z.object( {
		url: z.string().min( 1 ),
		projectId: z.string().min( 1 ),
		subPath: z.string().optional(),
	} ),
	handle: ( { url, projectId, subPath } ): ResolvedUrlImport | null => {
		const project = getProject( projectId );
		if ( ! project ) {
			throw new Error( `Project ${ projectId } is not linked.` );
		}
		const resolved = resolveImportUrl( url, project, subPath );
		if ( ! resolved ) {
			return null;
		}
		return {
			kind: resolved.kind,
			normalizedUrl: resolved.normalizedUrl,
			chatTitle: `Import: ${ resolved.hostname }`,
			prompt: resolved.prompt,
		};
	},
} );
