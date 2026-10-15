(async function () {
  'use strict';
  const ext = globalThis.browser || globalThis.chrome;
  const key = 'baeasy-settings';
  let settings = { enabled: true, largeText: false, ...(await ext.storage.local.get(key))[key] };
  const enabled = document.getElementById('enabled');
  const large = document.getElementById('large');
  const status = document.getElementById('status');
  enabled.checked = settings.enabled;
  large.checked = settings.largeText;
  async function save() {
    settings = { enabled: enabled.checked, largeText: large.checked };
    await ext.storage.local.set({ [key]: settings });
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    try { if (tab?.id) await ext.tabs.sendMessage(tab.id, { type: 'baeasy-refresh' }); } catch { /* No content script on unrelated websites. */ }
    status.textContent = 'Beállítás elmentve.';
  }
  enabled.addEventListener('change', save);
  large.addEventListener('change', save);
  document.getElementById('open').addEventListener('click', async () => {
    settings.enabled = true;
    await ext.storage.local.set({ [key]: settings });
    await ext.tabs.create({ url: 'https://www.beresalexandra.hu/kovetkezo_etlap' });
    window.close();
  });
})();
