import path from 'node:path';

import { getProject } from './project-get';

export type TouchedDraft = {
	folder: 'drafts' | 'done';
	relPath: string;
};

// Returns the draft folder + project-relative path if the tool_use's file
// argument lives inside <project>/drafts or <project>/done. Returns null for
// any other tool, any path outside those folders, or a malformed input.
//
// `MultiEdit` and `NotebookEdit` use the same `file_path` argument as Edit and
// Write, so a single field check covers all four. `Bash` writes are out of
// scope — we can't statically infer which file a shell command touched.
export function classifyToolEdit(
	projectId: string,
	toolName: string,
	input: unknown
): TouchedDraft | null {
	if (
		toolName !== 'Edit' &&
		toolName !== 'Write' &&
		toolName !== 'MultiEdit' &&
		toolName !== 'NotebookEdit'
	) {
		return null;
	}
	if ( ! input || typeof input !== 'object' ) {
		return null;
	}
	const filePath = ( input as { file_path?: unknown } ).file_path;
	if ( typeof filePath !== 'string' || filePath.length === 0 ) {
		return null;
	}
	const project = getProject( projectId );
	if ( ! project ) {
		return null;
	}
	const projectRoot = path.resolve( project.path );
	const target = path.resolve( filePath );
	for ( const folder of [ 'drafts', 'done' ] as const ) {
		const folderRoot = path.resolve( projectRoot, folder );
		if (
			target === folderRoot ||
			target.startsWith( folderRoot + path.sep )
		) {
			return {
				folder,
				relPath: path.relative( folderRoot, target ),
			};
		}
	}
	return null;
}
