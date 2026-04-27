import type { WebContents } from 'electron';

import { AgentService } from './agent-service';

const services = new Map< number, Map< string, AgentService > >();

export function getOrCreateAgentService(
	contents: WebContents,
	projectId: string
): AgentService {
	let perProject = services.get( contents.id );
	if ( ! perProject ) {
		perProject = new Map();
		services.set( contents.id, perProject );
		contents.once( 'destroyed', () => services.delete( contents.id ) );
	}
	let service = perProject.get( projectId );
	if ( ! service ) {
		service = new AgentService( contents, projectId );
		perProject.set( projectId, service );
	}
	return service;
}

export function getAgentService(
	contents: WebContents,
	projectId: string
): AgentService | undefined {
	return services.get( contents.id )?.get( projectId );
}
