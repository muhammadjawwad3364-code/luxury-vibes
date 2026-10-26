# Luxury Vibes — Restaurant & Kitchen

Static site, no build step and no dependencies. Open `index.html` in a browser, or upload the whole folder to any static host.

```
index.html          page markup (all sections, icon sprite, search dialog)
css/styles.css      design tokens, components, animations, responsive rules
js/main.js          tabs, sliders, nav drawer, scroll-spy, scroll reveal, search (shared by all pages)
terms.html / privacy.html   legal pages linked from the footer
gallery.html        the Gallery page (nav and footer "Gallery" link here)
css/gallery.css     Gallery page styles
js/gallery.js       bento animations, hover glass, lightbox, parallax
about.html          the About page (nav and footer "About" link here)
css/about.css       About page styles
js/motion.js        page-load/scroll animations and the letter-roll hover (shared by all pages)
reservation.html    the Reservation page (nav "Reservation" and footer "Reservations" link here)
menu.html           the Menu page (nav "Menu", the bag icon and footer "Menu" link here)
css/menu.css        the scroll, sheet and menu typography
js/menu-data.js     the 20 dishes: name, description, price, photo — edit here
js/menu.js          scroll animation (open/close), sound, rendering of the dishes
css/reservation.css Reservation page styles
js/reservation-data.js   booking rules, table map, ReservationService (storage layer)
js/reservation-scene.js  3D guests (Three.js r149 from jsDelivr)
js/reservation.js        hotspots, reservation card, calendar, time picker, booking flow
assets/images/      page images (hero, signature, tradition, tab thumbnails)
assets/images/slider/  three photos per menu category
```

## What's interactive

- **A Celebration of Spice**: three tabs (Signature Curries is active by default). Each tab has its own 3-image slider with previous/next buttons, diamond dots, swipe on touch, and arrow-key support. Each category remembers its current slide when you switch tabs.
- **Buttons**: every button uses the hero CTA style (`.btn`). Square slider/dialog controls use `.btn .btn--icon`. On hover (or keyboard focus) an emerald wave rolls up through the button and the text turns yellow; while the mouse stays on it, smoke drifts out from behind all four edges (`js/smoke.js`, one shared canvas; it starts for any mouse or stylus, is darker on the paper card so it shows on cream, and is off for reduced motion). Wave colours are `--emerald` / `--emerald-light` in `css/styles.css`; smoke density, size and life are the constants at the top of `js/smoke.js`.
- **Logo**: a clear glass circle with a constant gold border. Inside, soft golden light swirls round continuously (two glows turning in opposite directions) while a warm core gently swells and eases back, a living "pulse" (`logoSwirl` / `logoHeart` in `css/styles.css`). The name inside never moves.
- **Navigation**: the bar spans a wide line: Home, Menu, About, Gallery and Reservation spread evenly across the left, the logo holds the centre, and search and the bag sit at the far right, each in its own rounded glass box with a gold border. Below 900px (measured in em, so it moves up for visitors who enlarge their text) the links move into the slide-in menu and the two icon boxes stay in the header.
- **Footer**: page links, then one line with the copyright (the year updates itself), Terms & Conditions and Privacy Policy.
- **Terms & Privacy** (`terms.html`, `privacy.html`): starter text written for how this site actually works (bookings kept in the visitor's browser, fonts and libraries from Google Fonts, cdnjs and jsDelivr). Have them checked against your own policies and local law before going live.
- **Search icon**: opens a search box that finds sections, categories and dishes, then jumps to them.
- **Explore our story**: expands a short extra paragraph.
- **Hero**: your banner photo (`assets/images/hero-feast.webp`, 1915 × 821), anchored to the right so the dishes stay in view while the headline sits on its dark left side. Phones get a crop centred on the main plate (`hero-feast-mobile.webp`). Both are preloaded so the hero appears first.
- **Every visit animates**: pages opened with the browser's Back/Forward buttons reload so their entrance animations play again.
- **Images**: all photos are WebP; photos further down the page load only as you approach them, and every image has its size set so nothing jumps while loading.
- **Motion** (`js/motion.js`, on every page): headings rise word by word out of a mask, text and buttons drift up, photos unveil from the bottom, and cards and footer items follow one after another, as the page opens and as each part scrolls into view. Hero titles keep their own word-by-word entrance.
- **Letter roll**: hovering (or keyboard-focusing) any button or link rolls its text up letter by letter inside a line clipped at the text height, and rolls it back down the same way when you leave. Timing is `DUR` and `MAX_SPREAD` in `js/motion.js`. Add `data-no-roll` to a link or button to leave it out.
- **Numbers count up** smoothly when they scroll into view: statistics, timeline years and "Since" years on About and Gallery. Mark any number with `data-count="60"` (and optionally `data-from`, or `data-group` for 12,000-style commas).
- All motion is switched off for visitors who prefer reduced motion.
- **From Our Table** (above the footer, `js/feast.js`): a scroll-pinned scene built with GSAP 3.12.5 + ScrollTrigger from cdnjs. The section pins at the top of the screen; the two plates float, rotate in 3D and land; then the fork, herbs and chili drop in; then the pin releases. Everything is scrubbed to the scroll position, so scrolling back up reverses it. With reduced motion, or if GSAP can't load, the finished table is shown as a normal section.
  - Layers live in `assets/images/table/` as transparent WebP files: your two HD plates, the silver fork, mint and parsley sprigs, single mint leaves, chili and peppercorns, all cut from the HD assets you supplied. Their positions are the `.feast-piece--*` rules near the end of `css/styles.css`: one set for wide screens, one for phones (under 700px).
  - Timing and pin length are the constants at the top of `js/feast.js` (`PLATE_DUR`, `DECO_START`, scroll length `innerHeight * 2.4`).

## Reservation page

- **Dining room**: your top-down photo with one button per table (8 tables). Hit areas and highlight rings use positions measured on the photo (`LV.TABLES` in `js/reservation-data.js`), so they stay aligned at every size. On phones the room scrolls sideways inside its frame.
- **Reservation card**: your card design with the Luxury Vibes name. Choosing a table flies the card and a black-and-gold fountain pen from that table to the centre while the room dims behind an emerald veil. Field titles sit above each writing line so typed text never overlaps them.
- **Pen as cursor**: the first time you select a field, the pen shrinks smoothly to cursor size and follows your mouse (on touch screens it glides to the field you tap). It stays the cursor until you confirm.
- **Time**: choose a start time first; the picker then fades to the same layout to choose the end time. Bookings last 30 min to 4 h and end by 11:55 PM (`MIN_DURATION_MINUTES`, `MAX_DURATION_MINUTES`, `LAST_END_MINUTES`). Times that clash with another booking at that table show as reserved; a clash on the card shows "Apologies, this table is reserved".
- **Signing**: on confirm, the pen draws the Luxury Vibes sprig and writes the name on the card, with a nib-on-paper sound made live with Web Audio (no sound files), then the card and pen fly back to the table.
- **Guests**: exactly the number booked walk in from the left doorway along the aisles, give way to each other, turn side-on to squeeze past tight spots, sit, and chat (head turns, nods, laughs, gestures that stay above the table, the odd smile up at the camera). When the booking ends or is removed, they stand up and walk out, and the table is free again. Routes come from a clearance map of the tables, chairs and walls in `js/reservation-scene.js`.
- **Manage bookings**: the button in "Reservations in this browser" opens a list with a checkbox per booking and a "Remove all bookings" checkbox.
- **No sample bookings**: the page starts empty; every booking is one you made. Old demo data from earlier versions is deleted automatically.
- **Storage**: there is no backend, so bookings are kept in this browser (localStorage) behind `ReservationService`. They do not sync between visitors or devices. For a live restaurant, replace `LocalStore` in `js/reservation-data.js` with calls to a shared booking API/database.
- **Reduced motion**: the card fades instead of flying, the logo appears without drawing, and guests appear seated and fade out when leaving.

## About page

- **Our Story**: from a street cart in 2009 to four dining rooms, with numbers and a four-step timeline.
- **Cooked the Slow Way**: the kitchen's three principles beside a photo.
- **Our Kitchen Family**: the team and a founder's quote over a photo.
- **Four Dining Rooms**: the four locations as cards, with a Reserve button.
- Every section is a two-column grid that stacks on phones. The story, names and locations are placeholder copy written for the site: replace them with your own. The photos reuse the dish photos already on the site.

## Gallery page

- **Signature Plates (bento grid)**: 13 photos in a mixed grid of large, tall, wide and square tiles (4 columns, 2 on tablets and phones).
  - **Entrance**: a forest-green curtain with a glowing gold edge sweeps off each tile, in a wave spreading out from the middle of the grid, while each photo settles from a close zoom.
  - **Depth**: photos drift slightly against the scroll, and tiles tilt toward the mouse with a moving glint.
  - **Hover**: a soft band of light and then a frosted-glass panel grow out of the exact point where the mouse entered (and shrink back toward where it left), then the category, name and description rise in. Bigger tiles show more text. On touch screens each tile shows its name instead.
  - **Performance**: the frosted glass uses pre-blurred copies of the photos (`assets/images/gallery-frost/`, 360 px wide) instead of a live blur, and every moving part animates with transforms/opacity, so it stays smooth. If you replace a gallery photo, make a matching blurred copy there (any image editor's Gaussian blur, about 7 px at 360 px wide).
  - **Lightbox**: selecting a photo morphs it from its tile to full size with its caption. Use the arrows, keyboard or swipe to move between photos; Esc closes it back into its tile.
  - Tiles, captions and descriptions are in `gallery.html`; the grid sizes are the `tile--xl / --tall / --wide` classes.
- **Fresh from the Pass**: two rows of photos gliding in opposite directions (pause on hover).
- **Behind Every Plate**: counters in glass cards over the dining room.
- **Watch the Kitchen Come Alive**: the hero video in a frame, with Reserve and Menu buttons.

## Menu page

- **Closed scroll**: a black leather roller with the gold end caps from your reference (cut out as separate images), engraved gold "MENU", rim light and core shadow so it reads as a cylinder. "Show Menu" uses the site's button.
- **Opening**: stage 1 widens the rolled scroll sideways to almost the full width (height unchanged); stage 2 starts as that finishes: a second roller drops and turns (its leather and engraved cap band rotate) while the black sheet unrolls, leaning and rippling like heavy paper, then settles. The page follows the roller down.
- **Closing**: "Close Menu" plays exactly the same timeline backwards: the sheet rolls up, then the scroll narrows to its original width. Clicks during a movement are ignored, so it cannot get into a broken state.
- **Sound**: paper rustle with small crackles, a soft slide, metal ticks from the caps and a gentle settle, all made live with Web Audio (no files). It starts on your click; the speaker button mutes it (remembered in this browser).
- **Black-and-gold sheet**: the inner paper is textured black (`assets/images/menu/paper-black.webp`) with a fine double gold border. The title, dish names and prices are polished gold leaf, and the big "MENU" title catches a slow glint. Descriptions are a soft champagne gold for easy reading. The gold gradient is `--gold-foil` at the top of `css/menu.css`.
- **Dishes**: 20 entries, 10 per column (one column under 860px wide), from `js/menu-data.js`. Photos are in `assets/images/menu/dishes/` (3:2, 240 × 160). They were cut from your menu reference image, so they are soft if enlarged; replace them with your own photography using the same file names.
- **Reduced motion**: the menu opens and closes instantly.

## Things to update before going live

1. **Terms & Privacy** — review `terms.html` and `privacy.html` and adjust them to your own booking rules and legal requirements.
2. **Slider photos** — the nine photos in `assets/images/slider/` are stand-ins taken from public sources whose licences were not verified for commercial use. Replace them with your own photography, keeping the same file names (square, at least 800×800px, works best). `curry-house-kadai.webp` is cropped from your own design.
3. **Page images** — hero, signature, tradition and thumbnail images were extracted from your design screenshot. If you have the original high-resolution files, drop them in with the same names for sharper results.
