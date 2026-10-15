import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 5190);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') { res.writeHead(302, { Location: '/kovetkezo_etlap' }); res.end(); return; }
  const routes = { '/': 'tests/fixtures/menu.html', '/kovetkezo_etlap': 'tests/fixtures/menu.html', '/aktualis_etlap': 'tests/fixtures/menu.html', '/belepes': 'tests/fixtures/login.html', '/kosar': 'tests/fixtures/checkout.html', '/telepites': 'INSTALL.html' };
  if (url.pathname.startsWith('/foodpic/')) {
    res.writeHead(302, { Location: 'https://www.beresalexandra.hu' + url.pathname }); res.end(); return;
  }
  if (url.pathname.startsWith('/foodinfo/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ingredients: 'Helyi bemutató adat. Az éles bővítmény a weboldal aktuális összetevőit tölti be.', allergies: 'Az allergénadatokat mindig ellenőrizze az éles oldalon.' })); return;
  }
  const relative = routes[url.pathname] || url.pathname.slice(1);
  const file = path.resolve(root, relative);
  if (!file.startsWith(root) || !['/extension/', '/tests/fixtures/'].some((prefix) => url.pathname.startsWith(prefix)) && !routes[url.pathname]) { res.writeHead(404); res.end('Nincs ilyen oldal.'); return; }
  try {
    let content = await readFile(file);
    // Make photos work in a local demo while keeping the release adapter restricted to the real HTTPS site.
    if (file.endsWith('menu.html')) content = Buffer.from(content.toString().replace('<body>', '<body><div style="padding:8px;text-align:center;background:#fff1ce;font:14px system-ui">Helyi bemutató · Nincs valódi rendelés vagy fizetés</div>'));
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(content);
  } catch { res.writeHead(404); res.end('A fájl nem található.'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Helyi bemutató: http://127.0.0.1:${port}/kovetkezo_etlap\nBelépési felület: http://127.0.0.1:${port}/belepes`));
