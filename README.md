# Reside Here

A fresh website for `rentandresidehere.net`, built from an empty worktree on the isolated `rentandresidehere.net` branch. The original repository's working files remain in their original worktree.

## Local preview

Use Node.js 20 or newer. No dependencies or install step are required.

```sh
npm start
```

Open <http://127.0.0.1:4173>. Set `PORT` to use another local port. `npm run dev` starts the same server; `npm run check` checks JavaScript syntax.

The preview server binds to the loopback address and serves only the website assets. Deploy the three HTML pages, both stylesheets, browser script, and favicon through your preferred static host when ready. The local preview also maps `/about.htm` to the rental guide and `/rental_floorplans.htm` to the floor plans page; configure equivalent aliases on your host if you want to retain those older paths.

## Content and editing

- `index.html`: page content, communities, and links.
- `styles.css`: colors, typography, responsive layout, and illustrated image placeholders.
- `app.js`: location filtering, home finder, and accessible mobile navigation.
- `rental-guide.html`: a short application guide with current-listing and team contact links.
- `floor-plans.html`: three apartment options with clearly labeled layout placeholders.
- `resources.css`: shared styling for the two supporting pages.

Content and the core color direction are based on [the existing Reside Here website](https://rentandresidehere.net/). Images are intentional placeholders, ready to replace with real community and home photography.

The existing destinations were checked during the redesign: [available rentals](https://residehere.appfolio.com/listings/), [resident and maintenance portal](https://residehere.appfolio.com/connect/users/sign_in), [rental criteria](https://rentandresidehere.net/about.htm), and [floor plans](https://rentandresidehere.net/rental_floorplans.htm). Contact details are 618-235-8400 and rent@residehere.net.

Availability and applications continue through the existing rental portal. The home finder filters this page's community cards; it does not query live vacancies.
