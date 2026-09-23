# Apps directory

Open `/Apps/` through a static web server. Apps lists only the apps registered in either gallery:

- `/projects.json` — main page; round previews.
- `/MathVisuals/projects.json` — math page; square previews.

The main page, math page, and Apps all load these files at runtime through `helper/galleryRegistry.js`. Add or remove an entry in the appropriate registration file to update both its gallery and Apps. There is no generated catalog or build step.

Each entry needs `title`, `description`, `image`, and `link`. `infoTitle` optionally supplies the full app title when the bubble label is shorter. Descriptions contain the app's info text; thumbnail and app paths resolve relative to their registration file. Existing display options such as `size` and `imageFit` still work on the main page.

Main-page bubbles can mix `innerShape` and `outerShape` independently (`circle`, `square`, `diamond`, or `triangle`), with `shape` as the shared fallback. Math Visuals uses a diamond inner shape and a circular outer path. These bubble settings do not change the Apps list's round main previews or square math previews.

Set optional `isApp` to `false` on routing or functional bubbles to exclude them from the Apps viewer while keeping them in their bubble gallery. Omitted `isApp` defaults to `true` in either JSON registration. The Main, Math, and Art links provide direct access to the galleries.

Apps combines and sorts both registrations. Duplicate app URLs appear once; if an app is in both galleries, its math registration supplies the square preview. Apps absent from both registrations are excluded.

`viewer.js` supplies the same directory for `/Apps/` and the mobile main and math landing pages. The former mobile cards preference now opens this viewer. Bubbles remains available, and a saved bubbles preference is preserved. The header Apps link opens `/Apps/` on mobile and desktop.

Routing stays in the header: Main shows Math and Apps, Math shows Main and Apps, and Apps shows Main and Math. Each header also links to Art. Only the `/Apps/` header stays pinned while scrolling.

Main, Math, and Apps use `helper/galleryFooter.js` for LinkedIn, Support, and the rounded theme toggle. `helper/galleryTheme.js` follows the system light/dark preference until the user explicitly selects a theme, then saves that override across pages. Art shares that theme without a footer bar and links to Main, Math, and Apps in its header. Headers keep an 18px edge inset at all widths, expanding only for device safe areas.

All four page heads apply the saved/system theme synchronously before styles load,
so the initial page background and browser color scheme match the selected theme.
Keep this small inline bootstrap in sync with `helper/galleryTheme.js`; the shared
module handles the footer toggle and later system/storage changes.

`directory.js` mounts 20 entries initially and appends the next 20 when entry 10, 30, 50, etc. enters view. Images load lazily. Scroll-position checks handle large jumps and browsers without IntersectionObserver; Load more also works from the keyboard.

The search field filters the complete catalog, including apps not yet displayed. `search.js` matches title and description words with prefix completion and typo tolerance. Results rank by query-word coverage, then match quality and title relevance; ties retain catalog order. Clearing search restores the full list. Filtered results keep the same incremental loading. Run search checks with `node --test tests/app-search.mjs`.
