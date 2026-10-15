(async function () {
  'use strict';
  if (document.getElementById('baeasy-host') || window.top !== window) return;
  const A = globalThis.BeresEasyAdapter;
  const ext = globalThis.browser || globalThis.chrome;
  const STORAGE = 'baeasy-settings';
  const originalKey = 'baeasy-original';
  const returnKey = 'baeasy-login-return';
  const weekKey = 'baeasy-week';
  ext?.runtime?.onMessage?.addListener((message) => {
    if (message?.type === 'baeasy-refresh') {
      try { sessionStorage.removeItem(originalKey); } catch { /* Optional session preference. */ }
      location.reload();
    }
  });
  let settings = { enabled: true, largeText: false };
  try { settings = { ...settings, ...(await ext.storage.local.get(STORAGE))[STORAGE] }; } catch { /* Preview works without an extension API. */ }
  const readSession = (key) => { try { return sessionStorage.getItem(key); } catch { return null; } };
  const writeSession = (key, value) => { try { value === null ? sessionStorage.removeItem(key) : sessionStorage.setItem(key, value); } catch { /* Storage can be disabled. */ } };
  const path = location.pathname.replace(/\/$/, '') || '/';
  const isMenu = ['/aktualis_etlap', '/kovetkezo_etlap'].includes(path);
  const isLogin = path === '/belepes';
  const auth = A.authState(document);
  const pending = readSession(returnKey);
  if (!settings.enabled || readSession(originalKey)) {
    if (isMenu || isLogin || ['/kosar', '/megrendeles'].includes(path)) mountRestore();
    return;
  }
  if (pending && auth === 'signed-in') {
    writeSession(returnKey, null);
    if (['/aktualis_etlap', '/kovetkezo_etlap'].includes(pending) && path !== pending) { location.replace(pending); return; }
  }
  if (isMenu && auth === 'signed-out') {
    const target = path === '/aktualis_etlap' && readSession(weekKey) !== 'current' ? '/kovetkezo_etlap' : path;
    writeSession(returnKey, target);
    location.replace('/belepes');
    return;
  }
  if (isMenu && path === '/aktualis_etlap' && readSession(weekKey) !== 'current') { location.replace('/kovetkezo_etlap'); return; }
  const siteBase = ['127.0.0.1', 'localhost'].includes(location.hostname) ? 'https://www.beresalexandra.hu/' : location.href;
  let model = isMenu ? A.parseMenu(document, siteBase) : null;
  const loginForm = isLogin && document.querySelector('form[action$="/belepes"]');
  const isCheckout = ['/kosar', '/megrendeles', '/fizetes'].includes(path) || path.startsWith('/payment') || !!document.querySelector('#paymentform');
  const nativeTarget = loginForm || (isCheckout && document.querySelector('#container'));
  if (!model && !nativeTarget && !isMenu) return;
  const host = document.createElement('div');
  host.id = 'baeasy-host';
  document.body.prepend(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = ext?.runtime?.getURL ? ext.runtime.getURL('ui.css') : '/extension/ui.css';
  shadow.append(style);
  const root = el('div', { class: 'app', lang: 'hu' });
  root.classList.toggle('large-text', settings.largeText);
  shadow.append(root);
  const live = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  root.append(live);
  let announcer;
  const announce = (message) => { live.textContent = ''; clearTimeout(announcer); announcer = setTimeout(() => { live.textContent = message; }, 40); };
  let poll;
  let currentDialog;
  let dialogSequence = 0;
  let selectedDay = model?.days.find((d) => d.available)?.id || model?.days[0]?.id || 1;
  let selectedCategory = 'Mind';
  let query = '';
  let sort = 'price-asc';
  let lastQuantities = '';
  const controls = new Map();
  const dayButtons = new Map();
  let list, resultLabel, cartCount, cartTotal, checkoutButton, cartButton, statusBox;
  const draftKey = model && 'baeasy-draft-' + model.weekId;
  const header = makeHeader();
  root.append(header);

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined) continue;
      if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value);
    }
    children.flat().forEach((child) => { if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child))); });
    return node;
  }
  function icon(name, size = 24) {
    const shapes = {
      leaf: '<path d="M20 4c-8-1-15 2-15 9a6 6 0 0 0 6 6c7 0 10-7 9-15Z"/><path d="m4 21 10-10"/>',
      cart: '<path d="M3 3h2l3 12h11l2-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
      search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
      arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      close: '<path d="m6 6 12 12M6 18 18 6"/>',
      plate: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="5"/>',
      bag: '<path d="M5 8h14l1 13H4L5 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
      user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'
    };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
    svg.innerHTML = shapes[name] || shapes.plate; // Only hardcoded icon paths, never page content.
    return svg;
  }
  function makeHeader() {
    const fontButton = el('button', { class: 'quiet font-toggle', type: 'button', 'aria-pressed': String(settings.largeText), onclick: async () => {
      settings.largeText = !settings.largeText;
      root.classList.toggle('large-text', settings.largeText);
      document.body.classList.toggle('baeasy-large', settings.largeText);
      fontButton.setAttribute('aria-pressed', String(settings.largeText));
      try { await ext.storage.local.set({ [STORAGE]: settings }); } catch { /* Optional preference. */ }
    } }, el('span', { class: 'font-symbol', 'aria-hidden': 'true' }, 'Aᴀ'), 'Nagyobb betűk');
    return el('header', { class: 'topbar' }, el('div', { class: 'topbar-inner' },
      el('a', { class: 'brand', href: '/kovetkezo_etlap', onclick: () => writeSession(weekKey, 'next') }, el('span', { class: 'brand-mark' }, icon('leaf', 28)), el('span', {}, 'Jó étvágyat!', el('small', {}, 'Egyszerű Béres ételrendelés'))),
      el('div', { class: 'header-actions' }, fontButton, el('button', { class: 'quiet original', type: 'button', onclick: showOriginal }, 'Eredeti oldal'))));
  }
  function steps(active) {
    const labels = ['Belépés', 'Ételek kiválasztása', 'Rendelés ellenőrzése', 'Fizetés'];
    return el('nav', { class: 'steps', 'aria-label': 'A rendelés lépései' }, el('ol', {}, labels.map((label, index) =>
      el('li', { class: index < active ? 'done' : index === active ? 'active' : '', 'aria-current': index === active ? 'step' : null },
        el('span', { class: 'step-number', 'aria-hidden': 'true' }, index < active ? icon('check', 17) : index + 1), el('span', {}, label)))));
  }
  function showOriginal() {
    if (model) saveDraft();
    writeSession(originalKey, '1');
    clearInterval(poll);
    currentDialog?.remove();
    delete document.body.dataset.baeasyMode;
    document.body.classList.remove('baeasy-large', 'baeasy-login');
    document.querySelectorAll('.baeasy-path, .baeasy-native').forEach((n) => n.classList.remove('baeasy-path', 'baeasy-native'));
    host.remove();
    mountRestore();
  }
  function mountRestore() {
    if (document.getElementById('baeasy-restore')) return;
    const button = document.createElement('button');
    button.id = 'baeasy-restore';
    button.textContent = 'Egyszerű nézet bekapcsolása';
    button.type = 'button';
    button.addEventListener('click', async () => {
      writeSession(originalKey, null);
      try { const current = (await ext.storage.local.get(STORAGE))[STORAGE] || {}; await ext.storage.local.set({ [STORAGE]: { ...current, enabled: true } }); } catch { /* Preview. */ }
      location.reload();
    });
    document.body.append(button);
  }
  function focusNative(target) {
    document.body.dataset.baeasyMode = 'native';
    document.body.classList.toggle('baeasy-large', settings.largeText);
    target.classList.add('baeasy-native');
    for (let node = target.parentElement; node; node = node.parentElement) node.classList.add('baeasy-path');
    // Authentication/checkout error messages can sit immediately outside the form.
    document.querySelectorAll('.alert, .validation-summary-errors').forEach((alert) => {
      alert.classList.add('baeasy-native');
      for (let node = alert.parentElement; node; node = node.parentElement) node.classList.add('baeasy-path');
    });
  }
  if (nativeTarget) {
    focusNative(nativeTarget);
    document.body.classList.toggle('baeasy-login', !!loginForm);
    const main = el('main', { class: 'shell native-intro' });
    main.append(steps(loginForm ? 0 : path === '/kosar' ? 2 : 3));
    if (loginForm) {
      if (!pending) writeSession(returnKey, '/kovetkezo_etlap');
      main.append(el('div', { class: 'login-intro' }, el('span', { class: 'eyebrow' }, 'ÜDVÖZÖLJÜK!'), el('h1', {}, 'Először jelentkezzen be'), el('p', { class: 'lead' }, 'Utána már választhat is a következő heti ételekből.')));
      loginForm.querySelector('input[type="email"]')?.setAttribute('autocomplete', 'username');
      loginForm.querySelector('input[type="password"]')?.setAttribute('autocomplete', 'current-password');
      loginForm.querySelectorAll('input[type="email"], input[type="password"]').forEach((input) => input.required = true);
      // Keep the website's original login form, CSRF token, password-manager integration and submit handler.
      loginForm.insertAdjacentElement('afterend', el('p', { class: 'baeasy-register bae-request-link' }, 'Még nincs fiókja? ', el('a', { href: '/regisztracio' }, 'Regisztráció a weboldalon')));
      // Preserve this added link when ancestors are focused.
      loginForm.nextElementSibling.classList.add('baeasy-native');
    } else {
      main.append(el('h1', {}, path === '/kosar' ? 'Ellenőrizze a rendelését' : 'Rendelés és fizetés'),
        el('p', { class: 'lead' }, path === '/kosar' ? 'Nézze át a napokat, az adagokat és a végösszeget. A rendelést az alábbi gombbal küldheti el.' : 'Kövesse az alábbi lépést. A fizetési módot és a végső jóváhagyást Ön választja ki.'));
      nativeTarget.querySelectorAll('.bs-wizard, .v-page-heading').forEach((n) => n.classList.add('baeasy-chrome'));
      nativeTarget.querySelectorAll('form').forEach((form) => {
        const action = A.sameSite(form.action, location.href);
        if (action && new URL(action).pathname === '/megrendeles') form.addEventListener('submit', () => {
          const draft = readSession('baeasy-active-draft');
          if (draft?.startsWith('baeasy-draft-')) writeSession(draft, null);
          writeSession('baeasy-active-draft', null);
        });
      });
    }
    root.append(main);
    return;
  }
  if (!model || !model.items.length) {
    root.append(el('main', { class: 'shell fallback' }, el('h1', {}, 'Az étlap most nem egyszerűsíthető'), el('p', {}, 'Az oldal felépítése megváltozhatott, vagy az étlap még nem elérhető. Az eredeti rendelési felület alább használható.'), el('button', { class: 'primary', onclick: showOriginal }, 'Az eredeti oldal használata')));
    return;
  }
  restoreDraft();
  document.body.dataset.baeasyMode = 'menu';
  root.append(buildMenu());
  sync(true);
  poll = setInterval(() => sync(), 600);
  window.addEventListener('pagehide', saveDraft);
  window.addEventListener('pageshow', () => sync(true));
  model.form.addEventListener('submit', saveDraft);

  function buildMenu() {
    const main = el('main', { class: 'shell' });
    if (['127.0.0.1', 'localhost'].includes(location.hostname)) main.append(el('p', { class: 'notice' }, 'Helyi bemutató · Nincs valódi rendelés vagy fizetés.'));
    const weekPicker = el('div', { class: 'week-picker', role: 'group', 'aria-label': 'Melyik hétre rendel?' },
      el('a', { href: '/aktualis_etlap', class: path === '/aktualis_etlap' ? 'selected' : '', 'aria-current': path === '/aktualis_etlap' ? 'page' : null, onclick: (event) => changeWeek(event, 'current') }, 'Aktuális hét'),
      el('a', { href: '/kovetkezo_etlap', class: path === '/kovetkezo_etlap' ? 'selected' : '', 'aria-current': path === '/kovetkezo_etlap' ? 'page' : null, onclick: (event) => changeWeek(event, 'next') }, 'Következő hét'));
    main.append(el('div', { class: 'heading-row' }, el('div', {}, el('h1', {}, 'Mi legyen az ebéd?'), el('p', { class: 'lead' }, model.weekLabel || 'Válasszon egy napot, majd egy ételt.')), weekPicker));
    if (model.notices.length) main.append(el('aside', { class: 'notice', 'aria-label': 'Szállítási tudnivalók' }, icon('info', 23), el('div', {}, model.notices.map((notice) => el('p', {}, notice)))));
    const days = el('div', { class: 'days', role: 'group', 'aria-label': 'Rendelési nap' });
    model.days.forEach((day) => {
      const button = el('button', { class: 'day', type: 'button', 'aria-pressed': String(day.id === selectedDay), onclick: () => {
        selectedDay = day.id;
        selectedCategory = 'Mind';
        dayButtons.forEach((b, id) => b.setAttribute('aria-pressed', String(id === selectedDay)));
        renderCategories(); renderItems();
      } }, el('span', { class: 'day-name' }, day.name), el('span', { class: 'day-date' }, formatDate(day.date)), el('span', { class: 'day-note' }, day.available ? 'Választható' : 'Nem rendelhető'));
      if (!day.available) button.classList.add('unavailable');
      dayButtons.set(day.id, button);
      days.append(button);
    });
    main.append(days);
    const categories = el('div', { class: 'categories', role: 'group', 'aria-label': 'Ételkategória' });
    function renderCategories() {
      categories.replaceChildren();
      const availableCategories = ['Mind', ...new Set(model.items.filter((i) => i.day === selectedDay).map((i) => i.category))];
      if (model.items.some((i) => i.kind === 'weekly')) availableCategories.push('Heti étrendek');
      const order = ['Mind', 'Levesek', 'Főételek', 'Főzelékek', 'Desszertek', 'Saláták, zöldségek', 'Gyerekételek', 'Menük', 'Reggeli, uzsonna', 'Étrendek', 'Heti étrendek'];
      availableCategories.sort((a, b) => order.indexOf(a) - order.indexOf(b)).forEach((name) => categories.append(el('button', { type: 'button', class: 'category', 'data-category': name, 'aria-pressed': String(name === selectedCategory), onclick: () => {
        selectedCategory = name; renderCategories(); renderItems();
        [...categories.querySelectorAll('button')].find((button) => button.dataset.category === name)?.focus({ preventScroll: true });
      } }, name === 'Mind' ? 'Minden étel' : name)));
    }
    renderCategories();
    main.append(categories);
    const search = el('input', { type: 'search', placeholder: 'Milyen ételt keres?', 'aria-label': 'Keresés az ételek között', oninput: (event) => { query = event.target.value; renderItems(); } });
    const sorting = el('select', { 'aria-label': 'Ételek rendezése', onchange: (event) => { sort = event.target.value; renderItems(); } },
      el('option', { value: 'price-asc' }, 'Ár: olcsóbb elöl'), el('option', { value: 'price-desc' }, 'Ár: drágább elöl'), el('option', { value: 'name' }, 'Név: A–Z'));
    main.append(el('div', { class: 'tools' }, el('label', { class: 'search' }, icon('search', 22), search), el('label', { class: 'sort' }, el('span', {}, 'Sorrend'), sorting)));
    resultLabel = el('h2', { class: 'result-title' });
    list = el('div', { class: 'food-grid', id: 'foods' });
    statusBox = el('p', { class: 'error-message', role: 'alert', hidden: '' });
    main.append(el('div', { class: 'results-heading' }, resultLabel, el('span', { class: 'muted' }, 'Az adag a + és − gombbal módosítható.')), statusBox, list);
    const help = el('footer', { class: 'help' }, el('span', {}, 'Segítség a rendeléshez: ', el('a', { href: 'tel:+3612321172' }, '+36 1 232 1172')), el('span', {}, 'Nem hivatalos kényelmi bővítmény. ', el('a', { href: '/p/etelkiszallitas/gyik', target: '_blank', rel: 'noopener' }, 'Gyakori kérdések')));
    main.append(help);
    cartCount = el('span', { class: 'cart-count' });
    cartTotal = el('strong', { class: 'cart-total' });
    cartButton = el('button', { class: 'cart-open', type: 'button', onclick: openCart }, icon('bag', 29), el('span', {}, el('strong', {}, 'A kosaram'), cartCount));
    checkoutButton = el('button', { class: 'primary checkout', type: 'button', onclick: openCart }, 'Rendelés áttekintése', icon('arrow', 22));
    const dock = el('div', { class: 'cart-dock' }, el('div', { class: 'cart-dock-inner' }, cartButton, el('div', { class: 'total-wrap' }, el('span', {}, 'Ételek összesen'), cartTotal), checkoutButton));
    main.append(dock);
    renderItems();
    return main;
  }
  function formatDate(date) { const parts = date.split('.'); return `${Number(parts[1])}. ${Number(parts[2])}.`; }
  function changeWeek(event, week) {
    saveDraft();
    const any = model.items.some((i) => A.quantity(i.input));
    if (any && (week === 'current' ? '/aktualis_etlap' : '/kovetkezo_etlap') !== path) {
      event.preventDefault();
      const dialog = openDialog('Másik hétre váltás');
      dialog.body.append(el('p', {}, 'A most kiválasztott ételeket ebben a böngészőfülben megőrizzük. A két hét rendelését külön kell elküldeni.'),
        el('button', { class: 'primary', onclick: () => { writeSession(weekKey, week); location.href = week === 'current' ? '/aktualis_etlap' : '/kovetkezo_etlap'; } }, 'Átváltok a másik hétre'));
      return;
    }
    writeSession(weekKey, week);
  }
  function renderItems() {
    if (!list) return;
    controls.clear();
    const items = A.filteredItems(model.items, selectedDay, selectedCategory, query, sort);
    const day = model.days.find((d) => d.id === selectedDay);
    resultLabel.textContent = selectedCategory === 'Heti étrendek' ? `Heti étrendek · ${items.length} csomag` : `${day.name} · ${items.length} étel`;
    list.replaceChildren(...items.map(foodCard));
    if (!items.length) list.append(el('div', { class: 'empty' }, icon('plate', 44), el('h3', {}, 'Most nincs ilyen étel'), el('p', {}, day.available ? 'Próbáljon másik kategóriát, vagy törölje a keresést.' : 'Erre a napra az oldal jelenleg nem kínál rendelhető ételt. Válasszon másik napot.'), el('button', { class: 'secondary', onclick: () => { query = ''; shadow.querySelector('input[type="search"]').value = ''; selectedCategory = 'Mind'; shadow.querySelector('.day[aria-pressed="true"]').click(); } }, 'Minden étel megjelenítése')));
    sync(true);
  }
  function foodCard(item) {
    const photoPart = item.parts.find((p) => p.photo);
    const photo = photoPart?.photo;
    const placeholderText = el('span', {}, photo ? 'Fotó betöltése…' : 'Ehhez az ételhez nincs fotó');
    const placeholder = el('div', { class: 'photo-placeholder' }, icon('plate', 50), placeholderText);
    const media = el(photo ? 'button' : 'div', {
      class: 'food-photo', type: photo ? 'button' : null,
      'aria-label': photo ? 'Fotó nagyítása: ' + photoPart.name : null,
      'aria-haspopup': photo ? 'dialog' : null,
      onclick: photo ? () => openPhoto(photoPart) : null
    }, placeholder);
    if (photo) {
      const img = el('img', { src: photo, alt: photoPart.name, loading: 'lazy', decoding: 'async',
        onload: () => { placeholder.hidden = true; },
        onerror: (event) => { event.target.remove(); placeholder.hidden = false; placeholderText.textContent = 'Ehhez az ételhez nincs fotó'; }
      });
      media.append(img);
      media.append(el('span', { class: 'photo-zoom-hint', 'aria-hidden': 'true' }, icon('search', 18), 'Nagyítás'));
    }
    const badge = el('span', { class: 'food-badge' }, item.kind === 'weekly' ? 'TELJES HETI CSOMAG' : item.category);
    media.append(badge);
    const count = el('output', { 'aria-label': 'Kiválasztott adagok: ' + item.name, text: `${A.quantity(item.input)} db` });
    const minus = el('button', { class: 'quantity-button', type: 'button', 'aria-label': 'Egy adaggal kevesebb: ' + item.name, onclick: () => adjust(item, -1) }, '−');
    const plus = el('button', { class: 'quantity-button plus', type: 'button', 'aria-label': (item.kind === 'weekly' ? 'Egy teljes heti csomag hozzáadása: ' : 'Egy adaggal több: ') + item.name, onclick: () => adjust(item, 1) }, '+');
    const quantity = el('div', { class: 'quantity' }, minus, count, plus);
    const body = el('div', { class: 'food-body' },
      el('span', { class: 'food-code' }, item.code + (item.parts.length === 1 && item.parts[0].values?.[0] ? ' · ' + item.parts[0].values[0] + ' kcal' : '')),
      el('h3', {}, item.name));
    if (item.parts.length > 1 && item.kind !== 'weekly') body.append(el('p', { class: 'bundle-content' }, item.parts.map((p) => p.name).join(' • ')));
    if (item.kind === 'weekly') body.append(el('p', { class: 'weekly-note' }, 'Az egész hétre szól. A részletekben minden nap étele látható.'));
    body.append(el('button', { class: 'food-details', type: 'button', onclick: () => openDetails(item) }, 'Összetevők és részletek', icon('info', 18)),
      el('div', { class: 'food-bottom' }, el('div', {}, el('strong', { class: 'food-price' }, A.money(item.price)), el('small', {}, item.kind === 'weekly' ? '/ teljes hét' : '/ adag')), quantity));
    if (!item.available) body.append(el('p', { class: 'closed-note' }, 'Már nem rendelhető'));
    const card = el('article', { class: 'food-card', 'data-item': item.id }, media, body);
    controls.set(item.id, { card, count, minus, plus });
    return card;
  }
  function adjust(item, delta) {
    if (!item.available || !model.form.isConnected || !item.input?.isConnected) return showError('Az étlap megváltozott. Frissítse az oldalt a rendelés folytatásához.');
    const old = A.quantity(item.input);
    if ((delta < 0 && old <= 0) || (delta > 0 && old >= 99)) return;
    const button = delta > 0 ? item.plus : item.minus;
    if (!button || !button.isConnected || button.classList.contains('disabled') || button.hasAttribute('disabled')) return;
    const expectedField = 'portion_' + item.plus.dataset.menumain + '_' + (item.kind === 'weekly' ? 'weekly' : item.day);
    if (item.input.form !== model.form || item.input.type !== 'hidden' || item.input.name !== expectedField || item.input.id !== expectedField) return showError('A rendelési mező megváltozott. Folytassa az eredeti oldalon.');
    // The original site stores quantities in these hidden form fields. Its click handler
    // performs analytics calls before updating them, so blocked/broken analytics can stop
    // ordering. Write the same native field without invoking those tracking handlers.
    item.input.value = String(old + delta);
    const display = document.getElementById(expectedField.replace('portion_', 'portiondisplay_'));
    if (display) display.textContent = item.input.value + ' db';
    document.getElementById(expectedField.replace('portion_', 'portioncell_'))?.classList.toggle('selectedportion', old + delta > 0);
    item.input.dispatchEvent(new Event('input', { bubbles: true }));
    item.input.dispatchEvent(new Event('change', { bubbles: true }));
    sync(true);
    saveDraft();
    announce(`${item.name}: ${A.quantity(item.input)} ${item.kind === 'weekly' ? 'heti csomag' : 'adag'}.`);
    if (shadow.querySelector('.cart-lines')) renderCartLines();
  }
  function showError(message) { statusBox.hidden = false; statusBox.textContent = message; announce(message); }
  function sync(force = false) {
    if (!model || !cartCount) return;
    const quantities = model.items.map((i) => A.quantity(i.input)).join(',');
    if (!force && quantities === lastQuantities) return;
    lastQuantities = quantities;
    let count = 0, total = 0;
    for (const item of model.items) {
      const n = A.quantity(item.input);
      count += n; total += n * item.price;
      const ui = controls.get(item.id);
      if (ui) {
        ui.count.textContent = n + ' db';
        ui.minus.disabled = !item.available || n === 0;
        ui.plus.disabled = !item.available || n >= 99;
        ui.card.classList.toggle('in-cart', n > 0);
      }
    }
    cartCount.textContent = count ? `${count} kiválasztott tétel` : 'Még üres a kosár';
    cartTotal.textContent = A.money(total);
    checkoutButton.disabled = !count;
    dayButtons.forEach((button, id) => {
      const dayCount = model.items.filter((i) => i.day === id).reduce((sum, i) => sum + A.quantity(i.input), 0);
      button.querySelector('.day-note').textContent = dayCount ? `${dayCount} adag a kosárban` : model.days.find((d) => d.id === id).available ? 'Választható' : 'Nem rendelhető';
    });
  }
  function saveDraft() {
    if (model) writeSession(draftKey, JSON.stringify({ version: 1, savedAt: Date.now(), entries: A.draftEntries(model.items) }));
  }
  function restoreDraft() {
    try {
      const draft = JSON.parse(readSession(draftKey) || 'null');
      if (!draft || draft.version !== 1 || !Array.isArray(draft.entries) || Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) return;
      // A server-restored form is authoritative; don't overwrite it with a local draft.
      if (model.items.some((i) => A.quantity(i.input))) return;
      for (const entry of draft.entries) {
        const item = model.items.find((i) => i.id === entry.id);
        if (!A.validDraft(entry, item)) continue;
        // This site's quantity handler stores its entire cart state in these native hidden fields.
        // Restore only an exact match of date, menu, foods and price; do not replay analytics/network clicks.
        item.input.value = String(entry.quantity);
        item.input.dispatchEvent(new Event('input', { bubbles: true }));
        item.input.dispatchEvent(new Event('change', { bubbles: true }));
        const display = document.getElementById(item.input.id.replace('portion_', 'portiondisplay_'));
        if (display) display.textContent = entry.quantity + ' db';
        document.getElementById(item.input.id.replace('portion_', 'portioncell_'))?.classList.toggle('selectedportion', entry.quantity > 0);
      }
    } catch { /* Invalid/expired drafts are ignored. */ }
  }
  function openDialog(title, { preserveParent = false } = {}) {
    const previouslyFocused = shadow.activeElement;
    const parent = preserveParent ? currentDialog : null;
    if (!preserveParent) currentDialog?.remove();
    const titleId = 'baeasy-dialog-title-' + ++dialogSequence;
    const dialog = el('dialog', { class: 'dialog', 'aria-labelledby': titleId });
    const close = () => { dialog.close(); dialog.remove(); if (currentDialog === dialog) currentDialog = parent?.isConnected ? parent : null; previouslyFocused?.focus(); };
    const body = el('div', { class: 'dialog-body' });
    dialog.append(el('div', { class: 'dialog-header' }, el('h2', { id: titleId }, title), el('button', { class: 'close', type: 'button', 'aria-label': 'Bezárás', onclick: close }, icon('close'))), body);
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
    dialog.addEventListener('click', (event) => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } });
    root.append(dialog);
    currentDialog = dialog;
    dialog.showModal();
    return { dialog, body, close };
  }
  function openPhoto(part) {
    if (!part?.photo) return;
    const { dialog, body } = openDialog(part.name, { preserveParent: true });
    dialog.classList.add('photo-dialog');
    const error = el('p', { class: 'photo-error', role: 'status', hidden: '' }, 'A fotó most nem tölthető be. Kérjük, próbálja újra később.');
    const image = el('img', {
      class: 'photo-full', src: part.photo, alt: part.name, decoding: 'async', fetchpriority: 'high',
      onerror: (event) => { event.target.hidden = true; error.hidden = false; }
    });
    // Reuse the exact image URL so the browser can serve an already-loaded photo from its cache.
    body.append(image, error);
  }
  async function openDetails(item) {
    const view = openDialog(item.name);
    const { body, dialog } = view;
    body.append(el('p', { class: 'detail-price' }, A.money(item.price) + (item.kind === 'weekly' ? ' / teljes hét' : ' / adag')));
    if (item.kind === 'weekly') body.append(el('p', { class: 'notice' }, 'Ez a csomag az egész hétre szól. A feltüntetett összeg a teljes heti ár.'));
    for (const part of item.parts) {
      const section = el('section', { class: 'detail-section' }, el('h3', {}, (part.day ? part.day + ' · ' : '') + part.name));
      if (part.photo) section.append(el('button', { class: 'detail-photo-button', type: 'button', 'aria-label': 'Fotó nagyítása: ' + part.name, 'aria-haspopup': 'dialog', onclick: () => openPhoto(part) }, el('img', { class: 'detail-photo', src: part.photo, alt: part.name, loading: 'lazy' }), el('span', { class: 'photo-zoom-hint', 'aria-hidden': 'true' }, icon('search', 18), 'Nagyítás')));
      const details = el('div', { class: 'detail-data' }, el('p', { class: 'muted' }, 'Összetevők betöltése…'));
      section.append(details); body.append(section);
      if (!/^\d+$/.test(part.id)) { details.textContent = 'A részletek az eredeti oldalon érhetők el.'; continue; }
      try {
        const response = await fetch('/foodinfo/' + part.id, { credentials: 'same-origin', signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error('Details unavailable');
        const data = await response.json();
        if (!dialog.isConnected) return;
        details.replaceChildren();
        for (const [field, label] of [['ingredients', 'Összetevők'], ['allergies', 'Allergének'], ['serving', 'Adag mérete'], ['kcal', 'Energiatartalom (kcal)']]) {
          const value = data[field];
          if (value !== undefined && value !== null && String(value).trim()) {
            // The endpoint can contain HTML. Parse in an inert document and copy only text.
            const plain = new DOMParser().parseFromString(String(value), 'text/html').body.textContent;
            details.append(el('p', {}, el('strong', {}, label + ': '), A.clean(plain)));
          }
        }
        if (!details.childNodes.length) details.textContent = 'Az oldal ehhez az ételhez nem adott meg további adatot.';
      } catch {
        details.replaceChildren(el('p', {}, 'A részleteket most nem sikerült betölteni. Próbálja újra, vagy nyissa meg az eredeti oldalt.'), el('button', { class: 'secondary', onclick: showOriginal }, 'Eredeti oldal'));
      }
    }
  }
  function openCart() {
    const { body } = openDialog('A kiválasztott ételek');
    body.append(el('p', { class: 'muted' }, 'Nézze át a választását, majd lépjen tovább a rendeléshez.'), el('div', { class: 'cart-lines' }));
    renderCartLines();
  }
  function renderCartLines() {
    const lines = shadow.querySelector('.cart-lines');
    if (!lines) return;
    const focused = shadow.activeElement?.dataset?.focusKey;
    lines.replaceChildren();
    const chosen = model.items.filter((i) => A.quantity(i.input));
    if (!chosen.length) { lines.append(el('div', { class: 'empty' }, icon('bag', 44), el('h3', {}, 'A kosár még üres'), el('p', {}, 'Válasszon ételt a + gombbal.'))); return; }
    const groups = [...model.days.map((d) => ({ id: d.id, label: d.name + ' · ' + formatDate(d.date) })), { id: null, label: 'Teljes heti csomagok' }];
    for (const group of groups) {
      const items = chosen.filter((i) => i.day === group.id);
      if (!items.length) continue;
      const section = el('section', { class: 'cart-day' }, el('h3', {}, group.label));
      for (const item of items) {
        const n = A.quantity(item.input);
        section.append(el('div', { class: 'cart-line' }, el('div', {}, el('strong', {}, item.name), el('small', {}, A.money(item.price) + (item.kind === 'weekly' ? ' / teljes hét' : ' / adag'))),
          el('div', { class: 'quantity' }, el('button', { type: 'button', class: 'quantity-button', 'data-focus-key': item.id + '-minus', 'aria-label': 'Egy adaggal kevesebb: ' + item.name, onclick: () => adjust(item, -1) }, '−'), el('span', {}, n + ' db'), el('button', { type: 'button', class: 'quantity-button plus', 'data-focus-key': item.id + '-plus', 'aria-label': 'Egy adaggal több: ' + item.name, disabled: n >= 99 ? '' : null, onclick: () => adjust(item, 1) }, '+')),
          el('strong', { class: 'line-total' }, A.money(n * item.price))));
      }
      lines.append(section);
    }
    const total = chosen.reduce((sum, item) => sum + A.quantity(item.input) * item.price, 0);
    lines.append(el('div', { class: 'cart-summary' }, el('span', {}, 'Ételek összesen'), el('strong', {}, A.money(total))),
      el('p', { class: 'muted cart-disclaimer' }, 'A szállítási díjat, kedvezményeket és a végleges fizetendő összeget a weboldal a következő lépésben mutatja.'),
      el('button', { class: 'primary wide', type: 'button', onclick: submitCart }, 'Tovább a rendelés ellenőrzéséhez', icon('arrow', 22)));
    if (focused) [...lines.querySelectorAll('[data-focus-key]')].find((n) => n.dataset.focusKey === focused)?.focus();
  }
  function submitCart(event) {
    if (!model.form.isConnected || !model.items.some((i) => A.quantity(i.input))) return;
    const action = A.sameSite(model.form.action, location.href);
    if (!action || new URL(action).pathname !== '/kosar') { currentDialog?.close(); return showError('A rendelési űrlap megváltozott. Folytassa az eredeti oldalon.'); }
    if (auth === 'signed-out') { saveDraft(); writeSession(returnKey, path); location.href = '/belepes'; return; }
    saveDraft();
    writeSession('baeasy-active-draft', draftKey);
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = 'A rendelés betöltése…';
    // Native submit preserves all server fields, cookies, CSRF tokens and website validation.
    model.form.requestSubmit();
    setTimeout(() => {
      if (event.target.isConnected) { event.target.disabled = false; event.target.textContent = 'Tovább a rendelés ellenőrzéséhez'; }
    }, 12000);
  }
})();
