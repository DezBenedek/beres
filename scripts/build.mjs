import { mkdir, readdir, readFile, writeFile, rm, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'extension');
const dist = path.join(root, 'dist');
await mkdir(path.join(source, 'icons'), { recursive: true });
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([len, name, data, crc]);
}
function icon(size) {
  const scale = 4;
  const samples = size * scale;
  const image = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const channels = [0, 0, 0, 0];
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        const px = (x * scale + sx + .5) / samples;
        const py = (y * scale + sy + .5) / samples;
        const rx = Math.max(.16 - px, 0, px - .84);
        const ry = Math.max(.16 - py, 0, py - .84);
        const inside = rx * rx + ry * ry <= .16 ** 2;
        let rgb = [36, 93, 67];
        const r = Math.hypot(px - .5, py - .5);
        const plate = r > .255 && r < .282;
        const u = (px - .51 + py - .47) / Math.SQRT2;
        const v = (px - .51 - py + .47) / Math.SQRT2;
        const leaf = (u / .16) ** 2 + (v / .082) ** 2 < 1;
        const stem = Math.abs(py - (1.03 - px)) < .012 && px > .35 && px < .59;
        if (plate || leaf || stem) rgb = [249, 252, 244];
        rgb.forEach((n, i) => channels[i] += n);
        channels[3] += inside ? 255 : 0;
      }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      channels.forEach((n, i) => image[offset + i] = Math.round(n / (scale * scale)));
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(image)), chunk('IEND', Buffer.alloc(0))]);
}
for (const size of [16, 32, 48, 128]) await writeFile(path.join(source, 'icons', `icon-${size}.png`), icon(size));
await mkdir(dist, { recursive: true });
const baseManifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
for (const browser of ['chromium', 'firefox', 'safari']) {
  const folder = path.join(dist, browser);
  await rm(folder, { recursive: true, force: true });
  await cp(source, folder, { recursive: true });
  const manifest = structuredClone(baseManifest);
  if (browser === 'firefox') manifest.browser_specific_settings = {
    gecko: { id: '@beres-egyszeru-rendeles', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } }
  };
  if (browser === 'safari') manifest.browser_specific_settings = { safari: { strict_min_version: '17.0' } };
  await writeFile(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  for (const content of manifest.content_scripts) {
    for (const asset of [...content.js, ...content.css]) await readFile(path.join(folder, asset));
  }
  const zipPath = path.join(dist, `beres-egyszeru-${browser}.zip`);
  await rm(zipPath, { force: true });
  const result = spawnSync('zip', ['-qr', zipPath, '.'], { cwd: folder, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  console.log(`Elkészült: dist/${browser}/ és dist/beres-egyszeru-${browser}.zip`);
}
await cp(path.join(root, 'INSTALL.html'), path.join(dist, 'TELEPITES.html'));
console.log('Telepítés: dist/TELEPITES.html');
