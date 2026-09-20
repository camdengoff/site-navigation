# Page Navigation

A small navigation bar for section pages on a Squarespace site — the row of
links that sits under the main header on pages like *Watch Online*.

It replaces the usual setup of text blocks, text links, and a separate dropdown
that only shows on phones. Here, one block handles both, and **the links are not
written into the code** — on a Squarespace site they're an ordinary text block
that anyone can edit, and the bar is built from it when the page loads.

There are two ways to install it:

- **[Self-contained](docs/SQUARESPACE-INSTALL.md)** — the site carries its own
  copy of the code. Nothing loads from this project, so nothing here can break a
  live site. **This is the one to use for a client.**
- **Linked** — each page loads `nav.css` and `nav.js` from GitHub Pages. Fine
  for a demo or your own site; it makes the site depend on this repo staying
  exactly where it is.

**[Open the builder →](https://camdengoff.github.io/site-navigation/builder.html)**
&nbsp;·&nbsp;
**[See it live →](https://camdengoff.github.io/site-navigation/)**

---

## Why it's better than the current setup

| | Text blocks + dropdown | This |
|---|---|---|
| Phone layout | A second, separate menu you maintain by hand | Built in — pick a dropdown or a swipeable row |
| Changing a link | Edit the text block, then edit the dropdown too | Change it once, in the builder |
| Current page | Not shown | Marked automatically |
| Handing it off | Person has to understand the CSS that hides things | Person fills in a form |

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

The engine takes them from whichever of these it finds, in this order:

| | Looks like | Who edits it |
|---|---|---|
| **A text block** | `<div data-site-nav></div>`, with a heading and a bulleted list of links in a text block below it | Anyone. It's normal Squarespace text, with the native link picker. |
| **The code block** | `<div data-site-nav data-title="…" data-links='[…]'></div>` | Whoever has the builder. Needed for per-page colors. |
| **A shared file** | `<div data-site-nav data-source="…/links.json">` | Whoever can edit that file. See the bottom of this page. |

The text-block route is what makes this handoff-able: the person maintaining the
site edits a list of links, not code. Because the label is a real heading and the
links are real linked text, the bar comes out matching the site's own type.

## Adding it to a page

**Self-contained install** — do the [one-time setup](docs/SQUARESPACE-INSTALL.md)
once, then every page is **Add Section → Saved → Page navigation**, and the links
are edited as ordinary text. Day-to-day instructions to hand over are in
[HANDOFF.md](docs/HANDOFF.md).

**Linked install:**

1. Open the [builder](https://camdengoff.github.io/site-navigation/builder.html)
   and set **How it's installed** to *Linked to GitHub Pages*.
2. Type in your label, links, and colors. Watch the preview.
3. Click **Copy code**.
4. In Squarespace, edit the page → add a **Code Block** where you want the bar.
5. Paste the code in, click **Apply**, then **Save**.

## Changing the links later

With the self-contained install, you edit the text on the page — that's it.

With the linked install, or any bar built from a code block:

1. In Squarespace, open the Code Block and copy everything in it.
2. Open the builder and paste it into the **Start from existing code** box, then
   click **Load this code**. It works out which install the code came from.
3. Make your changes and copy the new code back into the Code Block.

---

## What's in this repo

| File | What it is |
|---|---|
| `builder.html` | The form that writes the code. This is the thing people use. |
| `nav.css` | How the bar looks. All colors and spacing are CSS variables at the top. |
| `nav.js` | Builds the bar, from a code block or from a text block on the page. |
| `build.js` | Minifies the two files above into the paste-in blocks in `dist/`. |
| `dist/` | The built install files. Committed, so you don't need to build to use them. |
| `test/` | Checks the engine against realistic Squarespace markup. `npm test`. |
| `index.html` | The live demo / landing page. |
| `preview.html` | Used by the builder to show the live preview. Not embedded on your site. |
| `example-links.json` | Sample links file for the shared-list option below. |
| `docs/SQUARESPACE-INSTALL.md` | The one-time setup, for whoever builds the site. |
| `docs/HANDOFF.md` | Day-to-day instructions to give to whoever maintains the site. |

With the **self-contained** install, the site holds its own copy of the code and
this repo is only the source and the builder — moving or deleting it can't affect
a live site.

With the **linked** install, pages load `nav.css` and `nav.js` from
`https://camdengoff.github.io/site-navigation/`. **If this repo is renamed or
made private, every bar installed that way stops working.**

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

With the self-contained install these are set once, in the settings block at the
top of the Code Injection paste, instead of on every page.

When the links come from a **text block**, the heading level is whatever heading
the person actually used, so a label written as a Heading 2 renders as one. The
`data-title-tag` setting only applies to bars whose links come from a code block.

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
instead of in every Code Block. Point the bar at a `.json` file:

```html
<div data-site-nav data-title="Watch Online"
     data-source="https://camdengoff.github.io/site-navigation/example-links.json"></div>
```

Then editing that one file updates every page at once. The trade-off is that
editing it means editing a file in this repo, so only set this up if whoever
maintains the site is comfortable doing that.

---

## Notes

- Link text is inserted as plain text and link addresses are checked, so a
  typo can't inject code into the page.
- The bar is a real `<nav>` with `aria-current` on the active link, so screen
  readers announce it properly.
- The builder remembers what you were working on in your browser, so you won't
  lose a half-finished list if you close the tab.
