/* Test/demo-only handler. Never included in the extension release. */
document.querySelectorAll('.portionbutton').forEach((button) => button.addEventListener('click', (event) => {
  event.preventDefault();
  const d = button.dataset;
  const suffix = d.is_weekly === '1' ? 'weekly' : d.day;
  const input = document.getElementById(`portion_${d.menumain}_${suffix}`);
  if (!input) return;
  input.value = String(Math.max(0, Math.min(99, Number(input.value) + (d.dir === 'plus' ? 1 : -1))));
  const display = document.getElementById(`portiondisplay_${d.menumain}_${suffix}`);
  if (display) display.textContent = input.value + ' db';
}));
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  document.querySelectorAll('form').forEach((form) => form.addEventListener('submit', (event) => {
    event.preventDefault();
    // The local demo cannot submit credentials, orders or payments to the live service.
    if (form.id === 'menureal') {
      const items = [...form.querySelectorAll('input[name^="portion_"]')].filter((i) => Number(i.value)).map((i) => ({ id: i.name, quantity: Number(i.value) }));
      sessionStorage.setItem('baeasy-demo-cart', JSON.stringify(items));
      location.href = '/kosar';
    } else {
      const message = document.createElement('p');
      message.setAttribute('role', 'status');
      message.textContent = 'Ez helyi bemutató. Nem küldünk be belépést vagy valódi rendelést.';
      form.append(message);
    }
  }));
}
