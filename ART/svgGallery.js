import { registerVisual } from "../helper/visualHelp.js";

const API_BASE = "https://contentmanager.jakerley180.workers.dev";
const PAGE_SIZE = 20;
const ROTATION_CACHE_KEY = "svgGallery.rotation.v1";
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;

function clearEl(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
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

registerVisual("svgGallery", {
  title: "SVG Wall",
  description: "Browse indexed CDN assets with infinite scrolling.",
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

    const scrollHint = document.createElement("div");
    scrollHint.className = "svgGallery__scrollHint";
    scrollHint.setAttribute("aria-hidden", "true");

    const lightbox = document.createElement("div");
    lightbox.className = "svgGallery__lightbox";
    lightbox.setAttribute("aria-hidden", "true");

    const lightboxInner = document.createElement("div");
    lightboxInner.className = "svgGallery__lightboxInner";

    const lightboxImg = document.createElement("img");
    lightboxImg.alt = "";

    const lightboxMedia = document.createElement("div");
    lightboxMedia.className = "svgGallery__lightboxMedia";

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

    const lightboxClose = document.createElement("button");
    lightboxClose.type = "button";
    lightboxClose.className = "svgGallery__lightboxClose";
    lightboxClose.textContent = "Close";

    lightboxControls.appendChild(lightboxZoomOut);
    lightboxControls.appendChild(lightboxZoomLabel);
    lightboxControls.appendChild(lightboxZoomSlider);
    lightboxControls.appendChild(lightboxZoomIn);

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
    let hasUserScrolled = false;
    let renderedNames = new Set();

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

      const media = document.createElement("div");
      media.className = "svgGallery__thumb";

      const img = document.createElement("img");
      img.loading = "lazy";

      const meta = document.createElement("div");
      meta.className = "svgGallery__meta";

      const name = document.createElement("span");
      name.className = "svgGallery__name";

      const actions = document.createElement("div");
      actions.className = "svgGallery__actions";

      const orientation = document.createElement("span");
      orientation.className = "svgGallery__orientation";

      const rotateBtn = document.createElement("button");
      rotateBtn.type = "button";
      rotateBtn.className = "svgGallery__rotateBtn";
      rotateBtn.textContent = "Rotate 90";
      rotateBtn.setAttribute("aria-label", "Rotate image by 90 degrees");
      rotateBtn.addEventListener("click", (event) => {
        event.preventDefault();
        item.rotation = (item.rotation + 90) % 360;
        orientation.textContent = `${item.rotation}deg`;
        img.style.setProperty("--rotation", `${item.rotation}deg`);
        rotationCache[item.name] = item.rotation;
        saveRotationCache(rotationCache);
      });

      media.addEventListener("click", () => {
        lastFocusedEl = document.activeElement;
        lightboxImg.src = item.url;
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
      actions.appendChild(orientation);
      actions.appendChild(rotateBtn);
      meta.appendChild(name);
      meta.appendChild(actions);
      card.appendChild(media);
      card.appendChild(meta);

      const entry = { card, img, name, orientation };
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
      tile.img.src = item.url;
      tile.img.style.setProperty("--rotation", `${item.rotation}deg`);
      tile.name.textContent = item.name;
      tile.orientation.textContent = `${item.rotation}deg`;

      if (renderedNames.has(item.name)) continue;
      renderedNames.add(item.name);

      //animateNewTile(tile.card);
      fragment.appendChild(tile.card);
    }

    if (fragment.childNodes.length) grid.appendChild(fragment);
    grid.scrollTop = scrollTop;
    return;
  }

  // REBUILD: render ALL tiles (important: don't use grid.contains gating)
  renderedNames = new Set();
  for (const item of allItems) {
    if (item.rotation == null) item.rotation = rotationCache[item.name] ?? 0;

    const tile = getTile(item);
    tile.img.alt = item.name;
    tile.img.src = item.url;
    tile.img.style.setProperty("--rotation", `${item.rotation}deg`);
    tile.name.textContent = item.name;
    tile.orientation.textContent = `${item.rotation}deg`;

    renderedNames.add(item.name);
    fragment.appendChild(tile.card);
  }

  grid.replaceChildren(fragment);
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
      //lightbox.setAttribute("aria-hidden", "true");
      lightbox.setAttribute("inert", "");
      lightboxImg.src = "";
      lightboxImg.alt = "";
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
      requestAnimationFrame(maybeLoadMore);
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
        const res = await fetch(
          `${API_BASE}/assets?offset=${offset}&limit=${PAGE_SIZE}`
        );

        if (!res.ok) throw new Error("Page fetch failed");

        const data = await res.json();

        if (!data.keys.length) {
          hasMore = false;
          setStatus("All assets loaded");
          updateScrollHint();
          return;
        }

        const newItems = data.keys.map((name) => ({
          name,
          url: `${API_BASE}/cdn/${encodeURIComponent(name)}`,
          rotation: rotationCache[name] ?? 0
        }));

        offset += data.keys.length;
        allItems.push(...newItems);

        renderGrid({ preserveScroll: true });
        setStatus(`${allItems.length} loaded`);
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
      }
    };
  }
});
