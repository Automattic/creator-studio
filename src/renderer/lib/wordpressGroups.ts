import type { WordpressConnectionPublic } from '../../types';

export type WordpressAccountGroup = {
	accountId: number;
	username: string;
	connections: WordpressConnectionPublic[];
};

// Bucket WPCOM connections by their account so consumers can fold
// "Acme Corp's 5 sites" under a single header. Anything without an
// account id (app-password connections, plus pre-upgrade WPCOM rows
// that never got stamped) falls into `flat` and renders as a tail
// list of independent rows.
export function groupWordpressConnections(
	connections: WordpressConnectionPublic[]
): {
	accounts: WordpressAccountGroup[];
	flat: WordpressConnectionPublic[];
} {
	const byAccount = new Map< number, WordpressAccountGroup >();
	const flat: WordpressConnectionPublic[] = [];
	for ( const connection of connections ) {
		if (
			connection.kind === 'wpcom-oauth' &&
			typeof connection.wpcomAccountId === 'number'
		) {
			const id = connection.wpcomAccountId;
			let group = byAccount.get( id );
			if ( ! group ) {
				group = {
					accountId: id,
					username:
						connection.wpcomAccountUsername ??
						'WordPress.com account',
					connections: [],
				};
				byAccount.set( id, group );
			}
			group.connections.push( connection );
		} else {
			flat.push( connection );
		}
	}
	return { accounts: Array.from( byAccount.values() ), flat };
}
