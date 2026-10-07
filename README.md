# Reside Here

A fresh website for `rentandresidehere.net`, developed on the `rentandresidehere.net` branch. The repository root contains this site.

## Local preview

Use Node.js 20 or newer. No dependencies or install step are required.

```sh
npm start
```

Open <http://127.0.0.1:4173>. Set `PORT` to use another local port. `npm run dev` starts the same server; `npm run check` checks JavaScript syntax and verifies that the generated pages match the data.

The preview server binds to the loopback address and serves only the website assets. Deploy the three generated HTML pages, `fonts.css`, `styles.css`, `resources.css`, `navigation.css`, `accessibility.css`, `property-gallery.css`, `app.js`, `accessibility.js`, `property-gallery.js`, `LICENSE.txt`, and the `assets` folder through your preferred static host when ready. The local preview also maps `/about.htm` to the rental guide and `/rental_floorplans.htm` to the floor plans page; configure equivalent aliases on your host if you want to retain those older paths.

## Edit properties and rebuild

Edit **`data/properties.json`**, then run:

```sh
npm run build
```

The equivalent utility command is `node scripts/build-site.mjs`. It regenerates `index.html`, `floor-plans.html`, and `rental-guide.html` from the JSON and the page shells in `templates/`. No npm install is needed to build. Generated pages contain their content directly and work on an ordinary static host without fetching JSON in the browser. Avoid editing the generated HTML; those changes are overwritten by the next build.

The JSON contains:

- `properties`: the ordered property list. Each record has a unique lowercase `id`, `name`, `descriptions`, `links`, `photos`, and `floorPlans`. Each photo stays associated with its property in the homepage slider; the same property ID connects the slider, overview links, rental information, and floor plans.
- `home`: the owner-managed message, maintenance message, gallery labels, and overview text. `home.overview.wellMaintained` controls the Well-Maintained Rentals heading and paragraphs. Its property links are generated from the property records, so there is no second list of names to maintain.
- `rentalInfo`: the rental information heading, introduction, floor-plan note, and contact block.
- `links`: shared rental-search, tenant-login, rental-criteria, rental-info, and contact destinations.

To add a property, copy a record, give it a unique `id`, and update its text, links, and images. To remove a property everywhere, delete its record or set `active` to `false`. Set `showInOverview` to `false` to omit it only from the Well-Maintained Rentals list. Array order controls property order and photo order. Empty `photos` or `floorPlans` arrays are supported; no missing-image placeholders are generated.

Keep image and PDF files under `assets/properties/<property-id>/` with lowercase filenames. Images use `src`, meaningful `alt` text, and their actual pixel `width` and `height`. A photo with `showInGallery: false` is omitted from the homepage slider; for properties without floor plans, it serves as the rental-info overview photo. Floor plans additionally use `label`, a text `description` of the layout, and an optional `href` to the original PDF or full image. `sourceUrl` records where an existing asset came from; visitors load the local copy. The build checks missing assets, duplicate IDs, required fields, and link schemes before writing any pages. Text is escaped as text, not treated as HTML.

Run `npm run build:check` to detect stale generated files without changing them. After a successful build, refresh the preview. New property images are served automatically; the preview server does not need a code change for each new asset.

## Files

- `index.html`: original owner-managed and emergency-maintenance copy, rental overview, contact details, and direct links.
- `styles.css`: colors, typography, and responsive layout.
- `fonts.css` and `assets/fonts/`: locally hosted WOFF2 fonts, source details, and redistribution licenses.
- `app.js` and `navigation.css`: the mobile navigation disclosure, same-page keyboard focus, and the footer year.
- `rental-guide.html`: the original rental terms, criteria, and application instructions.
- `floor-plans.html`: generated property information, actual floor-plan previews, original PDF links, and a maintenance-request link.
- `property-gallery.js` and `property-gallery.css`: the homepage photo slider and its controls.
- `resources.css`: shared styling for the two supporting pages.
- `accessibility.js` and `accessibility.css`: shared accessibility preferences and adaptable layouts.
- `assets/resideHereLogoSmaller.png`: the chair logo beside the site name; `assets/chairsimpler.png`: the 1254 by 1254 browser tab icon.

## Accessibility

The Accessibility button at the top and bottom of each page opens a keyboard-accessible dialog. Visitors can choose 100–200% text, high-contrast light or dark colors, underlined links, automatic / site fonts / Atkinson Hyperlegible / system sans serif, default / relaxed / roomy line spacing, heavier text, wider text spacing, and reduced motion. Font alternatives replace both headings and body text. The font and reading-line-spacing selectors are the final controls in the panel. Automatic mode uses the device system font at mobile widths (up to 900px) and the site fonts on larger screens. Saved manual choices take precedence; resetting returns to Automatic. The browser selects the system font through CSS `system-ui`; websites cannot inspect every operating-system font customization. Changes apply immediately and are remembered on this browser for all three pages. Existing simple-reading-font preferences migrate to system sans serif. Reset restores the site defaults. Browser storage failures do not prevent changes on the current page.

The default typography pairs **Fraunces** for warm, expressive headings with **Nunito Sans** for body text and controls. Fraunces uses medium weight, optical sizing, softness 50, and its wonky forms; display details stay in headings. Reading paragraphs use comfortable line lengths and scalable sizes. This pairing follows the Google Fonts [choosing checklist](https://fonts.google.com/knowledge/choosing_type/a_checklist_for_choosing_type), [web-font guide](https://fonts.google.com/knowledge/choosing_type/choosing_web_fonts_beginners_guide), and [pairing guidance](https://fonts.google.com/knowledge/choosing_type/pairing_typefaces). Atkinson Hyperlegible offers a choice with distinct letterforms; no font is presented as universally accessible.

Fonts are served locally with `font-display: swap`, so pages make no runtime requests to Google Fonts and retain readable system fallbacks. The supplied files cover Latin text and punctuation used by this English-language site; add appropriate subsets if introducing other scripts. Font licenses and download provenance are retained in `assets/fonts/`. Increased text spacing uses 0.12em letter spacing, 0.16em word spacing, at least 1.7 line height, and 2em paragraph spacing; independently selected line spacing remains effective.

Screen-reader structure and keyboard support are always available: page landmarks, a skip-to-content link, named controls, visible focus, and accessible dialog controls. Mobile navigation shows the home logo/title and a Menu button. Rental Search is omitted from the mobile header; Tenant Login, Rental Criteria, Rental Info, and Contact Us are in the dropdown using the [W3C disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation-hybrid/). Escape closes the menu and returns focus; all five links remain visible on desktop. Without JavaScript, the four mobile menu links remain in normal document flow. Browser zoom remains available; forced colors and the device’s reduced-motion preference are respected. Settings affect this website; the external rental and resident portals manage their own presentation.

On desktop, the property slider matches each photo's original aspect ratio with no letterboxing. Mobile retains the taller 16:10 frame with `object-fit: contain`. Each complete photo retains its original proportions without zooming, cropping, or stretching. Translucent left/right arrows and position dots stay over the visible photo. The property name and Rental Info link stay in a compact caption underneath. Enabling any accessibility preference moves the arrow controls below the image with visible Previous/Next labels and a photo counter; visitors can also select Show slideshow button labels on its own. Screen-reader button names, current-photo announcements, and keyboard support are always available. Inactive slides stay out of the tab order. Without JavaScript, all photos and their property links remain visible. Floor plans have readable previews, image descriptions, text layout summaries, and links to full originals.

Implementation references: [W3C text resizing](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), and [modal dialog keyboard behavior](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Automated checks do not replace manual testing with assistive technologies such as NVDA, JAWS, or VoiceOver.

To run the browser regression checks:

```sh
npm install
npx playwright install chromium
npm test
```

The tests cover JSON edits and property removal, deterministic generation, invalid data, keyboard focus, preferences and storage failures, local font loading and blocked-font fallbacks, legacy font-preference migration, every font at 200% text at mobile widths, all page/color combinations with axe, slider navigation, local media, motion preferences, and no-JavaScript navigation. On Windows, the test runner can also use installed Chrome or Edge. Set `BROWSER_EXECUTABLE` to select a browser, or `A11Y_SCREENSHOTS` to an output folder to save review screenshots. Browser dependencies are for development only; building and serving the website still require no installation.

## License

Copyright (c) 2026 Reside Here LLC. All rights reserved. [LICENSE.txt](LICENSE.txt) permits ordinary website browsing and prohibits AI or machine learning training, fine-tuning, and training dataset creation without prior written permission, subject to applicable law. Third-party dependencies and fonts retain their existing licenses.

## Source content

The lead owner-managed paragraph, rental criteria, and selected property descriptions use the original business copy from [the existing Reside Here website](https://rentandresidehere.net/). Property photos and sample floor plans are saved locally from that site. The homepage leads with owner management and 24 hour emergency maintenance; no separate emergency phone number has been published, so the listed office phone is labeled accordingly.

The existing destinations were checked during the redesign: [available rentals](https://residehere.appfolio.com/listings/), [resident and maintenance portal](https://residehere.appfolio.com/connect/users/sign_in), [rental criteria](https://rentandresidehere.net/about.htm), and [floor plans](https://rentandresidehere.net/rental_floorplans.htm). Contact details are 618-235-8400 and rent@residehere.net.

Rental Search opens the live AppFolio listings directly. Every header and footer provides Rental Search, Rental Criteria, Rental Info, Contact Us, and Tenant Login.

The desktop green top bar shows Accessibility, the office phone number, and Maintenance Request. Mobile shows only Accessibility and the phone number in a single row about 44px tall at default text size. Enlarged reading preferences allow the bar to grow. Maintenance Request opens the existing resident and maintenance portal; the duplicate link beside the homepage search actions is omitted.

The mobile Menu opens a panel that slides over the page without changing the header or content height. Escape, a link selection, an outside click, or focus leaving the navigation closes it. Closed links are immediately inert and hidden from assistive technology while the exit animation finishes. Without JavaScript, all navigation links remain in the page. Reduced-motion preferences disable the slide and fade.

On desktop and mobile, the navigation stays sticky and compacts smoothly once the green top bar scrolls out of view: the chair shrinks, the Apartment & Home Rentals tagline fades away, and the header and navigation links reduce their vertical padding. Returning to the top restores them. Navigation targets remain at least 44px tall. Reduced-motion preferences make these changes immediate; enlarged-reading layouts keep the header in normal document flow so a tall header does not cover the content. The main logo/title links home on every page.
