(() => {
  'use strict';

  const menuToggle = document.querySelector('#menu-toggle');
  const siteNav = document.querySelector('#site-nav');
  const desktop = window.matchMedia('(min-width: 901px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const closeMenu = (restoreFocus = false) => {
    if (!menuToggle || !siteNav) return;
    menuToggle.setAttribute('aria-expanded', 'false');
    siteNav.classList.remove('is-open');
    if (restoreFocus) menuToggle.focus();
  };

  if (menuToggle && siteNav) {
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.addEventListener('click', () => {
      const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!isOpen));
      siteNav.classList.toggle('is-open', !isOpen);
    });

    siteNav.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
        closeMenu(true);
      }
    });

    document.addEventListener('click', (event) => {
      if (!siteNav.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
    });

    desktop.addEventListener('change', () => closeMenu());
  }

  const filters = [...document.querySelectorAll('[data-filter]')];
  const communities = [...document.querySelectorAll('[data-community]')];
  const communityCount = document.querySelector('#community-count');
  const locationSelect = document.querySelector('#location');
  const cityLabels = {
    belleville: 'Belleville',
    ofallon: "O'Fallon",
    swansea: 'Swansea',
    decatur: 'Decatur',
  };

  function filterCommunities(city) {
    const selectedCity = Object.hasOwn(cityLabels, city) ? city : 'all';
    let visibleCount = 0;

    communities.forEach((community) => {
      const show = selectedCity === 'all' || community.dataset.city === selectedCity;
      community.hidden = !show;
      if (show) visibleCount += 1;
    });

    filters.forEach((filter) => {
      const isActive = filter.dataset.filter === selectedCity;
      filter.setAttribute('aria-pressed', String(isActive));
      filter.classList.toggle('is-active', isActive);
    });

    if (locationSelect) locationSelect.value = selectedCity;
    if (communityCount) {
      const noun = visibleCount === 1 ? 'community' : 'communities';
      communityCount.textContent = selectedCity === 'all'
        ? `Showing all ${visibleCount} ${noun}`
        : `Showing ${visibleCount} ${noun} in ${cityLabels[selectedCity]}`;
    }
  }

  filters.forEach((filter) => {
    filter.addEventListener('click', () => filterCommunities(filter.dataset.filter));
  });

  document.querySelector('#reset-filter')?.addEventListener('click', () => filterCommunities('all'));

  document.querySelector('#home-finder')?.addEventListener('submit', (event) => {
    event.preventDefault();
    filterCommunities(locationSelect?.value ?? 'all');
    document.querySelector('#communities-heading')?.focus({ preventScroll: true });
    document.querySelector('#communities')?.scrollIntoView({
      behavior: reducedMotion.matches ? 'auto' : 'smooth',
      block: 'start',
    });
  });

  if (communities.length) filterCommunities('all');

  const currentYear = document.querySelector('#current-year');
  if (currentYear) currentYear.textContent = String(new Date().getFullYear());
})();
