import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TEST_BUILD_MARKER = 'out/.test-build';

export default async function globalSetup() {
  const repoRoot = path.join(__dirname, '..');
  const arch = process.arch; // 'arm64' | 'x64'
  const appDir = path.join(
    repoRoot,
    `out/CreatorsStudio-darwin-${arch}/CreatorsStudio.app`,
  );
  const executable = path.join(appDir, 'Contents/MacOS/CreatorsStudio');
  const marker = path.join(repoRoot, TEST_BUILD_MARKER);

  // Re-package if either the binary or the test-build marker is missing.
  // The marker guards against tests silently running against a stale
  // release build a developer may have created with plain `npm run package`.
  const needsPackage = !fs.existsSync(executable) || !fs.existsSync(marker);

  if (needsPackage) {
    console.log('[global-setup] Packaging Electron test build…');
    execSync('npm run package', {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, TEST_BUILD: '1' },
    });
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, new Date().toISOString());
  }

  if (!fs.existsSync(executable)) {
    throw new Error(
      `Packaged Electron executable not found at ${executable}. ` +
        `Did 'npm run package' complete?`,
    );
  }

  process.env.APP_EXECUTABLE = executable;
}
