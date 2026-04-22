import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export default async function globalSetup() {
  const repoRoot = path.join(__dirname, '..');
  const arch = process.arch; // 'arm64' | 'x64'
  const appDir = path.join(
    repoRoot,
    `out/CreatorsStudio-darwin-${arch}/CreatorsStudio.app`,
  );
  const executable = path.join(appDir, 'Contents/MacOS/CreatorsStudio');

  if (!fs.existsSync(executable)) {
    console.log('[global-setup] Packaging Electron app (one-time)…');
    execSync('npm run package', { cwd: repoRoot, stdio: 'inherit' });
  }

  if (!fs.existsSync(executable)) {
    throw new Error(
      `Packaged Electron executable not found at ${executable}. ` +
        `Did 'npm run package' complete?`,
    );
  }

  process.env.APP_EXECUTABLE = executable;
}
