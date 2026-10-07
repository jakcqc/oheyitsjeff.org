/*
 * Copyright (c) 2026 Reside Here LLC. All rights reserved.
 * No AI training, fine-tuning, or inclusion in AI/ML training datasets without prior written permission.
 * See LICENSE.txt for terms. Third-party materials retain their own licenses.
 */
(() => {
  'use strict';

  const navigation = document.querySelector('#site-nav');
  const toggle = document.querySelector('#navigation-toggle');
  const secondary = document.querySelector('#secondary-navigation');
  const mobile = window.matchMedia('(max-width: 900px)');
  let expanded = false;

  const header = document.querySelector('.site-header');
  const topbar = document.querySelector('.topbar');
  if (header && topbar) {
    let updatePending = false;
    const updateStickyHeader = () => {
      updatePending = false;
      const stuck =
        getComputedStyle(header).position === 'sticky' &&
        topbar.getBoundingClientRect().bottom <= 0;
      const state = String(stuck);
      if (header.dataset.stuck !== state) header.dataset.stuck = state;
      document.documentElement.style.setProperty('--header-height', `${header.getBoundingClientRect().height}px`);
    };
    const scheduleStickyUpdate = () => {
      if (updatePending) return;
      updatePending = true;
      requestAnimationFrame(updateStickyHeader);
    };
    window.addEventListener('scroll', scheduleStickyUpdate, { passive: true });
    window.addEventListener('resize', scheduleStickyUpdate);
    window.addEventListener('pageshow', scheduleStickyUpdate);
    new MutationObserver(scheduleStickyUpdate).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-text-size', 'data-text-spacing'],
    });
    if ('ResizeObserver' in window) {
      const headerObserver = new ResizeObserver(scheduleStickyUpdate);
      headerObserver.observe(topbar);
      headerObserver.observe(header);
    }
    updateStickyHeader();
  }

  function setExpanded(value, animate = true) {
    if (!toggle || !secondary) return;
    expanded = mobile.matches && value;
    const hideSecondary = mobile.matches && !expanded;
    if (hideSecondary && secondary.contains(document.activeElement)) toggle.focus();
    toggle.setAttribute('aria-expanded', String(expanded));
    // Keep the panel rendered for its exit animation, but remove closed links from
    // keyboard navigation and the accessibility tree immediately.
    secondary.hidden = false;
    secondary.inert = hideSecondary;
    secondary.setAttribute('aria-hidden', String(hideSecondary));
    navigation.dataset.menuAnimated = String(animate);
    navigation.dataset.expanded = String(expanded);
  }

  if (navigation && toggle && secondary) {
    const updateViewport = () => {
      const activeElement = document.activeElement;
      if (mobile.matches) {
        toggle.hidden = false;
        if (activeElement?.matches('.nav-cta, .topbar-maintenance-link')) toggle.focus();
      } else {
        secondary.hidden = false;
        if (activeElement === toggle) navigation.querySelector('a')?.focus();
        toggle.hidden = true;
      }
      setExpanded(false, false);
    };

    toggle.addEventListener('click', () => setExpanded(!expanded));
    navigation.closest('.site-header')?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && expanded) {
        event.preventDefault();
        setExpanded(false);
        toggle.focus();
      }
    });
    document.addEventListener('click', (event) => {
      if (expanded && !navigation.contains(event.target) && !toggle.contains(event.target)) {
        setExpanded(false);
      }
    });
    document.addEventListener('focusin', (event) => {
      if (expanded && !navigation.contains(event.target) && !toggle.contains(event.target)) {
        setExpanded(false);
      }
    });
    mobile.addEventListener('change', updateViewport);
    navigation.dataset.navigationReady = 'true';
    updateViewport();
  }

  // Close the disclosure before navigating; same-page links also move focus.
  navigation?.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a');
    if (!link) return;
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }
    setExpanded(false);
    const destination = new URL(link.href, window.location.href);
    if (
      destination.origin === window.location.origin &&
      destination.pathname === window.location.pathname &&
      destination.hash
    ) {
      let target;
      try {
        target = document.getElementById(decodeURIComponent(destination.hash.slice(1)));
      } catch {
        return;
      }
      if (target) {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    }
  });

  const currentYear = document.querySelector('#current-year');
  if (currentYear) currentYear.textContent = String(new Date().getFullYear());
})();
