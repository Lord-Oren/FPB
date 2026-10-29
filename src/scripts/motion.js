// Motion shared by A and B: links to a section further down glide there instead of jumping, and the section
// greets the visitor on arrival; page changes start from where the visitor clicked (see motion.css).
// Visitors who prefer reduced motion get instant jumps, still with the keyboard focus moved to the section.
(() => {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function arrive(target) {
    if (!target.matches('a, button, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.classList.remove('just-arrived');
    void target.offsetWidth;
    target.classList.add('just-arrived');
    target.addEventListener('animationend', () => target.classList.remove('just-arrived'), { once: true });
  }

  function glide(target) {
    const start = window.scrollY;
    const offset = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    // offsetTop ignores the reveal shift a section may still have, so the glide stops exactly at its top.
    let top = 0;
    for (let node = target; node; node = node.offsetParent) top += node.offsetTop;
    const end = Math.min(top - offset, document.documentElement.scrollHeight - innerHeight);
    const distance = end - start;
    if (still.matches || Math.abs(distance) < 4) { window.scrollTo(0, end); arrive(target); return; }
    const duration = Math.min(1100, Math.max(650, Math.abs(distance) * .45));
    let begin = null, cancelled = false;
    const stop = () => { cancelled = true; };
    window.addEventListener('wheel', stop, { once: true, passive: true });
    window.addEventListener('touchstart', stop, { once: true, passive: true });
    const step = now => {
      if (cancelled) return;
      begin ??= now;
      const t = Math.min(1, (now - begin) / duration);
      window.scrollTo(0, start + distance * ease(t));
      if (t < 1) requestAnimationFrame(step); else { window.removeEventListener('wheel', stop); window.removeEventListener('touchstart', stop); arrive(target); }
    };
    requestAnimationFrame(step);
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.classList.contains('skip-link')) return;
    const id = decodeURIComponent(link.getAttribute('href').slice(1));
    const target = id && document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    history.pushState(null, '', `#${id}`);
    glide(target);
  });

  // Page changes (motion.css): remember where the visitor clicked so the next page opens from that point.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href$=".html"], a[href*=".html#"]');
    if (!link) return;
    try { sessionStorage.setItem('fpb-from', `${Math.round(event.clientX / innerWidth * 100)} ${Math.round(event.clientY / innerHeight * 100)}`); } catch {}
  });
  window.addEventListener('pagereveal', () => {
    let from = null;
    try { from = sessionStorage.getItem('fpb-from'); sessionStorage.removeItem('fpb-from'); } catch {}
    const [x, y] = (from || '50 50').split(' ');
    document.documentElement.style.setProperty('--from-x', `${x}%`);
    document.documentElement.style.setProperty('--from-y', `${y}%`);
  });

  // Cards inside a section arrive one after the other (reveal.js shows the section).
  document.querySelectorAll('[data-reveal]').forEach(section => {
    section.querySelectorAll(':is(.hm-tile, .hm-card, .hm-people li, .hm-service, .hm-channels a)').forEach((item, index) => item.style.setProperty('--i', index));
  });
  document.querySelectorAll('.content-page :is(.work-card, .event-card, .press-item, .team-member, .job-card, .case-list li, .about-photos li)').forEach(item => {
    item.style.setProperty('--i', Math.min([...item.parentElement.children].indexOf(item), 6));
  });
})();
