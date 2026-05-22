// Renders build/dmg/background.html to the DMG background PNGs.
// appdmg picks up the `@2x` companion automatically and packs both into a
// Retina-aware .tiff. Re-run after editing the HTML: `npm run dmg:background`.
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const source = join( root, 'build/dmg/background.html' );

// Must match the window size in forge.config.ts (appdmg sizes the DMG window
// to the background image's pixel dimensions).
const WIDTH = 700;
const HEIGHT = 640;

const targets = [
	{ scale: 1, file: 'build/dmg-background.png' },
	{ scale: 2, file: 'build/dmg-background@2x.png' },
];

const browser = await chromium.launch();
try {
	for ( const { scale, file } of targets ) {
		const page = await browser.newPage( {
			viewport: { width: WIDTH, height: HEIGHT },
			deviceScaleFactor: scale,
		} );
		await page.goto( pathToFileURL( source ).href );
		await page.evaluate( () => document.fonts.ready );
		const out = join( root, file );
		await page.screenshot( {
			path: out,
			clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
		} );
		await page.close();
		// eslint-disable-next-line no-console
		console.log(
			`wrote ${ file } (${ WIDTH * scale }×${ HEIGHT * scale })`
		);
	}
} finally {
	await browser.close();
}
