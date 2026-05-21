declare module 'js-yaml' {
	interface DumpOptions {
		lineWidth?: number;
	}
	export function dump( obj: unknown, opts?: DumpOptions ): string;
}
