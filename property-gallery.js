/*
 * Copyright (c) 2026 Reside Here LLC. All rights reserved.
 * No AI training, fine-tuning, or inclusion in AI/ML training datasets without prior written permission.
 * See LICENSE.txt for terms. Third-party materials retain their own licenses.
 */
(() => {
  'use strict';

  function initializeGalleries() {
    document.querySelectorAll('[data-property-gallery]').forEach((gallery) => {
      if (gallery.dataset.galleryReady === 'true') return;

      const slides = [...gallery.querySelectorAll('[data-property-slide]')];
      const controls = gallery.querySelector('[data-gallery-controls]');
      const previousButton = gallery.querySelector('[data-gallery-previous]');
      const nextButton = gallery.querySelector('[data-gallery-next]');
      const status = gallery.querySelector('[data-gallery-status]');
      const dots = [...gallery.querySelectorAll('[data-gallery-dot]')];

      // Leave the complete photo list available if enhancement is incomplete.
      if (!slides.length || !controls || !previousButton || !nextButton || !status) return;

      let currentIndex = 0;

      function positionImageControls() {
        const photo = slides[currentIndex].querySelector('img');
        if (!photo) return;
        const photoBounds = photo.getBoundingClientRect();
        const galleryBounds = gallery.getBoundingClientRect();
        // Contain preserves the photo's proportions inside the taller frame. Position
        // overlays over the visible photo, excluding any letterboxing around it.
        const naturalWidth = photo.naturalWidth || Number(photo.getAttribute('width'));
        const naturalHeight = photo.naturalHeight || Number(photo.getAttribute('height'));
        if (!naturalWidth || !naturalHeight) return;
        const scale = Math.min(
          photoBounds.width / naturalWidth,
          photoBounds.height / naturalHeight,
        );
        const renderedWidth = naturalWidth * scale;
        const renderedHeight = naturalHeight * scale;
        const left =
          photoBounds.left -
          galleryBounds.left -
          gallery.clientLeft +
          (photoBounds.width - renderedWidth) / 2;
        const top =
          photoBounds.top -
          galleryBounds.top -
          gallery.clientTop +
          (photoBounds.height - renderedHeight) / 2;
        gallery.style.setProperty('--gallery-image-center', `${top + renderedHeight / 2}px`);
        gallery.style.setProperty('--gallery-image-bottom', `${top + renderedHeight}px`);
        gallery.style.setProperty('--gallery-image-left', `${left}px`);
        gallery.style.setProperty(
          '--gallery-image-right',
          `${gallery.clientWidth - left - renderedWidth}px`,
        );
      }

      function showSlide(index) {
        currentIndex = (index + slides.length) % slides.length;
        slides.forEach((slide, slideIndex) => {
          slide.hidden = slideIndex !== currentIndex;
        });
        dots.forEach((dot, dotIndex) => {
          dot.setAttribute('aria-current', String(dotIndex === currentIndex));
        });
        status.textContent = `Photo ${currentIndex + 1} of ${slides.length}`;
        positionImageControls();
      }

      previousButton.addEventListener('click', () => showSlide(currentIndex - 1));
      nextButton.addEventListener('click', () => showSlide(currentIndex + 1));

      // Arrow shortcuts apply only to the photo controls, never to page links or inputs.
      controls.addEventListener('keydown', (event) => {
        if (
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          (event.target !== previousButton && event.target !== nextButton)
        ) {
          return;
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          showSlide(currentIndex - 1);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          showSlide(currentIndex + 1);
        }
      });

      previousButton.disabled = slides.length < 2;
      nextButton.disabled = slides.length < 2;
      // Keep the arrows centered on the actual photo after resizing or image loading.
      gallery.addEventListener('load', positionImageControls, true);
      if ('ResizeObserver' in window) {
        const observer = new ResizeObserver(positionImageControls);
        observer.observe(gallery.querySelector('.property-gallery-slides'));
      } else {
        window.addEventListener('resize', positionImageControls);
      }
      showSlide(0);
      gallery.dataset.galleryReady = 'true';
      controls.hidden = false;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGalleries, { once: true });
  } else {
    initializeGalleries();
  }
})();
