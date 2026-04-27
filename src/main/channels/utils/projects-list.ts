import { readStore } from './project-store';
import type { Project } from '../../../types';

export function listProjects(): Project[] {
	return readStore().projects;
}
