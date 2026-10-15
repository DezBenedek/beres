const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../extension/adapter.js');
test('Hungarian prices include whitespace and thousands', () => {
  assert.equal(A.priceFrom('Heti ár: 20 600 Ft'), 20600);
  assert.equal(A.priceFrom('1\u00a0850 Ft / adag'), 1850);
  assert.equal(A.priceFrom('nincs megadva'), null);
  assert.match(A.money(1850), /1\s850 Ft/);
});
test('only exact HTTPS food site URLs are allowed', () => {
  assert.equal(A.sameSite('/kosar', 'https://www.beresalexandra.hu/etlap'), 'https://www.beresalexandra.hu/kosar');
  for (const url of ['javascript:alert(1)', 'http://www.beresalexandra.hu/kosar', 'https://www.beresalexandra.hu.evil.test/', '//evil.test/kosar']) assert.equal(A.sameSite(url, 'https://www.beresalexandra.hu'), null);
});
test('photos use the observed endpoint and reject path traversal', () => {
  assert.equal(A.photoUrl('124_karfiolkremleves.jpg', 'https://www.beresalexandra.hu'), 'https://www.beresalexandra.hu/foodpic/124_karfiolkremleves.jpg');
  for (const file of ['../secret', 'a/b.jpg', 'a\\b.jpg', '']) assert.equal(A.photoUrl(file, 'https://www.beresalexandra.hu'), null);
});
test('quantities reject malformed and excessive native values', () => {
  for (const value of ['-1', '100', '3.5', 'nope', 'Infinity']) assert.equal(A.quantity({ value }), 0);
  assert.equal(A.quantity({ value: '99' }), 99);
  assert.equal(A.quantity(null), 0);
});
test('categories recognize Hungarian food types', () => {
  assert.equal(A.category('L3', 'LEVES, hússal'), 'Levesek');
  assert.equal(A.category('D1', 'DESSZERT'), 'Desszertek');
  assert.equal(A.category('F2', 'FŐZELÉK'), 'Főzelékek');
  assert.equal(A.category('SKE1', 'SÚLYKONTROLL DIÉTA EGÉSZNAPOS'), 'Étrendek');
  assert.equal(A.category('HAL', 'HALÉTELEK'), 'Főételek');
});
const item = { id: 'portion_30922_1', date: '2026.10.19.', price: 850, parts: [{ id: '124', name: 'Karfiolkrémleves' }], available: true, input: { value: '2' }, kind: 'daily', day: 1, category: 'Levesek', name: 'Karfiolkrémleves' };
test('draft restore requires an exact match of date, food IDs, names and price', () => {
  const [entry] = A.draftEntries([item]);
  assert.equal(A.validDraft(entry, item), true);
  for (const altered of [{ ...item, price: 890 }, { ...item, date: '2026.10.20.' }, { ...item, parts: [{ id: '125', name: 'Másik leves' }] }, { ...item, available: false }]) assert.equal(A.validDraft(entry, altered), false);
  for (const quantity of [-1, 100, 1.5, '2', Infinity]) assert.equal(A.validDraft({ ...entry, quantity }, item), false);
});
test('search ignores Hungarian accents and stays in the selected day/category', () => {
  const other = { ...item, id: 'other', name: 'Zöldborsóleves', price: 990, parts: [{ name: 'Zöldborsóleves' }] };
  assert.deepEqual(A.filteredItems([item, other], 1, 'Levesek', 'karfiolkrem'), [item]);
  assert.deepEqual(A.filteredItems([item, other], 2, 'Mind', ''), []);
  assert.deepEqual(A.filteredItems([item, other], 1, 'Desszertek', ''), []);
  assert.deepEqual(A.filteredItems([item, other], 1, 'Mind', '', 'price-desc'), [other, item]);
});
test('weekly plans are explicit and never leak into daily selections', () => {
  const weekly = { ...item, id: 'weekly', kind: 'weekly', day: null, category: 'Heti étrendek', price: 7100 };
  assert.deepEqual(A.filteredItems([item, weekly], 1, 'Mind', ''), [item]);
  assert.deepEqual(A.filteredItems([item, weekly], 1, 'Heti étrendek', ''), [weekly]);
});
