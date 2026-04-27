import { readStore } from './project-store';
import type { Project } from '../../../types';

export function getProject( id: string ): Project | null {
	return readStore().projects.find( ( p ) => p.id === id ) ?? null;
}
