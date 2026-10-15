import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const command = ['safari-web-extension-packager', 'safari-web-extension-converter'].find((tool) => spawnSync('xcrun', ['--find', tool], { encoding: 'utf8' }).status === 0);
if (!command) {
  console.error('A Safari csomagolóeszköz nem érhető el. Telepítse a teljes Xcode-ot, válassza ki aktív fejlesztői eszközként, majd futtassa újra. A Command Line Tools önmagában nem elegendő.');
  process.exitCode = 1;
} else {
  const result = spawnSync('xcrun', [command, 'dist/safari', '--project-location', 'dist/safari-xcode', '--app-name', 'Egyszeru Etelrendeles', '--bundle-identifier', 'hu.egyszerurendeles.beres', '--swift'], { cwd: root, stdio: 'inherit' });
  process.exitCode = result.status || (result.error ? 1 : 0);
}
