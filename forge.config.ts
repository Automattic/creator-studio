import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const isTestBuild = process.env.TEST_BUILD === '1';

// Code signing + notarization only run when Apple credentials are present in
// the environment. Dev packaging and e2e builds (TEST_BUILD=1) skip signing so
// they don't need a certificate; release builds set these vars in CI/locally.
const appleId = process.env.APPLE_ID;
const appleIdPassword = process.env.APPLE_ID_PASSWORD;
const appleTeamId = process.env.APPLE_TEAM_ID;
const canSign =
	! isTestBuild &&
	process.platform === 'darwin' &&
	!! ( appleId && appleIdPassword && appleTeamId );

const config: ForgeConfig = {
	packagerConfig: {
		asar: true,
		// electron-packager appends the platform-appropriate extension
		// (.icns on macOS). Source lives at build/icon-source.png.
		icon: 'build/icon',
		// Developer ID signing + Apple notarization. Without both, a
		// browser-downloaded build is quarantined and Gatekeeper rejects it
		// ("damaged"). Gated on `canSign` so unsigned dev/test builds still
		// work. Signs every nested Mach-O, including the Agent SDK's native
		// `claude` binary shipped via extraResource.
		osxSign: canSign
			? {
					optionsForFile: () => ( {
						entitlements: 'build/entitlements.mac.plist',
					} ),
			  }
			: undefined,
		osxNotarize: canSign
			? {
					appleId: appleId as string,
					appleIdPassword: appleIdPassword as string,
					teamId: appleTeamId as string,
			  }
			: undefined,
		// The Agent SDK's JS is bundled inline by Vite, but its native binary
		// (`claude-agent-sdk-<platform>-<arch>/claude`) must live on disk at
		// runtime because it's execve'd by the SDK. Copy it into
		// Contents/Resources so process.resourcesPath resolves to it in
		// packaged builds.
		extraResource: [
			`./node_modules/@anthropic-ai/claude-agent-sdk-${ process.platform }-${ process.arch }`,
			'./resources/claude-defaults.json',
			'./resources/prompts',
			'./resources/checks-defaults',
		],
	},
	rebuildConfig: {},
	makers: [
		new MakerSquirrel( {} ),
		new MakerZIP( {}, [ 'darwin' ] ),
		// Drag-to-Applications DMG. ULFO (LZFSE) keeps it small; the app's
		// LSMinimumSystemVersion is 12.0 so the 10.11+ format is safe. The
		// window background carries first-launch instructions: unsigned
		// builds are blocked by Gatekeeper until the user clears them once.
		// Background source is build/dmg/background.html, rendered to the PNGs
		// by `npm run dmg:background`; its 700x690 size sets the window size,
		// so the contents coordinates below must match that layout.
		new MakerDMG(
			{
				name: 'Studio Write',
				icon: 'build/icon.icns',
				background: 'build/dmg-background.png',
				iconSize: 128,
				contents: ( opts: { appPath: string } ) => [
					{ x: 186, y: 226, type: 'file', path: opts.appPath },
					{ x: 514, y: 226, type: 'link', path: '/Applications' },
					// Park the DMG's own metadata files off-canvas. Finder
					// hides them for most users, but anyone with "show all
					// files" enabled would otherwise see them dumped on top
					// of the instructions. `position` only writes an icon
					// coordinate — appdmg never requires the file to exist.
					{ x: 90, y: 780, type: 'position', path: '.background' },
					{ x: 250, y: 780, type: 'position', path: '.DS_Store' },
					{
						x: 410,
						y: 780,
						type: 'position',
						path: '.VolumeIcon.icns',
					},
					{ x: 570, y: 780, type: 'position', path: '.fseventsd' },
					{ x: 90, y: 920, type: 'position', path: '.Trashes' },
				],
				format: 'ULFO',
				overwrite: true,
			},
			[ 'darwin' ]
		),
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
	hooks: {
		// @electron/fuses re-signs the Electron binary during packageAfterCopy
		// — before electron-packager injects ElectronAsarIntegrity into
		// Info.plist. With no osxSign, nothing re-signs after that, so the
		// bundle ships sealing a stale Info.plist ("invalid Info.plist") and a
		// downloaded copy is rejected by Gatekeeper as "damaged". A deep
		// ad-hoc re-sign reseals the final bundle. When osxSign runs it
		// already deep-signs after every mutation, so this is skipped.
		postPackage: async ( _config, { platform, outputPaths } ) => {
			if ( canSign || platform !== 'darwin' ) {
				return;
			}
			for ( const outputPath of outputPaths ) {
				for ( const entry of readdirSync( outputPath ) ) {
					if ( ! entry.endsWith( '.app' ) ) {
						continue;
					}
					execFileSync(
						'codesign',
						[
							'--force',
							'--deep',
							'--sign',
							'-',
							join( outputPath, entry ),
						],
						{ stdio: 'inherit' }
					);
				}
			}
		},
	},
};

export default config;
