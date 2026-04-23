import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const isTestBuild = process.env.TEST_BUILD === '1';

const config: ForgeConfig = {
	packagerConfig: {
		asar: true,
		// The Agent SDK's JS is bundled inline by Vite, but its native binary
		// (`claude-agent-sdk-<platform>-<arch>/claude`) must live on disk at
		// runtime because it's execve'd by the SDK. Copy it into
		// Contents/Resources so process.resourcesPath resolves to it in
		// packaged builds.
		extraResource: [
			`./node_modules/@anthropic-ai/claude-agent-sdk-${ process.platform }-${ process.arch }`,
		],
	},
	rebuildConfig: {},
	makers: [
		new MakerSquirrel( {} ),
		new MakerZIP( {}, [ 'darwin' ] ),
		new MakerRpm( {} ),
		new MakerDeb( {} ),
	],
	plugins: [
		new VitePlugin( {
			// `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
			// If you are familiar with Vite configuration, it will look really familiar.
			build: [
				{
					entry: 'src/main/main.ts',
					config: 'vite.main.config.ts',
					target: 'main',
				},
				{
					entry: 'src/preload/preload.ts',
					config: 'vite.preload.config.ts',
					target: 'preload',
				},
			],
			renderer: [
				{
					name: 'main_window',
					config: 'vite.renderer.config.ts',
				},
			],
		} ),
		// Release builds use the full hardened set. TEST_BUILD=1 flips the
		// single fuse Playwright needs to attach its debugger. Cookie
		// encryption stays off until we add Developer ID code signing — an
		// unsigned build can't use the keychain and the fuse only produces
		// the errSecAuthFailed warning without providing real encryption.
		new FusesPlugin( {
			version: FuseVersion.V1,
			[ FuseV1Options.RunAsNode ]: false,
			[ FuseV1Options.EnableCookieEncryption ]: false,
			[ FuseV1Options.EnableNodeOptionsEnvironmentVariable ]: false,
			[ FuseV1Options.EnableNodeCliInspectArguments ]: isTestBuild,
			[ FuseV1Options.EnableEmbeddedAsarIntegrityValidation ]: true,
			[ FuseV1Options.OnlyLoadAppFromAsar ]: true,
		} ),
	],
};

export default config;
