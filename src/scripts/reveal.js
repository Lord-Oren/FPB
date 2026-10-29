// Both versions: sections and cards fade in gently once, as they scroll into view.
// Nothing moves for visitors who prefer reduced motion, and without JavaScript everything is simply visible.
(() => {
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const items = document.querySelectorAll('[data-reveal], .content-page :is(.work-card, .event-card, .press-item, .team-member, .job-card, .case-list li, .about-photos li)');
  if (!items.length) return;
  document.documentElement.classList.add('reveal-ready');
  const list = [...items];
  // When an item shows, everything above it shows too: a fast jump (End key, a link to a section) never leaves
  // skipped items invisible above the visitor.
  const show = item => { item.classList.add('is-visible'); seen.unobserve(item); };
  const seen = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting || entry.boundingClientRect.bottom < 0) list.slice(0, list.indexOf(entry.target) + 1).forEach(show);
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  list.forEach(item => seen.observe(item));
})();
