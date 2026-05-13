import path from 'node:path';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { loadPrompt } from './utils/prompts';
import { resolveBundledPromptPath } from './utils/resource-paths';
import { classifyUrl } from './utils/url-classifier';
import { IpcChannels } from '.';
import { ResolvedUrlImport } from '../../types';

const SOURCES_FOLDER = 'sources';

function resolveInside( root: string, subPath: string ): string | null {
	const target = path.resolve( root, subPath );
	const rootResolved = path.resolve( root );
	if (
		target !== rootResolved &&
		! target.startsWith( rootResolved + path.sep )
	) {
		return null;
	}
	return target;
}

// Renderer-facing entry point for the "Import URL" flow. Classifies the URL,
// loads the matching per-kind prompt, and returns everything the renderer
// needs to spin up a chat in one round-trip — same shape as if `prompt:get`
// + classification were merged into a single call. Returns null on an
// unparseable URL so the modal can surface a validation error instead of
// throwing across IPC.
export const importResolveUrl = defineChannel( {
	name: IpcChannels.importResolveUrl,
	input: z.object( {
		url: z.string().min( 1 ),
		projectId: z.string().min( 1 ),
		// Optional destination directory (relative to the project root) where
		// the agent should write the imported markdown. Must resolve inside
		// `sources/`; falls back to the sources root otherwise so a renderer
		// bug can't redirect the import elsewhere in the project.
		subPath: z.string().optional(),
	} ),
	handle: ( { url, projectId, subPath } ): ResolvedUrlImport | null => {
		const project = getProject( projectId );
		if ( ! project ) {
			throw new Error( `Project ${ projectId } is not linked.` );
		}
		const classification = classifyUrl( url );
		if ( ! classification ) {
			return null;
		}
		const sourcesRoot = path.resolve( project.path, SOURCES_FOLDER );
		const resolvedDir = subPath
			? resolveInside( project.path, subPath )
			: sourcesRoot;
		const sourcesFolder =
			resolvedDir &&
			( resolvedDir === sourcesRoot ||
				resolvedDir.startsWith( sourcesRoot + path.sep ) )
				? resolvedDir
				: sourcesRoot;
		const prompt = loadPrompt(
			resolveBundledPromptPath(
				`import-url/${ classification.kind }.md`
			),
			{
				project: project.path,
				url: classification.normalizedUrl,
				importedAt: new Date().toISOString().slice( 0, 10 ),
				sourcesFolder,
			}
		);
		return {
			kind: classification.kind,
			normalizedUrl: classification.normalizedUrl,
			chatTitle: `Import: ${ classification.hostname }`,
			prompt,
		};
	},
} );
