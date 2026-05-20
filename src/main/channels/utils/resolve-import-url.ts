/**
 * Shared URL-import resolution: classifies a URL and loads the matching
 * per-kind prompt. Used by both the legacy `import:resolveUrl` channel and
 * the task-based `tasks:importUrl` flow.
 */
import path from 'node:path';

import { loadPrompt } from './prompts';
import { resolveBundledPromptPath } from './resource-paths';
import { classifyUrl } from './url-classifier';
import type { Project, UrlImportKind } from '../../../types';

const SOURCES_FOLDER = 'sources';

export type ResolvedImport = {
	kind: UrlImportKind;
	normalizedUrl: string;
	hostname: string;
	prompt: string;
};

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

// Returns null on an unparseable URL so callers can surface a validation
// error rather than throwing across IPC.
export function resolveImportUrl(
	url: string,
	project: Project,
	subPath?: string
): ResolvedImport | null {
	const classification = classifyUrl( url );
	if ( ! classification ) {
		return null;
	}
	const sourcesRoot = path.resolve( project.path, SOURCES_FOLDER );
	// `subPath` must resolve inside `sources/`; fall back to the sources root
	// so a renderer bug can't redirect the import elsewhere in the project.
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
		resolveBundledPromptPath( `import-url/${ classification.kind }.md` ),
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
		hostname: classification.hostname,
		prompt,
	};
}
