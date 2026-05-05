// Ambient declarations for Vite-specific import suffixes used in the renderer.
// Kept in a non-module file (no top-level import/export) so the `declare
// module` rules apply globally rather than only when this file is imported.

// Vite's `?url` query: turns an asset import into the resolved asset URL at
// build time. Used by ResourcePreview to wire pdf.js's worker without
// reaching for `import.meta.url`, which tsc rejects under module=commonjs.
declare module '*?url' {
	const src: string;
	export default src;
}
