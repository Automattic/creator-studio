import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { readStore, writeStore } from './utils/project-store';
import type { Project } from '../../types';

// Always writes a new record. Two projects on the same path are allowed
// (different name + goal). The renderer is responsible for the duplicate UX.
export function createProject( input: {
	path: string;
	name: string;
	goal?: string;
} ): Project {
	const store = readStore();
	const project: Project = {
		id: randomUUID(),
		path: input.path,
		label: path.basename( input.path ),
		name: input.name,
		goal: input.goal,
	};
	store.projects.push( project );
	writeStore( store );
	return project;
}
