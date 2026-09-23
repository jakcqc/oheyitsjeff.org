/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

import { registerVisual } from "../helper/visualHelp.js";
import { loadArtCatalog } from "./localAssets.js";

const PAGE_SIZE = 20;
const ROTATION_CACHE_KEY = "svgGallery.rotation.v1";
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const ART_BUBBLE_SIZE_MIX = ["large", "small", "medium", "small", "medium", "large"];
const ART_BUBBLE_SIZE_SCALES = {
  small: 0.74,
  medium: 1,
  large: 1.8
};
const PACKING_GAP = 8;
const PACKING_PADDING = 10;

function clearEl(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function bindImageLoading(container, image) {
  const indicator = document.createElement("span");
  indicator.className = "svgGallery__imageStatus";
  indicator.setAttribute("aria-hidden", "true");
  container.appendChild(indicator);
  let generation = 0;

  image.addEventListener("load", async () => {
    const currentGeneration = generation;
    try { await image.decode(); } catch { /* A loaded image may already be decoded. */ }
    if (currentGeneration !== generation || !image.hasAttribute("src") || !image.naturalWidth) return;
    container.classList.remove("is-image-loading", "is-image-error");
    container.classList.add("is-image-ready");
    container.setAttribute("aria-busy", "false");
  });
  image.addEventListener("error", () => {
    if (!image.hasAttribute("src")) return;
    container.classList.remove("is-image-loading", "is-image-ready");
    container.classList.add("is-image-error");
    container.setAttribute("aria-busy", "false");
    indicator.textContent = "Image unavailable";
  });
  return {
    setSource(url) {
      if (image.getAttribute("src") === url) return;
      generation++;
      container.classList.remove("is-image-ready", "is-image-error");
      container.classList.add("is-image-loading");
      container.setAttribute("aria-busy", "true");
      indicator.textContent = "Loading…";
      image.src = url;
    },
    clear() {
      generation++;
      image.removeAttribute("src");
      container.classList.remove("is-image-ready", "is-image-loading", "is-image-error");
      container.setAttribute("aria-busy", "false");
      indicator.textContent = "";
    },
  };
}

function loadRotationCache() {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(ROTATION_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.warn("svgGallery: rotation cache read failed", err);
    return {};
  }
}

function saveRotationCache(cache) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ROTATION_CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn("svgGallery: rotation cache write failed", err);
  }
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

// Mirrors InnerLight's circle collision test. Art bubbles use fixed radii,
// while the packing surface is allowed to grow after the first viewport fills.
function isOverlapping(circles, x, y, radius, padding = 0) {
  return circles.some((circle) =>
    distance(x, y, circle.x, circle.y) < circle.r + radius + padding - 0.25
  );
}

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function randomizeArtCatalog(items) {
  const sizes = shuffled(items.map((_, index) =>
    ART_BUBBLE_SIZE_MIX[index % ART_BUBBLE_SIZE_MIX.length]
  ));
  return shuffled(items).map((item, index) => ({ ...item, bubbleSize: sizes[index] }));
}

function findPackedPosition(circles, radius, width, height, itemIndex) {
  const minX = PACKING_PADDING + radius;
  const maxX = width - PACKING_PADDING - radius;
  const minY = PACKING_PADDING + radius;
  const maxY = height - PACKING_PADDING - radius;
  if (maxX < minX || maxY < minY) return null;

  const centerX = width / 2;
  if (!circles.length) return { x: centerX, y: minY };

  let best = null;
  const consider = (x, y) => {
    if (x < minX || x > maxX || y < minY || y > maxY) return;
    if (isOverlapping(circles, x, y, radius, PACKING_GAP)) return;

    // Fill from the top down, then favor the horizontal center for a compact wall.
    const score = y * 10000 + Math.abs(x - centerX);
    if (!best || score < best.score) best = { x, y, score };
  };

  // InnerLight begins by attaching circles tangent to circles already placed.
  // A stable phase keeps existing bubbles in place when another page is appended.
  const angleSteps = 32;
  const phase = ((itemIndex * 0.61803398875) % 1) * Math.PI * 2;
  for (const parent of circles) {
    const tangentDistance = parent.r + radius + PACKING_GAP;
    for (let step = 0; step < angleSteps; step += 1) {
      const angle = phase + (step / angleSteps) * Math.PI * 2;
      consider(
        parent.x + tangentDistance * Math.cos(angle),
        parent.y + tangentDistance * Math.sin(angle)
      );
    }
  }

  if (best) return best;

  // Like InnerLight's gap-filling pass, scan remaining space when no tangent
  // candidate fits. This also guarantees progress for awkward radius mixes.
  const step = Math.max(8, Math.round(radius * 0.18));
  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) consider(x, y);
    if (best && best.y <= y) break;
  }

  return best;
}

function packArtBubbles(items, width, viewportHeight, largeDiameter) {
  if (!items.length || width <= 0) {
    return { circles: [], height: Math.max(1, viewportHeight) };
  }

  const maxDiameter = Math.max(1, width - PACKING_PADDING * 2);
  const responsiveScale = Math.min(1, maxDiameter / largeDiameter);
  const mediumDiameter = (largeDiameter / ART_BUBBLE_SIZE_SCALES.large) * responsiveScale;
  const radii = Object.fromEntries(
    Object.entries(ART_BUBBLE_SIZE_SCALES).map(([size, scale]) => [
      size,
      (mediumDiameter * scale) / 2
    ])
  );

  const firstScreenHeight = Math.max(viewportHeight, radii.large * 2 + PACKING_PADDING * 2);
  const extension = Math.max(firstScreenHeight * 0.45, radii.large * 2 + PACKING_GAP * 2);
  let packingHeight = firstScreenHeight;
  const circles = [];

  for (let index = 0; index < items.length; index += 1) {
    const size = items[index].bubbleSize;
    const radius = radii[size];
    let position = findPackedPosition(circles, radius, width, packingHeight, index);

    while (!position) {
      packingHeight += extension;
      position = findPackedPosition(circles, radius, width, packingHeight, index);
    }

    circles.push({ ...position, r: radius, size });
  }

  const usedHeight = circles.reduce(
    (max, circle) => Math.max(max, circle.y + circle.r + PACKING_PADDING),
    firstScreenHeight
  );

  return { circles, height: Math.ceil(usedHeight) };
}

registerVisual("svgGallery", {
  title: "SVG Wall",
  description: "Browse local artwork with lightweight previews and infinite scrolling.",
  params: [
    { key: "gallery.tileSize", type: "number", default: 220, min: 140, max: 360, step: 10, label: "Tile size", category: "Gallery" }
  ],

  create: ({ mountEl }, state) => {
    clearEl(mountEl);

    const app = document.createElement("div");
    app.className = "svgGallery";

    const statusEl = document.createElement("div");
    statusEl.className = "svgGallery__status";

    const grid = document.createElement("div");
    grid.className = "svgGallery__grid";

    const packingSurface = document.createElement("div");
    packingSurface.className = "svgGallery__packingSurface";
    grid.appendChild(packingSurface);

    const scrollHint = document.createElement("div");
    scrollHint.className = "svgGallery__scrollHint";
    scrollHint.setAttribute("aria-hidden", "true");

    const lightbox = document.createElement("div");
    lightbox.className = "svgGallery__lightbox";
    lightbox.setAttribute("aria-hidden", "true");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("inert", "");

    const lightboxInner = document.createElement("div");
    lightboxInner.className = "svgGallery__lightboxInner";

    const lightboxImg = document.createElement("img");
    lightboxImg.alt = "";
    lightboxImg.decoding = "async";

    const lightboxMedia = document.createElement("div");
    lightboxMedia.className = "svgGallery__lightboxMedia";
    const lightboxImageLoader = bindImageLoading(lightboxMedia, lightboxImg);

    const lightboxPan = document.createElement("div");
    lightboxPan.className = "svgGallery__lightboxPan";

    const lightboxControls = document.createElement("div");
    lightboxControls.className = "svgGallery__lightboxControls";

    const lightboxZoomOut = document.createElement("button");
    lightboxZoomOut.type = "button";
    lightboxZoomOut.className = "svgGallery__lightboxZoom";
    lightboxZoomOut.textContent = "-";

    const lightboxZoomLabel = document.createElement("span");
    lightboxZoomLabel.className = "svgGallery__lightboxZoomLabel";
    lightboxZoomLabel.textContent = "100%";

    const lightboxZoomSlider = document.createElement("input");
    lightboxZoomSlider.type = "range";
    lightboxZoomSlider.min = String(MIN_ZOOM);
    lightboxZoomSlider.max = String(MAX_ZOOM);
    lightboxZoomSlider.step = "0.05";
    lightboxZoomSlider.value = "1";
    lightboxZoomSlider.className = "svgGallery__lightboxZoomSlider";

    const lightboxZoomIn = document.createElement("button");
    lightboxZoomIn.type = "button";
    lightboxZoomIn.className = "svgGallery__lightboxZoom";
    lightboxZoomIn.textContent = "+";

    const lightboxRotate = document.createElement("button");
    lightboxRotate.type = "button";
    lightboxRotate.className = "svgGallery__lightboxRotate";
    lightboxRotate.textContent = "Rotate 90°";
    lightboxRotate.setAttribute("aria-label", "Rotate expanded image by 90 degrees");

    const lightboxClose = document.createElement("button");
    lightboxClose.type = "button";
    lightboxClose.className = "svgGallery__lightboxClose";
    lightboxClose.textContent = "X";
    lightboxClose.setAttribute("aria-label", "Close expanded artwork and return to the art bubbles");

    lightboxControls.appendChild(lightboxZoomOut);
    lightboxControls.appendChild(lightboxZoomLabel);
    lightboxControls.appendChild(lightboxZoomSlider);
    lightboxControls.appendChild(lightboxZoomIn);
    lightboxControls.appendChild(lightboxRotate);

    lightboxPan.appendChild(lightboxImg);
    lightboxMedia.appendChild(lightboxPan);
    lightboxInner.appendChild(lightboxMedia);
    lightboxInner.appendChild(lightboxControls);
    lightboxInner.appendChild(lightboxClose);
    lightbox.appendChild(lightboxInner);

    app.appendChild(statusEl);
    app.appendChild(grid);
    app.appendChild(scrollHint);
    app.appendChild(lightbox);
    mountEl.appendChild(app);

    let allItems = [];
    let catalog;
    const rotationCache = loadRotationCache();

    let offset = 0;
    let loading = false;
    let hasMore = true;
    let lightboxZoom = 1;
    let lightboxPanX = 0;
    let lightboxPanY = 0;
    let lightboxFit = { width: 0, height: 0 };
    let lightboxRotation = 0;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panOriginX = 0;
    let panOriginY = 0;
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    let zoomDirection = 1;
    let lastFocusedEl = null;
    let activeLightboxItem = null;
    let hasUserScrolled = false;
    let renderedNames = new Set();
    let resizeFrame = 0;

    const tileCache = new Map();
    // const emptyState = document.createElement("div");
    // emptyState.className = "svgGallery__empty";
    // emptyState.textContent = "No assets loaded.";


    const setStatus = (text) => {
      statusEl.textContent = text;
    };

    const setTileSize = (value) => {
      document.documentElement.style.setProperty("--svgGalleryTile", `${value}px`);
    };

    const layoutBubbles = () => {
      const width = packingSurface.clientWidth || grid.clientWidth;
      const viewportHeight = grid.clientHeight;
      if (!width || !viewportHeight) return;

      const largeDiameter = (state.gallery?.tileSize ?? 220) + 72;
      const layout = packArtBubbles(allItems, width, viewportHeight, largeDiameter);
      packingSurface.style.height = `${layout.height}px`;

      layout.circles.forEach((circle, index) => {
        const item = allItems[index];
        const tile = item ? tileCache.get(item.name) : null;
        if (!tile) return;

        const diameter = circle.r * 2;
        tile.card.dataset.bubbleSize = circle.size;
        tile.card.style.setProperty("--bubble-left", `${circle.x - circle.r}px`);
        tile.card.style.setProperty("--bubble-top", `${circle.y - circle.r}px`);
        tile.card.style.setProperty("--bubble-diameter", `${diameter}px`);
        tile.card.style.setProperty("--bubble-inner-diameter", `${diameter * 0.75}px`);
      });
    };

    const updateScrollHint = () => {
      // const canScroll = grid.scrollHeight > grid.clientHeight + 2;
      // const shouldShow = !hasUserScrolled && hasMore && canScroll;
      // scrollHint.classList.toggle("is-visible", shouldShow);
    };

    const getTile = (item) => {
      const cached = tileCache.get(item.name);
      if (cached) return cached;

      const card = document.createElement("article");
      card.className = "svgGallery__tile";

      const media = document.createElement("button");
      media.type = "button";
      media.className = "svgGallery__thumb";

      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.width = item.previewWidth;
      img.height = item.previewHeight;
      const imageLoader = bindImageLoading(media, img);

      const meta = document.createElement("div");
      meta.className = "svgGallery__meta";

      const name = document.createElement("span");
      name.className = "svgGallery__name";

      media.addEventListener("click", () => {
        lastFocusedEl = document.activeElement;
        activeLightboxItem = item;
        lightboxImageLoader.setSource(item.originalUrl);
        lightboxImg.alt = item.name;
        lightboxRotation = item.rotation;
        lightboxPan.style.setProperty("--rotation", `${item.rotation}deg`);
        lightboxZoom = 1;
        zoomDirection = 1;
        lightboxPanX = 0;
        lightboxPanY = 0;
        lightboxZoomSlider.value = "1";
        lightboxPan.style.setProperty("--zoom", `${lightboxZoom}`);
        lightboxPan.style.setProperty("--pan-x", "0px");
        lightboxPan.style.setProperty("--pan-y", "0px");
        lightboxZoomLabel.textContent = "100%";
        lightbox.classList.add("is-open");
        lightbox.setAttribute("aria-hidden", "false");
        lightbox.removeAttribute("inert");

        requestAnimationFrame(() => {
          updateLightboxFit();
          clampPan();
          lightboxPan.style.setProperty("--pan-x", `${lightboxPanX}px`);
          lightboxPan.style.setProperty("--pan-y", `${lightboxPanY}px`);
        });
      });

      media.appendChild(img);
      meta.appendChild(name);
      card.appendChild(media);
      card.appendChild(meta);

      const entry = { card, media, img, name, imageLoader };
      tileCache.set(item.name, entry);
      return entry;
    };

    const animateNewTile = (card) => {
  card.classList.remove("is-new");
  requestAnimationFrame(() => card.classList.add("is-new"));
  card.addEventListener(
    "animationend",
    () => card.classList.remove("is-new"),
    { once: true }
  );
};

const renderGrid = ({ preserveScroll = false } = {}) => {
  const scrollTop = preserveScroll ? grid.scrollTop : 0;
  const fragment = document.createDocumentFragment();

  if (preserveScroll) {
    // APPEND: only add brand-new tiles
    for (const item of allItems) {
      if (item.rotation == null) item.rotation = rotationCache[item.name] ?? 0;

      const tile = getTile(item);
      tile.img.alt = item.name;
      tile.imageLoader.setSource(item.previewUrl);
      tile.img.style.setProperty("--rotation", `${item.rotation}deg`);
      tile.media.setAttribute("aria-label", `Expand ${item.name}`);
      tile.name.textContent = item.name;

      if (renderedNames.has(item.name)) continue;
      renderedNames.add(item.name);

      //animateNewTile(tile.card);
      fragment.appendChild(tile.card);
    }

    if (fragment.childNodes.length) packingSurface.appendChild(fragment);
    layoutBubbles();
    grid.scrollTop = scrollTop;
    return;
  }

  // REBUILD: render ALL tiles (important: don't use grid.contains gating)
  renderedNames = new Set();
  for (const item of allItems) {
    if (item.rotation == null) item.rotation = rotationCache[item.name] ?? 0;

    const tile = getTile(item);
    tile.img.alt = item.name;
    tile.imageLoader.setSource(item.previewUrl);
    tile.img.style.setProperty("--rotation", `${item.rotation}deg`);
    tile.media.setAttribute("aria-label", `Expand ${item.name}`);
    tile.name.textContent = item.name;

    renderedNames.add(item.name);
    fragment.appendChild(tile.card);
  }

  packingSurface.replaceChildren(fragment);
  layoutBubbles();
};


    const closeLightbox = () => {
      const activeEl = document.activeElement;
      if (activeEl && lightbox.contains(activeEl)) {
        if (lastFocusedEl && document.contains(lastFocusedEl)) {
          lastFocusedEl.focus();
        } else {
          grid.focus();
        }
      }
      lightbox.classList.remove("is-open");
      lightbox.setAttribute("aria-hidden", "true");
      lightbox.setAttribute("inert", "");
      lightboxImageLoader.clear();
      lightboxImg.alt = "";
      activeLightboxItem = null;
    };

    const updateLightboxFit = () => {
      const rect = lightboxMedia.getBoundingClientRect();
      const naturalWidth = lightboxImg.naturalWidth || rect.width || 1;
      const naturalHeight = lightboxImg.naturalHeight || rect.height || 1;
      const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
      lightboxFit = {
        width: naturalWidth * scale,
        height: naturalHeight * scale
      };
      lightboxPan.style.setProperty("--fit-width", `${lightboxFit.width}px`);
      lightboxPan.style.setProperty("--fit-height", `${lightboxFit.height}px`);
    };

    const clampPan = () => {
      // const rect = lightboxMedia.getBoundingClientRect();
      // const maxX = Math.max(0, (lightboxFit.width * lightboxZoom - rect.width) / 2);
      // const maxY = Math.max(0, (lightboxFit.height * lightboxZoom - rect.height) / 2);
      // lightboxPanX = Math.min(maxX, Math.max(-maxX, lightboxPanX));
      // lightboxPanY = Math.min(maxY, Math.max(-maxY, lightboxPanY));
    };

    const clampZoom = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

    const getFitZoom = () => {
      const rect = lightboxMedia.getBoundingClientRect();
      const radians = (lightboxRotation * Math.PI) / 180;
      const absCos = Math.abs(Math.cos(radians));
      const absSin = Math.abs(Math.sin(radians));
      const baseWidth = lightboxFit.width || rect.width || 1;
      const baseHeight = lightboxFit.height || rect.height || 1;
      const rotatedWidth = baseWidth * absCos + baseHeight * absSin;
      const rotatedHeight = baseWidth * absSin + baseHeight * absCos;
      const fitScale = Math.min(rect.width / rotatedWidth, rect.height / rotatedHeight, 1);
      return clampZoom(fitScale);
    };

    const setLightboxZoom = (value) => {
      lightboxZoom = clampZoom(value);
      lightboxZoomSlider.value = String(lightboxZoom);
      clampPan();
      lightboxPan.style.setProperty("--zoom", `${lightboxZoom}`);
      lightboxPan.style.setProperty("--pan-x", `${lightboxPanX}px`);
      lightboxPan.style.setProperty("--pan-y", `${lightboxPanY}px`);
      lightboxZoomLabel.textContent = `${Math.round(lightboxZoom * 100)}%`;
    };

    const toggleLightboxZoom = () => {
      const zoomEpsilon = 0.02;
      const fitZoom = getFitZoom();
      const zoomedInTarget = clampZoom(Math.max(fitZoom + 1, fitZoom * 2));

      if (lightboxZoom > fitZoom + zoomEpsilon) {
        setLightboxZoom(fitZoom);
        zoomDirection = -1;
        return;
      }

      setLightboxZoom(zoomedInTarget);
      zoomDirection = 1;
    };

    lightboxZoomIn.addEventListener("click", () => {
      setLightboxZoom(lightboxZoom + 0.2);
    });

    lightboxZoomOut.addEventListener("click", () => {
      setLightboxZoom(lightboxZoom - 0.2);
    });

    lightboxRotate.addEventListener("click", () => {
      if (!activeLightboxItem) return;

      activeLightboxItem.rotation = (activeLightboxItem.rotation + 90) % 360;
      lightboxRotation = activeLightboxItem.rotation;
      lightboxPan.style.setProperty("--rotation", `${lightboxRotation}deg`);

      const tile = tileCache.get(activeLightboxItem.name);
      tile?.img.style.setProperty("--rotation", `${lightboxRotation}deg`);
      rotationCache[activeLightboxItem.name] = lightboxRotation;
      saveRotationCache(rotationCache);

      lightboxPanX = 0;
      lightboxPanY = 0;
      setLightboxZoom(getFitZoom());
    });

    lightboxZoomSlider.addEventListener("input", () => {
      setLightboxZoom(Number(lightboxZoomSlider.value));
    });

    lightboxInner.addEventListener("wheel", (event) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      setLightboxZoom(lightboxZoom + delta);
    }, { passive: false });

    lightboxImg.addEventListener("load", () => {
      updateLightboxFit();
      lightboxPanX = 0;
      lightboxPanY = 0;
      zoomDirection = 1;
      setLightboxZoom(getFitZoom());
      clampPan();
      lightboxPan.style.setProperty("--pan-x", `${lightboxPanX}px`);
      lightboxPan.style.setProperty("--pan-y", `${lightboxPanY}px`);
    });

    lightboxMedia.addEventListener("pointerdown", (event) => {
      if (!lightbox.classList.contains("is-open")) return;
      isPanning = true;
      panStartX = event.clientX;
      panStartY = event.clientY;
      panOriginX = lightboxPanX;
      panOriginY = lightboxPanY;
      lightboxMedia.setPointerCapture(event.pointerId);
    });

    lightboxMedia.addEventListener("pointermove", (event) => {
      if (!isPanning) return;
      const dx = event.clientX - panStartX;
      const dy = event.clientY - panStartY;
      lightboxPanX = panOriginX + dx;
      lightboxPanY = panOriginY + dy;
      clampPan();
      lightboxPan.style.setProperty("--pan-x", `${lightboxPanX}px`);
      lightboxPan.style.setProperty("--pan-y", `${lightboxPanY}px`);
    });

    lightboxMedia.addEventListener("pointerup", () => {
      isPanning = false;
    });

    lightboxMedia.addEventListener("pointercancel", () => {
      isPanning = false;
    });

    lightboxMedia.addEventListener("pointerup", (event) => {
      if (!lightbox.classList.contains("is-open")) return;
      if (event.pointerType !== "touch") return;
      const now = Date.now();
      const timeDelta = now - lastTapTime;
      const dx = event.clientX - lastTapX;
      const dy = event.clientY - lastTapY;
      const distance = Math.hypot(dx, dy);
      if (timeDelta > 0 && timeDelta < 320 && distance < 24) {
        lastTapTime = 0;
        toggleLightboxZoom();
        return;
      }
      lastTapTime = now;
      lastTapX = event.clientX;
      lastTapY = event.clientY;
    });

    lightboxMedia.addEventListener("dblclick", (event) => {
      if (!lightbox.classList.contains("is-open")) return;
      event.preventDefault();
      toggleLightboxZoom();
    });

    window.addEventListener("resize", () => {
      if (!lightbox.classList.contains("is-open")) return;
      updateLightboxFit();
      clampPan();
      lightboxPan.style.setProperty("--pan-x", `${lightboxPanX}px`);
      lightboxPan.style.setProperty("--pan-y", `${lightboxPanY}px`);
    });

    window.addEventListener("resize", () => {
      updateScrollHint();
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        layoutBubbles();
        maybeLoadMore();
      });
    });

    lightboxClose.addEventListener("click", closeLightbox);
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) closeLightbox();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeLightbox();
    });

    const maybeLoadMore = () => {
      if (loading || !hasMore) return;
      if (grid.scrollHeight <= grid.clientHeight + 2) {
        loadNextPage();
      }
    };

    const loadNextPage = async () => {
      if (loading || !hasMore) return;

      loading = true;
      setStatus("Loading...");

      try {
        catalog ??= randomizeArtCatalog(await loadArtCatalog());
        const page = catalog.slice(offset, offset + PAGE_SIZE);
        if (!page.length) {
          hasMore = false;
          setStatus("All assets loaded");
          updateScrollHint();
          return;
        }

        const newItems = page.map((item) => ({
          ...item,
          rotation: rotationCache[item.name] ?? 0
        }));

        offset += page.length;
        hasMore = offset < catalog.length;
        allItems.push(...newItems);

        renderGrid({ preserveScroll: true });
        setStatus(hasMore ? `${allItems.length} loaded` : "All assets loaded");
        requestAnimationFrame(maybeLoadMore);

      } catch (err) {
        console.error(err);
        setStatus("Load failed");
      } finally {
        loading = false;
      }
    };

    // Infinite scroll trigger
    grid.addEventListener("scroll", () => {
      const threshold = 150;

      if (!hasUserScrolled && grid.scrollTop > 0) {
        hasUserScrolled = true;
        updateScrollHint();
      }

      if (
        grid.scrollTop + grid.clientHeight >=
        grid.scrollHeight - threshold
      ) {
        loadNextPage();
      }
    });

    setTileSize(state.gallery?.tileSize ?? 220);

    // Initial page
    loadNextPage();

    return {
      render: () => {
        setTileSize(state.gallery?.tileSize ?? 220);
        layoutBubbles();
      }
    };
  }
});
