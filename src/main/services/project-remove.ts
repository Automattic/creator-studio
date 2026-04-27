import { readStore, writeStore } from './utilities/project-store';

export function removeProject( id: string ): void {
	const store = readStore();
	store.projects = store.projects.filter( ( p ) => p.id !== id );
	writeStore( store );
}
