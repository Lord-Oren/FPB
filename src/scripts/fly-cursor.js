(() => {
  const fly = document.querySelector('.fly-cursor');
  const pointer = window.matchMedia('(pointer: fine)');
  if (!fly) return;
  function resetCursor() {
    fly.classList.remove('visible');
    document.body.classList.remove('fly-cursor-active');
  }
  window.addEventListener('mousemove', event => {
    if (!pointer.matches) return;
    fly.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-50%, -50%)`;
    fly.classList.add('visible');
    document.body.classList.add('fly-cursor-active');
  });
  document.documentElement.addEventListener('mouseleave', resetCursor);
  window.addEventListener('blur', resetCursor);
  pointer.addEventListener('change', resetCursor);
})();
