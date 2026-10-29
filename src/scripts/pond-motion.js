(() => {
  const control = document.querySelector('.motion-toggle');
  const pond = document.querySelector('.pond-page');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!control) return;
  function setPaused(paused) {
    pond?.classList.toggle('motion-paused', paused);
    document.body.classList.toggle('motion-paused', paused);
    control.setAttribute('aria-pressed', String(paused));
    control.textContent = paused ? 'Resume motion' : 'Pause motion';
  }
  control.hidden = false;
  setPaused(preference.matches);
  control.addEventListener('click', () => setPaused(control.getAttribute('aria-pressed') !== 'true'));
  preference.addEventListener('change', event => setPaused(event.matches));
})();
