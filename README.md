# Page Navigation

A small navigation bar for section pages on a Squarespace site — the row of
links that sits under the main header on pages like *Watch Online*.

It replaces the usual setup of text blocks, text links, and a separate dropdown
that only shows on phones. Here, one block handles both, and **the links are not
written into the code** — they live in a short list that a builder tool writes
for you.

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

## Adding it to a page

1. Open the [builder](https://camdengoff.github.io/site-navigation/builder.html).
2. Type in your label, links, and colors. Watch the preview.
3. Click **Copy code**.
4. In Squarespace, edit the page → add a **Code Block** where you want the bar.
5. Paste the code in, click **Apply**, then **Save**.

To put the same bar on *every* page instead, paste the code into
**Settings → Advanced → Code Injection → Header**.

## Changing the links later

1. In Squarespace, open the Code Block and copy everything in it.
2. Open the builder and paste it into the **Start from existing code** box, then
   click **Load this code**.
3. Make your changes and copy the new code back into the Code Block.

That's the whole workflow. Nobody needs to read or edit a file in this repo.

---

## What's in this repo

| File | What it is |
|---|---|
| `builder.html` | The form that writes the code. This is the thing people use. |
| `nav.css` | How the bar looks. All colors and spacing are CSS variables at the top. |
| `nav.js` | Builds the bar from the links in the embed code. |
| `index.html` | The live demo / landing page. |
| `preview.html` | Used by the builder to show the live preview. Not embedded on your site. |
| `example-links.json` | Sample links file for the shared-list option below. |
| `docs/HANDOFF.md` | One-page instructions to give to whoever maintains this next. |

The files are served from GitHub Pages at
`https://camdengoff.github.io/site-navigation/`, which is where the embed
code points. **If this repo is renamed or made private, every bar on the site
stops working**, because the site loads `nav.css` and `nav.js` from that address.

---

## Type

Every type property defaults to `inherit`, so the bar takes its font, size,
weight, letter spacing and capitalisation from whatever the page already uses.
Change the site's typography in Squarespace and the bar follows, with nothing to
update here.

The builder's **Text style** setting switches this:

- **Match my site's fonts and sizes** (default) — writes no type values at all,
  so everything inherits.
- **Use the built-in bold style** — writes a fixed 1rem/700 link and
  1.25rem/700 label, the look in the screenshots.

You can also mix the two. To inherit everything but keep the label bold, add one
variable to the embed:

```html
<div data-site-nav style="--sn-title-weight:700" ...></div>
```

Or set it for every bar at once in **Squarespace → Website → Custom CSS**:

```css
.sn-nav { --sn-title-weight: 700; }
```

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
