import type { IpcMainInvokeEvent } from 'electron';
import type { ZodType } from 'zod';

export type BoundChannel = {
	name: string;
	invoke: (
		event: IpcMainInvokeEvent,
		payload: unknown
	) => unknown | Promise< unknown >;
};

// Binds a channel name to a zod-validated handler. The closure keeps the
// specific TInput / TRes types local to this call so the registry can hold
// a flat BoundChannel[] without TypeScript trying (and failing) to compute
// a union of generic Channel types in the router loop.
export function defineChannel< TInput, TRes >( def: {
	name: string;
	input: ZodType< TInput >;
	handle: (
		input: TInput,
		event: IpcMainInvokeEvent
	) => TRes | Promise< TRes >;
} ): BoundChannel {
	return {
		name: def.name,
		invoke: ( event, payload ) => {
			const input = def.input.parse( payload );
			return def.handle( input, event );
		},
	};
}
