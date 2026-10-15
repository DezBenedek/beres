/* The adapter reads the site's real form. It never invents a product or endpoint. */
(function (root) {
  'use strict';
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalize = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const money = (value) => new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0, useGrouping: 'always' }).format(value) + ' Ft';
  function priceFrom(text) {
    const match = clean(text).match(/(\d[\d\s\u00a0]*)\s*Ft\b/i);
    return match ? Number(match[1].replace(/\s/g, '')) : null;
  }
  function quantity(input) {
    const n = Number(input?.value);
    return Number.isInteger(n) && n >= 0 && n <= 99 ? n : 0;
  }
  function category(code, title) {
    const t = normalize(title);
    if (/^L\d/.test(code) || t.includes('leves')) return 'Levesek';
    if (/^D\d/.test(code) || t.includes('desszert')) return 'Desszertek';
    if (/^F\d/.test(code) || t.includes('fozelek')) return 'Főzelékek';
    if (/salata|nyers zoldseg/.test(t)) return 'Saláták, zöldségek';
    if (/^GY/.test(code) || t.includes('gyerek')) return 'Gyerekételek';
    if (/egesznapos|egesz napos|napos|plandurance/.test(t)) return 'Étrendek';
    if (/menu/.test(t)) return 'Menük';
    if (/reggeli|uzsonna|ital/.test(t)) return 'Reggeli, uzsonna';
    return 'Főételek';
  }
  function sameSite(url, base) {
    try {
      const parsed = new URL(url, base);
      return parsed.protocol === 'https:' && ['www.beresalexandra.hu', 'beresalexandra.hu'].includes(parsed.hostname) ? parsed.href : null;
    } catch { return null; }
  }
  function photoUrl(file, base) {
    if (!file || /[\\/]|\.\./.test(file)) return null;
    return sameSite('/foodpic/' + encodeURIComponent(file), base);
  }
  function parseArray(value) {
    try { const a = JSON.parse(value); return Array.isArray(a) ? a : []; } catch { return []; }
  }
  function authState(doc) {
    const links = [...doc.querySelectorAll('a[href]')];
    if (links.some((a) => /\/(kilepes|kijelentkezes|logout)(?:[/?#]|$)/i.test(a.getAttribute('href')) || /kijelentkez|kilépés/.test(a.textContent.toLowerCase()))) return 'signed-in';
    if (links.some((a) => /\/belepes\/?(?:[?#].*)?$/.test(a.getAttribute('href')))) return 'signed-out';
    return 'unknown';
  }
  function parseMenu(doc, base = 'https://www.beresalexandra.hu/') {
    const table = doc.querySelector('#menutable');
    const form = doc.querySelector('#menureal');
    if (!table || !form || !sameSite(form.action, base) || new URL(form.action, base).pathname !== '/kosar') return null;
    const headers = [...table.querySelectorAll('thead tr')];
    const dayHeaders = [...(headers[0]?.querySelectorAll('th') || [])].slice(1);
    const dates = [...(headers[1]?.querySelectorAll('th') || [])].slice(1);
    const days = dayHeaders.map((th, i) => ({ id: i + 1, name: clean(th.textContent), date: clean(dates[i]?.textContent), available: false }));
    if (!days.length || days.some((d) => !/^\d{4}\.\d{2}\.\d{2}\.$/.test(d.date))) return null;
    const items = [];
    const rows = [...table.querySelectorAll('tbody > tr')];
    const groups = [];
    for (const row of rows) {
      if (row.id.startsWith('menu_')) groups.push({ row, rows: [] });
      if (groups.length) groups.at(-1).rows.push(row);
    }
    for (const group of groups) {
      const code = group.row.id.slice(5);
      const categoryCell = group.row.cells[0];
      if (!categoryCell) continue;
      const clone = categoryCell.cloneNode(true);
      clone.querySelectorAll('a').forEach((a) => a.remove());
      const rawTitle = clean(clone.textContent).replace(new RegExp('^' + code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*'), '');
      const title = rawTitle.replace(/Heti ár:.*$/i, '').trim();
      const allInfo = group.rows.flatMap((row) => [...row.querySelectorAll('.foodinfo[data-food_id]')]);
      const buttons = group.rows.flatMap((row) => [...row.querySelectorAll('.portionbutton[data-dir="plus"]')]);
      for (const day of days) {
        const infos = allInfo.filter((info) => info.closest('td')?.classList.contains('menucol_' + day.id));
        if (!infos.length) continue;
        const plus = buttons.find((btn) => btn.dataset.day === String(day.id) && btn.dataset.is_weekly !== '1');
        const weeklyOnly = buttons.some((btn) => btn.dataset.is_weekly === '1') && !buttons.some((btn) => btn.dataset.day);
        if (weeklyOnly) continue;
        const input = plus && doc.getElementById('portion_' + plus.dataset.menumain + '_' + day.id);
        const cell = infos[0].closest('td');
        const price = plus?.dataset.price ? Number(plus.dataset.price) : priceFrom(cell.textContent);
        if (!Number.isFinite(price) || price <= 0) continue;
        const parts = infos.map((info) => ({
          id: info.dataset.food_id,
          name: clean(info.dataset.food_name),
          photo: photoUrl(info.dataset.picture, base),
          values: parseArray(info.closest('td').dataset.foodvalues),
          info
        }));
        const item = {
          id: input?.name || 'closed_' + code + '_' + day.id,
          code, day: day.id, date: day.date, title,
          name: parts.length === 1 ? parts[0].name : title + ' – napi csomag',
          category: category(code, title), price, parts,
          input, plus,
          minus: plus && [...plus.parentElement.querySelectorAll('.portionbutton')].find((btn) => btn.dataset.dir === 'minus'),
          available: !!input && !!plus && !plus.hasAttribute('disabled') && plus.getAttribute('aria-disabled') !== 'true' && !plus.classList.contains('disabled'),
          kind: 'daily'
        };
        items.push(item);
        if (item.available) day.available = true;
      }
      const weeklyPlus = buttons.find((btn) => btn.dataset.is_weekly === '1');
      // Weekly plans have their own price and quantity. Never substitute a daily price.
      if (weeklyPlus) {
        const input = doc.getElementById('portion_' + weeklyPlus.dataset.menumain + '_weekly');
        const price = priceFrom(rawTitle);
        if (input && price > 0) items.push({
          id: input.name, code, day: null, date: days.map((d) => d.date).join(','), title,
          name: title, category: 'Heti étrendek', price, input, plus: weeklyPlus,
          minus: [...weeklyPlus.parentElement.querySelectorAll('.portionbutton')].find((btn) => btn.dataset.dir === 'minus'),
          parts: allInfo.map((info) => ({ id: info.dataset.food_id, name: clean(info.dataset.food_name), photo: photoUrl(info.dataset.picture, base), info,
            day: days.find((d) => info.closest('td')?.classList.contains('menucol_' + d.id))?.name })),
          available: !weeklyPlus.classList.contains('disabled') && !weeklyPlus.hasAttribute('disabled') && weeklyPlus.getAttribute('aria-disabled') !== 'true', kind: 'weekly'
        });
      }
    }
    const notices = [...form.querySelectorAll('p')].map((p) => clean(p.textContent)).filter((s) => s.length < 700 && /szünetel|munkaszüneti|rendelési határidő|kiszállítás.*változ/i.test(s));
    return { form, table, days, items, notices: [...new Set(notices)], weekId: form.querySelector('[name="week_id"]')?.value || days[0].date,
      weekLabel: clean([...form.querySelectorAll('h3')].find((h) => /\d+\. hét/.test(h.textContent))?.textContent) };
  }
  function fingerprint(item) { return [item.date, item.price, item.parts.map((p) => p.id + ':' + p.name).join('|')].join(';'); }
  function draftEntries(items) {
    return items.filter((i) => i.available && quantity(i.input)).map((i) => ({ id: i.id, quantity: quantity(i.input), fingerprint: fingerprint(i) }));
  }
  function validDraft(entry, item) {
    return !!item && item.available && entry.id === item.id && entry.fingerprint === fingerprint(item) && Number.isInteger(entry.quantity) && entry.quantity >= 0 && entry.quantity <= 99;
  }
  function filteredItems(items, day, selectedCategory, query, sort = 'price-asc') {
    const q = normalize(query);
    const result = items.filter((i) => (selectedCategory === 'Heti étrendek' ? i.kind === 'weekly' : i.kind === 'daily' && i.day === day)
      && (selectedCategory === 'Mind' || i.category === selectedCategory)
      && (!q || normalize(i.name + ' ' + i.parts.map((p) => p.name).join(' ')).includes(q)));
    return result.sort((a, b) => sort === 'price-desc' ? b.price - a.price : sort === 'name' ? a.name.localeCompare(b.name, 'hu') : a.price - b.price);
  }
  const api = { clean, normalize, money, priceFrom, quantity, category, sameSite, photoUrl, authState, parseMenu, fingerprint, draftEntries, validDraft, filteredItems };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BeresEasyAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
