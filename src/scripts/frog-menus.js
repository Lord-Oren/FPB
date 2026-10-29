(() => {
  const preserveOriginalColours = document.querySelector('.pond-page')?.getAttribute('data-artwork-mode') === 'original';
  const frogs = [...document.querySelectorAll('.frog-wrap')];
  // Exclude every displayed colour, including the clicked frog’s own colour.
  const palette = [
    { name: 'dandelion', weight: 100 },
    { name: 'blue-marine', weight: 100 },
    { name: 'aero-blue', weight: 100 },
    { name: 'midnight', weight: 100 },
    { name: 'deep-sea', weight: 1 },
  ];

  function drawColor(frog) {
    const occupied = new Set(frogs.map(item => item.getAttribute('data-frog-color')));
    const available = palette.filter(color => !occupied.has(color.name));
    let ticket = Math.random() * available.reduce((sum, color) => sum + color.weight, 0);
    let selected = available[available.length - 1];
    for (const color of available) {
      ticket -= color.weight;
      if (ticket < 0) {
        selected = color;
        break;
      }
    }
    frog.setAttribute('data-frog-color', selected.name);
  }

  function setOpen(frog, open) {
    frog.classList.toggle('open', open);
    frog.querySelector('.frog-button').setAttribute('aria-expanded', String(open));
    frog.querySelector('.tongue').hidden = !open;
  }
  frogs.forEach(frog => {
    frog.querySelector('.frog-button').addEventListener('click', () => {
      const open = !frog.classList.contains('open');
      if (open && !preserveOriginalColours) drawColor(frog);
      frogs.forEach(item => setOpen(item, item === frog && open));
    });
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.frog-wrap')) frogs.forEach(frog => setOpen(frog, false));
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const open = frogs.find(frog => frog.classList.contains('open'));
    if (open) {
      setOpen(open, false);
      open.querySelector('.frog-button').focus();
    }
  });
  document.addEventListener('focusin', event => {
    frogs.forEach(frog => {
      if (!frog.contains(event.target)) setOpen(frog, false);
    });
  });
})();
