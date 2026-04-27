import { getProject } from './project-get';
import { loadPromptWithProjectPath } from './utils/prompts';
import { resolveBundledPromptPath } from './utils/resource-paths';
import type { PromptName } from '../../types';

export function getPrompt( name: PromptName, projectId: string ): string {
	const project = getProject( projectId );
	if ( ! project ) {
		throw new Error( `Project ${ projectId } is not linked.` );
	}
	return loadPromptWithProjectPath(
		resolveBundledPromptPath( `${ name }.md` ),
		project.path
	);
}
