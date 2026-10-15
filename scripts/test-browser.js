/* Run with Playwriter -f. Set state.projectRoot to this repository's absolute path first.
   Every service request in this suite is intercepted; no account, order or payment is real. */
const fs = require('node:fs');
const assert = require('assert').strict;
const project = state.projectRoot;
if (!project) throw new Error('Set state.projectRoot to the absolute repository path.');
const read = (file) => fs.readFileSync(project + '/' + file, 'utf8');
fs.mkdirSync(project + '/artifacts', { recursive: true });
state.fixture = { signedIn: true, broken: false, badDetails: false, submitted: null };
state.test = await context.newPage();
await state.test.setViewportSize({ width: 1440, height: 1100 });
await state.test.addInitScript(() => {
  globalThis.browser = {
    storage: { local: {
      get: async () => ({ 'baeasy-settings': JSON.parse(localStorage.getItem('TEST_SETTINGS') || '{"enabled":true,"largeText":false}') }),
      set: async (value) => localStorage.setItem('TEST_SETTINGS', JSON.stringify(value['baeasy-settings']))
    } },
    runtime: { getURL: (file) => 'https://www.beresalexandra.hu/extension/' + file, onMessage: { addListener: () => {} } }
  };
});
await state.test.route('**/*', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (!['www.beresalexandra.hu', 'beresalexandra.hu'].includes(url.hostname)) return route.abort();
  const pathname = url.pathname;
  if (pathname.startsWith('/extension/') || pathname === '/tests/fixtures/native.js') {
    const file = pathname.slice(1);
    return route.fulfill({ contentType: pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', body: read(file) });
  }
  if (pathname.startsWith('/foodpic/')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><rect width="600" height="360" fill="#e6ebde"/><circle cx="300" cy="180" r="115" fill="#fafaf4"/><circle cx="300" cy="180" r="88" fill="#adc68d"/><circle cx="280" cy="165" r="42" fill="#d9bc6e"/></svg>' });
  if (pathname.startsWith('/foodinfo/')) return state.fixture.badDetails ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ingredients: 'Karfiol, <b>tejszín</b><img src=x onerror="window.BAD_HTML=true">', allergies: '<strong>Tej</strong>', serving: '400 g', kcal: 87 }) });
  if (pathname === '/belepes' && request.method() === 'POST') {
    state.fixture.signedIn = true;
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><a href="/kilepes">Kilépés</a><script src="/extension/adapter.js"></script><script src="/extension/content.js"></script></body></html>' });
  }
  if (pathname === '/megrendeles' && request.method() === 'POST') {
    state.fixture.finalSubmitted = request.postData();
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="hu"><head><meta charset="utf-8"><link rel="stylesheet" href="/extension/page.css"></head><body><a href="/kilepes">Kilépés</a><div id="container"><p class="alert alert-success">A tesztrendelést rögzítettük.</p><form id="paymentform"><label><input type="radio" name="payment"> Bankkártya</label><button type="button">Fizetés</button></form></div><script src="/extension/adapter.js"></script><script src="/extension/content.js"></script></body></html>' });
  }
  let html;
  if (pathname === '/belepes') html = read('tests/fixtures/login.html');
  else if (pathname === '/kosar') {
    state.fixture.submitted = request.postData();
    html = read('tests/fixtures/checkout.html');
  } else if (pathname === '/profil') html = '<!doctype html><html><body><a href="/kilepes">Kilépés</a><script src="/extension/adapter.js"></script><script src="/extension/content.js"></script></body></html>';
  else if (['/kovetkezo_etlap', '/aktualis_etlap'].includes(pathname)) {
    html = read('tests/fixtures/menu.html');
    if (!state.fixture.signedIn) html = html.replace('<a href="/kilepes">Kilépés</a>', '<a href="/belepes">Belépés</a>');
    if (state.fixture.broken) html = html.replace('id="menutable"', 'id="changed-menu"');
  } else return route.abort();
  return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
});
const page = state.test;
async function logs() {
  const entries = await getLatestLogs({ page, sinceLastCall: true });
  const errors = entries.filter((line) => /\[pageerror\]|Uncaught|TypeError:|ReferenceError:/.test(line));
  assert.equal(errors.length, 0, 'No runtime exceptions: ' + errors.join('\n'));
}
async function click(locator) { await locator.click(); await logs(); }
async function go(path) { await page.goto('https://www.beresalexandra.hu' + path); await page.locator('#baeasy-host').waitFor(); await logs(); }
async function check(name, callback) { await callback(); console.log('PASS ' + name); }
await go('/kovetkezo_etlap');
await check('Live-shaped menu: 6 days, 148 products, holiday dates unavailable', async () => {
  assert.equal(await page.locator('.day').count(), 6);
  const model = await page.evaluate(() => { const m = BeresEasyAdapter.parseMenu(document, location.href); return { count: m.items.length, days: m.days }; });
  assert.equal(model.count, 148);
  assert.equal(model.days[4].available, false);
  assert.equal(model.days[5].available, false);
  assert.equal(await page.getByRole('heading', { name: 'Mi legyen az ebéd?' }).isVisible(), true);
  assert.equal(await page.locator('#menureal').isVisible(), false);
});
await check('Category filter, ascending price, original +/− fields and basket total', async () => {
  await click(page.getByRole('button', { name: 'Levesek', exact: true }));
  assert.equal(await page.locator('.food-card').count(), 3);
  const prices = await page.locator('.food-price').allTextContents();
  assert.equal(JSON.stringify(prices.map((p) => Number(p.replace(/[^0-9]/g, '')))), '[850,850,1090]');
  await click(page.getByRole('button', { name: 'Egy adaggal több: Karfiolkrémleves', exact: true }));
  await click(page.getByRole('button', { name: 'Egy adaggal több: Karfiolkrémleves', exact: true }));
  assert.equal(await page.locator('#portion_30922_1').inputValue(), '2');
  assert.equal((await page.locator('.cart-total').textContent()).replace(/\s/g, ''), '1700Ft');
  await click(page.getByRole('button', { name: 'Egy adaggal kevesebb: Karfiolkrémleves', exact: true }));
  assert.equal(await page.locator('#portion_30922_1').inputValue(), '1');
});
await check('Accent-insensitive search, empty state and day switching', async () => {
  await page.getByRole('searchbox').fill('karfiolkrem');
  assert.equal(await page.locator('.food-card').count(), 1);
  await page.getByRole('searchbox').fill('nincsilyen');
  assert.equal(await page.getByRole('heading', { name: 'Most nincs ilyen étel' }).isVisible(), true);
  await page.getByRole('searchbox').fill('');
  await click(page.getByRole('button', { name: /^Kedd/ }));
  assert.equal(await page.locator('.day[aria-pressed="true"] .day-name').textContent(), 'Kedd');
  await click(page.getByRole('button', { name: /^Péntek/ }));
  assert.equal(await page.locator('.food-card').count(), 0);
  await click(page.getByRole('button', { name: /^Hétfő/ }));
});
await check('Weekly plans clearly show full-week prices and use a separate quantity field', async () => {
  await click(page.getByRole('button', { name: 'Heti étrendek', exact: true }));
  assert.equal(await page.locator('.food-card').count(), 8);
  assert.equal(await page.getByText('TELJES HETI CSOMAG', { exact: true }).count(), 8);
  await click(page.locator('.food-card').first().locator('.plus'));
  assert.equal(await page.locator('#portion_30946_weekly').inputValue(), '1');
  assert.equal((await page.locator('.cart-total').textContent()).replace(/\s/g, ''), '7550Ft');
  await click(page.locator('.food-card').first().locator('.quantity-button').first());
  await click(page.getByRole('button', { name: 'Levesek', exact: true }));
});
await check('All categories are visible buttons; quantity updates work without the site click handler', async () => {
  assert.equal(await page.locator('.categories select').count(), 0);
  assert.equal(await page.locator('.categories button').count(), 11);
  await page.evaluate(() => {
    window.TEST_NATIVE_CLICKED = false;
    document.querySelectorAll('.portionbutton').forEach((button) => {
      button.addEventListener('click', () => { window.TEST_NATIVE_CLICKED = true; }, { capture: true });
      button.replaceWith(button.cloneNode(true));
    });
  });
  // Reparse references after replacing native buttons, just as after a full page load.
  await page.reload(); await page.locator('.food-card').first().waitFor(); await logs();
  await page.evaluate(() => {
    window.TEST_NATIVE_CLICKED = false;
    document.querySelectorAll('.portionbutton').forEach((button) => button.addEventListener('click', () => { window.TEST_NATIVE_CLICKED = true; throw new Error('Tracking handler failed'); }, { capture: true }));
  });
  await click(page.getByRole('button', { name: 'Egy adaggal több: Karfiolkrémleves', exact: true }));
  assert.equal(await page.locator('#portion_30922_1').inputValue(), '2');
  assert.equal(await page.locator('#portiondisplay_30922_1').textContent(), '2 db');
  assert.equal(await page.evaluate(() => window.TEST_NATIVE_CLICKED), false);
  await click(page.getByRole('button', { name: 'Egy adaggal kevesebb: Karfiolkrémleves', exact: true }));
  assert.equal(await page.locator('#portion_30922_1').inputValue(), '1');
  await click(page.getByRole('button', { name: 'Levesek', exact: true }));
});
await check('Photo opens at full size by mouse/keyboard and closes without changing the basket', async () => {
  const zoom = page.getByRole('button', { name: 'Fotó nagyítása: Karfiolkrémleves', exact: true });
  const originalSrc = await zoom.locator('img').getAttribute('src');
  await click(zoom);
  assert.equal(await page.locator('.photo-dialog').isVisible(), true);
  assert.equal(await page.locator('.photo-full').getAttribute('src'), originalSrc);
  assert.equal(await page.locator('#portion_30922_1').inputValue(), '1');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').count(), 0);
  await zoom.focus(); await page.keyboard.press('Enter');
  await page.locator('.photo-dialog').waitFor();
  await click(page.locator('.photo-dialog').getByRole('button', { name: 'Bezárás' }));
  assert.equal(await page.locator('dialog').count(), 0);
});
await check('Ingredients: HTML is text-only, dialog closes using Escape, error fallback works', async () => {
  await click(page.locator('.food-card').first().getByRole('button', { name: 'Összetevők és részletek' }));
  await page.getByText('Karfiol, tejszín', { exact: false }).waitFor();
  assert.equal(await page.evaluate(() => !!window.BAD_HTML), false);
  assert.equal(await page.locator('.detail-data img').count(), 0);
  await click(page.locator('.detail-photo-button').first());
  assert.equal(await page.locator('dialog').count(), 2);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').count(), 1);
  assert.equal(await page.locator('.detail-data').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').count(), 0);
  state.fixture.badDetails = true;
  await click(page.locator('.food-card').first().getByRole('button', { name: 'Összetevők és részletek' }));
  await page.getByText('A részleteket most nem sikerült betölteni.', { exact: false }).waitFor();
  await page.keyboard.press('Escape'); state.fixture.badDetails = false;
});
await check('Draft survives reload without changing the product or price', async () => {
  await page.reload(); await page.locator('.food-card').first().waitFor(); await logs();
  assert.equal(await page.locator('#portion_30922_1').inputValue(), '1');
});
await check('Desktop and 390px mobile layouts; large text preference', async () => {
  console.log((await snapshot({ page, search: /Mi legyen|Hétfő|kosaram/ })).slice(0, 2000));
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: project + '/artifacts/demo-desktop.png', scale: 'css' });
  await page.setViewportSize({ width: 390, height: 844 });
  await click(page.getByRole('button', { name: 'Nagyobb betűk', exact: true }));
  assert.equal(await page.locator('.app.large-text').count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: project + '/artifacts/demo-mobile-large.png', scale: 'css' });
  await click(page.getByRole('button', { name: 'Nagyobb betűk', exact: true }));
  await page.setViewportSize({ width: 1440, height: 1100 });
});
await check('Native cart submission preserves week, CSRF and quantities; final order is manual', async () => {
  await click(page.getByRole('button', { name: 'Rendelés áttekintése', exact: true }));
  assert.equal(await page.getByRole('dialog').isVisible(), true);
  assert.equal(await page.getByText('Hétfő · 10. 19.', { exact: true }).isVisible(), true);
  await click(page.getByRole('button', { name: 'Tovább a rendelés ellenőrzéséhez', exact: true }));
  await page.getByRole('heading', { name: 'Ellenőrizze a rendelését' }).waitFor();
  const submitted = new URLSearchParams(state.fixture.submitted);
  assert.equal(submitted.get('week_id'), '806');
  assert.equal(submitted.get('_token'), 'TEST_ONLY_NOT_A_REAL_TOKEN');
  assert.equal(submitted.get('portion_30922_1'), '1');
  assert.equal(state.fixture.finalSubmitted, undefined);
  assert.equal(await page.locator('#carttable').isVisible(), true);
  assert.equal(await page.locator('header').filter({ hasText: 'Felesleges menü' }).isVisible(), false);
  await page.screenshot({ path: project + '/artifacts/demo-checkout.png', scale: 'css' });
  await click(page.getByRole('button', { name: 'Megrendelés', exact: true }));
  assert.equal(state.fixture.finalSubmitted, undefined, 'Required terms block native submission');
  await page.getByRole('checkbox').check();
  await click(page.getByRole('button', { name: 'Megrendelés', exact: true }));
  await page.getByText('A tesztrendelést rögzítettük.').waitFor();
  assert.ok(state.fixture.finalSubmitted);
  assert.equal(await page.locator('#paymentform').isVisible(), true);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('baeasy-draft-806')), null);
});
await check('Broken menu leaves the original page visible', async () => {
  state.fixture.broken = true; await go('/kovetkezo_etlap');
  assert.equal(await page.getByRole('heading', { name: 'Az étlap most nem egyszerűsíthető' }).isVisible(), true);
  assert.equal(await page.locator('#menureal').isVisible(), true);
  state.fixture.broken = false;
});
await check('Signed-out visitors go straight to the original login form and return to next week', async () => {
  state.fixture.signedIn = false;
  await go('/kovetkezo_etlap');
  await page.getByRole('heading', { name: 'Először jelentkezzen be' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/belepes');
  assert.equal(await page.locator('input[name="_token"]').inputValue(), 'TEST_ONLY_NOT_A_REAL_TOKEN');
  console.log((await snapshot({ page, search: /jelentkezzen|Jelszó|E-Mail/ })).slice(0, 1700));
  await page.screenshot({ path: project + '/artifacts/demo-login.png', scale: 'css' });
  await page.getByRole('textbox', { name: 'E-Mail:' }).fill('demo@example.invalid');
  await page.getByRole('textbox', { name: 'Jelszó:' }).fill('ONLY-A-LOCAL-TEST');
  await click(page.getByRole('button', { name: 'Belépés', exact: true }));
  await page.getByRole('heading', { name: 'Mi legyen az ebéd?' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/kovetkezo_etlap');
});
await check('Original mode restores the native form and has a working return button', async () => {
  await click(page.getByRole('button', { name: 'Eredeti oldal', exact: true }));
  assert.equal(await page.locator('#baeasy-host').count(), 0);
  assert.equal(await page.locator('#menureal').isVisible(), true);
  await click(page.getByRole('button', { name: 'Egyszerű nézet bekapcsolása', exact: true }));
  await page.getByRole('heading', { name: 'Mi legyen az ebéd?' }).waitFor();
});
console.log('All browser integration checks passed. Fixtures only; no live purchase or real login.');
await page.unrouteAll({ behavior: 'wait' });
await page.close();
