# Apps and saved SVG studies

Open `/Apps/` through a static web server. It opens the saved SVG studies by default. The selector beside search switches between **SVG studies** and **All apps**, with the app list available directly at `/Apps/?view=apps`. Browser Back and Forward restore the selected view; the header Apps link always returns to the studies.

`studies.js` fetches the small `studies/catalog.json` index, mounts 20 cards at a time, and requests compressed WebP thumbnails only near the viewport, with at most two concurrent image loads. Each thumbnail is at most 48 KiB and 480 pixels on its long edge. Original SVGs and saved settings are fetched only when requested; browsing starts no live simulations. A bubble or title opens its source app paused with `/Apps/studies/settings/<slug>.json`, applies the saved flow automatically, and restores it after native redraws or resize; SVG and settings downloads remain available on each card. Shared fuzzy search covers titles, apps, concepts and tags; filters narrow by type, color, batch and app. Sort by complexity (simplest or most complex first) uses the visible SVG element count across all filtered results before pagination. Default / relevance restores search ranking.

`/Apps/algebra/` contains the formal notes and seven-stage interactive walkthrough. It loads only the selected high-resolution stage WebP (1600-2048 pixels, at most 400 KiB), requests high-resolution comparison previews near the viewport, and creates a paused live simulation only after the Open this simulation button is selected. Close simulation releases that instance. The gallery continues to use its smaller 480px thumbnails. The notes are also available as `studies/FLOW-ALGEBRA.md`. The algebraCOEF section adds 24 coefficient studies and a measured order comparison; `/Apps/?collection=algebraCOEF` opens that series directly, and `studies/ALGEBRA-COEF.md` defines the coefficients and repeated operations.

Only the runtime SVG, compressed WebP, JSON, Markdown and viewer code belong to the public collection. Contact sheets, PNG previews, provenance records, export tools, validation reports and archives are stored under ignored `.local/abstract-studies/`. See [the asset layout](studies/README.md).

The **All apps** list includes only apps registered in either gallery:

- `/projects.json` — main page; round previews.
- `/MathVisuals/projects.json` — math page; square previews.

The main page, math page, and Apps all load these files at runtime through `helper/galleryRegistry.js`. Add or remove an entry in the appropriate registration file to update both its gallery and Apps. The All apps list has no generated catalog or build step; saved SVG studies use their separate static metadata catalog.

Each entry needs `title`, `description`, `image`, and `link`. `infoTitle` optionally supplies the full app title when the bubble label is shorter. Descriptions contain the app's info text; thumbnail and app paths resolve relative to their registration file. Existing display options such as `size` and `imageFit` still work on the main page.

Main-page bubbles can mix `innerShape` and `outerShape` independently (`circle`, `square`, `diamond`, or `triangle`), with `shape` as the shared fallback. Math Visuals uses a diamond inner shape and a circular outer path. These bubble settings do not change the Apps list's round main previews or square math previews.

Set optional `isApp` to `false` on routing or functional bubbles to exclude them from the Apps viewer while keeping them in their bubble gallery. Omitted `isApp` defaults to `true` in either JSON registration. The Main, Math, and Art links provide direct access to the galleries.

Apps combines and sorts both registrations. Duplicate app URLs appear once; if an app is in both galleries, its math registration supplies the square preview. Apps absent from both registrations are excluded.

`viewer.js` supplies the normal directory for `/Apps/?view=apps` and the mobile main and math landing pages. Its selector can also open the SVG studies. The former mobile cards preference now opens this viewer. Bubbles remains available, and a saved bubbles preference is preserved. The header Apps link opens `/Apps/` on mobile and desktop.

Routing stays in the header: Main shows Math and Apps, Math shows Main and Apps, and Apps shows Main and Math. Each header also links to Art. Only the `/Apps/` header stays pinned while scrolling.

Main, Math, and Apps use `helper/galleryFooter.js` for LinkedIn, Support, and the rounded theme toggle. `helper/galleryTheme.js` follows the system light/dark preference until the user explicitly selects a theme, then saves that override across pages. Art shares that theme without a footer bar and links to Main, Math, and Apps in its header. Headers keep an 18px edge inset at all widths, expanding only for device safe areas.

All four page heads apply the saved/system theme synchronously before styles load,
so the initial page background and browser color scheme match the selected theme.
Keep this small inline bootstrap in sync with `helper/galleryTheme.js`; the shared
module handles the footer toggle and later system/storage changes.

`directory.js` mounts 20 entries initially and appends the next 20 when entry 10, 30, 50, etc. enters view. Images load lazily. Scroll-position checks handle large jumps and browsers without IntersectionObserver; Load more also works from the keyboard.

The search field filters the complete catalog, including apps not yet displayed. `search.js` matches title and description words with prefix completion and typo tolerance. Results rank by query-word coverage, then match quality and title relevance; ties retain catalog order. Clearing search restores the full list. Filtered results keep the same incremental loading. Run search checks with `node --test tests/app-search.mjs`.


## Verification

Run `node --experimental-default-type=module --test tests/app-search.mjs tests/svg-study-assets.mjs` for catalog and search checks. `tests/linked-settings.mjs` tests source settings loading and paused startup; `tests/source-tool-flows.mjs` checks automatic flow restoration and observer stability. Both require jsdom (`JSDOM_MODULE` can point to an existing installation).

`node --experimental-default-type=module tests/apps-studies-browser.mjs` checks the permanent routes in an isolated browser. It accepts `PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE`, and uses the local D3 and math dependency copies in `.cache/abstract-export-deps/`. Screenshots and the browser validation report go into ignored `.local/abstract-studies/verification/`.

`tests/linked-study-playback.mjs` checks paused startup and the visible applied flow in every represented native app, including after resize. It uses the same browser environment variables and writes its report to the ignored verification folder.

The algebraCOEF Wild extension adds 17 studies on 17 other apps, exactly one per app. Open `/Apps/?collection=algebraCOEF&search=wild` for this batch. Native Effects now support logarithmic echo spacing, explicit tension extrapolation, and spline vector angle offsets; the extended definitions are in `studies/ALGEBRA-COEF-WILD.md`.
