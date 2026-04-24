import type { IpcMainInvokeEvent, WebContents } from 'electron';
import type { ZodType } from 'zod';

export type BoundChannel = {
	name: string;
	invoke: (
		event: IpcMainInvokeEvent,
		payload: unknown
	) => unknown | Promise< unknown >;
};

// Binds a renderer → main invoke channel. The closure keeps the specific
// TInput / TRes types local to this call so the registry can hold a flat
// BoundChannel[] without TypeScript trying (and failing) to compute a
// union of generic Channel types in the router loop.
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

export type EventChannel< T > = {
	name: string;
	emit: ( webContents: WebContents, payload: T ) => void;
};

// Binds a main → renderer push channel (webContents.send / ipcRenderer.on).
// `payload` is captured for typing the `emit` signature; runtime validation
// is intentionally not performed — emit must stay cheap on the streaming path.
export function defineEvent< T >( def: {
	name: string;
	payload: ZodType< T >;
} ): EventChannel< T > {
	return {
		name: def.name,
		emit: ( webContents, payload ) => {
			if ( webContents.isDestroyed() ) {
				return;
			}
			webContents.send( def.name, payload );
		},
	};
}
