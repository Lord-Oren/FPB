// B V3 (T19): frog menus of version B (home and inner pages). Same behaviour as frog-menus.js (A keeps that file
// untouched): a click opens the tongue with the sub-sections, only one frog at a time, Escape and a click or focus
// outside close it. On opening, the frog draws a brand colour (weighted, deep-sea rare) that no other frog wears
// and that is not the colour of its own panel, so it always stands out.
(() => {
  const menus = [...document.querySelectorAll('.v3-menu')];
  if (!menus.length) return;
  const frogs = menus.map(menu => menu.querySelector('.v3-frog'));
  const palette = [
    { name: 'dandelion', weight: 100 },
    { name: 'blue-marine', weight: 100 },
    { name: 'aero-blue', weight: 100 },
    { name: 'midnight', weight: 100 },
    { name: 'deep-sea', weight: 1 },
  ];
  function drawColor(menu, frog) {
    const occupied = new Set(frogs.map(item => item.getAttribute('data-frog-color')));
    const panel = menu.getAttribute('data-panel');
    const available = palette.filter(color => !occupied.has(color.name) && color.name !== panel);
    if (!available.length) return;
    let ticket = Math.random() * available.reduce((sum, color) => sum + color.weight, 0);
    let selected = available[available.length - 1];
    for (const color of available) {
      ticket -= color.weight;
      if (ticket < 0) { selected = color; break; }
    }
    frog.setAttribute('data-frog-color', selected.name);
  }
  function setOpen(menu, open) {
    menu.classList.toggle('open', open);
    menu.querySelector('.v3-frog-button').setAttribute('aria-expanded', String(open));
    menu.querySelector('.v3-tongue').hidden = !open;
  }
  menus.forEach((menu, index) => {
    menu.querySelector('.v3-frog-button').addEventListener('click', () => {
      const open = !menu.classList.contains('open');
      if (open) drawColor(menu, frogs[index]);
      menus.forEach(item => setOpen(item, item === menu && open));
    });
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.v3-frog')) menus.forEach(menu => setOpen(menu, false));
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const open = menus.find(menu => menu.classList.contains('open'));
    if (open) { setOpen(open, false); open.querySelector('.v3-frog-button').focus(); }
  });
  document.addEventListener('focusin', event => {
    menus.forEach(menu => { if (!menu.querySelector('.v3-frog').contains(event.target)) setOpen(menu, false); });
  });
})();
