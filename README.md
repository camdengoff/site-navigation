# Page Navigation

A small navigation bar for section pages on a Squarespace site — the row of
links that sits under the main header on pages like *Watch Online*.

It replaces the usual setup of text blocks, text links, and a separate dropdown
that only shows on phones. Here, one block handles both.

Fill in the [builder](https://camdengoff.github.io/site-navigation/builder.html),
and it hands you one snippet — styles, script, and this page's own label and
links, all in one paste. Put it in a Code Block on the page and nothing else on
the site needs to change: no site-wide setup, nothing loading from anywhere
else. Adding it to another page means coming back to the builder and copying a
fresh one.

**[Open the builder →](https://camdengoff.github.io/site-navigation/builder.html)**
&nbsp;·&nbsp;
**[See it live →](https://camdengoff.github.io/site-navigation/)**

---

## Why it's better than the current setup

| | Text blocks + dropdown | This |
|---|---|---|
| Phone layout | A second, separate menu you maintain by hand | Built in — pick a dropdown or a swipeable row |
| Changing a link | Edit the text block, then edit the dropdown too | Re-generate the snippet in the builder, paste it over the old one |
| Current page | Not shown | Marked automatically |
| Setting it up | Hand-written CSS and markup per page | Fill in a form, copy one block |

### The two phone layouts

Set in the builder under **Appearance**, or by hand with `data-phone`:

- **`dropdown`** (default) — the bar stays one line: your label on the left, an
  arrow on the right that opens the links underneath. With no label set, the
  button widens and names the page you're on instead, so it's never a bare
  arrow. Best when there are more than about three links.
- **`swipe`** — all the links in one row you drag sideways, nothing hidden.
  Best for two or three short links.

Either way it's one Code Block. There's no separate mobile menu to keep in sync.

---

## Where the links come from

Normally, whatever's written into the block's own `data-links` attribute — the
builder writes this for you:

```html
<div data-site-nav data-title="…" data-links='[…]'></div>
```

Optionally, a shared `.json` file instead, if the same list should update
several pages at once — see [below](#optional-one-shared-list-for-many-pages).

## Adding it to a page

1. Open the [builder](https://camdengoff.github.io/site-navigation/builder.html).
2. Type in your label, links, and colors. Watch the preview.
3. Click **Copy code**.
4. In Squarespace, edit the page → add a **Code Block** where you want the bar.
5. Paste the code in, click **Apply**, then **Save**.

Each page's block carries everything it needs — the stylesheet, the script, and
that page's own label and links — so nothing else on the site has to be set up
first, and nothing breaks if this project moves or goes away. The trade-off is
that a page's block doesn't update on its own; adding it to another page, or
changing an existing one, means coming back to the builder each time.

## Changing the links later

1. In Squarespace, open the Code Block and copy everything in it.
2. Open the builder and paste it into the **Start from existing code** box, then
   click **Load this code**.
3. Make your changes and copy the new code back into the same Code Block.

---

## What's in this repo

| File | What it is |
|---|---|
| `builder.html` | The form that writes the code. This is the thing people use. |
| `nav.css` | How the bar looks. All colors and spacing are CSS variables at the top. |
| `nav.js` | Builds the bar from the block's own attributes. |
| `build.js` | Minifies the two files above into `dist/`, for the builder to fetch and fold into each snippet it generates. |
| `dist/` | The built engine. Committed, so you don't need to build to use the builder. |
| `test/` | Checks the engine against realistic Squarespace markup. `npm test`. |
| `index.html` | The live demo / landing page. |
| `preview.html` | Used by the builder to show the live preview. Not embedded on your site. |
| `example-links.json` | Sample links file for the shared-list option below. |
| `docs/SQUARESPACE-INSTALL.md` | Step-by-step for putting a snippet on a page. |
| `docs/HANDOFF.md` | Day-to-day instructions to give to whoever maintains the site. |

Each page's snippet carries its own full copy of the engine, so this repo is
only ever the source and the builder — moving or deleting it can't affect a
live site.

## Working on it

```
npm install
npm run build    # writes dist/
npm test         # runs the engine against Squarespace-shaped markup
```

`npm test` needs a Chromium; if the one Playwright wants isn't installed, point
`CHROMIUM_PATH` at the browser you have. The build refuses to write files if
minifying dropped anything the install depends on, and the test suite checks the
minified bundle as well as the source.

---

## Type

The bar sets no fonts of its own. The builder's **Text style** setting picks
where the type comes from:

| Setting | What it renders | Styled by |
|---|---|---|
| **Site styles** (default) | Label as a real `<h4>`, each link inside a real `<p>` | Your Squarespace **Site styles → Fonts** settings for Heading 4 and paragraphs |
| **Plain** | A `<span>` and bare links | Whatever text style surrounds the bar |
| **Built-in bold** | Same plain markup, plus fixed sizes | The variables below (1rem/700 links, 1.25rem/700 label) |

With **Site styles**, changing Heading 4 in Squarespace changes the bar's label,
with nothing to re-paste here. The heading level is a dropdown in the builder
(`h1`–`h4`) and lands in the embed as `data-title-tag`:

```html
<div data-site-nav data-title-tag="h4" data-link-tag="p" ...></div>
```

**Bold** is a separate pair of checkboxes, so you can take the site's fonts and
still make the bar stand out. They work in all three modes and override the
site's own weight:

```html
<div data-site-nav data-bold-label="true" data-bold-links="true" ...></div>
```

Two things stay ours in every mode: the link colors and the current-page marker.
Those come from the settings, not the site, so the bar always reads as a bar.

**Worth checking once on the live site:** Squarespace applies its heading and
paragraph fonts inside the page content area, which is where the bar is designed
to go. A bar placed outside it — injected into the header, say — may not pick
those fonts up, so use Plain or Built-in there.

## Restyling it

Every color, size, and spacing value is a CSS variable at the top of `nav.css`.
You can override any of them on a single bar without touching the file — the
builder already does this with the `style` attribute:

```html
<div data-site-nav
     style="--sn-bg:#111827; --sn-text:#ffffff; --sn-accent:#f59e0b; --sn-height:3.5rem"
     data-links='[...]'></div>
```

| Variable | Does |
|---|---|
| `--sn-bg` | Bar background |
| `--sn-text` | Label and current-page link color |
| `--sn-muted` | Color of the links you're not on |
| `--sn-accent` | Marker on the current page (underline, or a bar in the dropdown) |
| `--sn-hover` | Link color on hover/focus (defaults to `--sn-text`) |
| `--sn-divider` | Hairline above the open dropdown |
| `--sn-font` | Font family |
| `--sn-font-size` / `--sn-title-size` | Link and label text size |
| `--sn-font-weight` / `--sn-title-weight` | Link and label weight |
| `--sn-letter-spacing` | Letter spacing |
| `--sn-text-transform` | e.g. `uppercase` |
| `--sn-height` | Bar height in the wide layout |
| `--sn-gap` | Space between links |
| `--sn-pad-x` | Space from the left and right edges |
| `--sn-radius` | Rounded corners |

The bar switches to its narrow layout when **the bar itself** is under 640px
wide — not when the screen is. So it also looks right inside a narrow column.

---

## Optional: one shared list for many pages

If the same bar appears on a lot of pages, you can keep the links in one file
instead of retyping them into every block. The builder doesn't have a field for
this, so after copying its code, swap the `data-links='[...]'` attribute for a
`data-source` pointing at a `.json` file:

```html
<div data-site-nav data-title="Watch Online"
     data-source="https://camdengoff.github.io/site-navigation/example-links.json"></div>
```

Everything else the builder gave you — the `<style>`, the `<script>`, the rest
of the attributes — stays as it was; only that one attribute changes. Then
editing that one file updates every page using it at once. The trade-off is
that editing it means editing a file in this repo, so only set this up if
whoever maintains the site is comfortable doing that.

---

## Notes

- Link text is inserted as plain text and link addresses are checked, so a
  typo can't inject code into the page.
- The bar is a real `<nav>` with `aria-current` on the active link, so screen
  readers announce it properly.
- The builder remembers what you were working on in your browser, so you won't
  lose a half-finished list if you close the tab.
