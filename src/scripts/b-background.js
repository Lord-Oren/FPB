// B background chosen by the visitor: Standard (deep blue-green) or Cream. The choice stays in this browser only
// (localStorage, key fpb-b-background); nothing is sent to the server. b-background-early.js applies it before paint.
(() => {
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll('[data-bg]')];
  const show = value => {
    root.setAttribute('data-b-background', value);
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.getAttribute('data-bg') === value));
  };
  for (const group of document.querySelectorAll('[data-bg-switch]')) group.hidden = false;
  show(root.getAttribute('data-b-background') === 'cream' ? 'cream' : 'standard');
  for (const button of buttons) button.addEventListener('click', () => {
    const value = button.getAttribute('data-bg') === 'cream' ? 'cream' : 'standard';
    show(value);
    try { localStorage.setItem('fpb-b-background', value); } catch {}
  });
})();
