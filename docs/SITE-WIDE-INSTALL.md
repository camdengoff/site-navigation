# Site-wide install: one paste, a bar on any page you choose

The per-page install ([SQUARESPACE-INSTALL.md](SQUARESPACE-INSTALL.md)) puts a
Code Block on every page that needs a bar. This one is pasted **once**, into
Code Injection, and from then on you turn the bar on or off for each page from
a setup panel on the live site. No page needs any code of its own.

The bar always goes in the same place: **the very top of the page content,
directly under Squarespace's own header and main navigation**, above the
page's first section.

> **Want a Save button instead of pasting?** Add a settings page whose Save
> button updates the whole site with no code to paste. It needs one small free
> service. See [SAVE-BUTTON-SETUP.md](SAVE-BUTTON-SETUP.md).

---

## What you need

- A Squarespace plan with **Code Injection** (Core / Business and up; not
  Personal).
- The file [`dist/site-wide-install.html`](../dist/site-wide-install.html)
  from this repo. It is the whole thing: styles, an empty list of settings,
  and the script.

## Installing it (once)

1. Open `dist/site-wide-install.html` and copy everything in it.
2. In Squarespace: **Settings → Advanced → Code Injection**.
3. Paste it into the **Footer** box (below anything already there) and click
   **Save**.

Nothing changes on the site yet - the settings it ships with turn the bar on
for no pages.

## Turning the bar on for pages

1. Open any page of the **live** site with `?sitenav-setup` added to the end
   of the address, e.g. `https://www.example.org/?sitenav-setup`. A setup
   panel opens on the right.
2. The panel lists every page on the site with the bar it has. **Click a
   page** to open its popup: pick a bar or **+ A new bar**, see a live
   preview, and edit its label, links and look right there. Several pages
   can share one bar.
   - Already have bars in Code Blocks? **Find bars already on the site**
     connects each one to the page it was found on.
   - **Edit this page's bar** at the top goes straight to the page you're
     on, so you can also browse the site with the panel open and set each
     page as you go. The bar previews on the page straight away.
   - **Patterns**: add `/sermons/*` to cover every page under `/sermons/`,
     like each post of a blog. A page's own setting always wins over a
     pattern, so a single post can still be set to *No bar*.
3. (Steps 3-5 only apply without the [Save button](SAVE-BUTTON-SETUP.md).)
   Click **Publish…** at the bottom of the panel.
4. **Copy code**.
5. Back in **Code Injection → Footer**, select everything from
   `<!-- Secondary navigation bar: start -->` to
   `<!-- Secondary navigation bar: end -->`, paste over it, and **Save**.

That paste *is* the save. Until you do it, your changes only exist in your own
browser (as a draft that survives closing the tab), and only you see the
preview. Visitors see whatever is in Code Injection.

To change things later, open `?sitenav-setup` again - it starts from what's
live - and repeat steps 2-5.

---

## How the settings are stored

One JSON block in the Footer, which the setup panel writes for you:

```html
<script type="application/json" id="site-nav-config">
{
  "bars": {
    "watch": {
      "title": "Watch Online",
      "titleUrl": "/watch-online",
      "links": [
        { "label": "Live", "url": "/watch-online" },
        { "label": "Sermons", "url": "/sermons" },
        { "label": "Podcast", "url": "https://example.com/podcast", "newTab": true }
      ],
      "phone": "dropdown",
      "colors": { "bg": "#ececec", "text": "#111111" }
    }
  },
  "pages": {
    "/watch-online": "watch",
    "/sermons": "watch",
    "/sermons/*": "watch",
    "/sermons/2019-archive": false
  }
}
</script>
```

- **`bars`**: named link sets. Each takes the same options as the builder:
  `title`, `titleUrl`, `links`, `phone` (`dropdown` / `swipe`), `textStyle`
  (`site` - the default, real Heading 4 + paragraph tags - or `plain`),
  `boldLabel`, `boldLinks`, `sticky`, `colors` (`bg`, `text`, `hover`,
  `muted`, `accent`), and `vars` for any other `--sn-*` variable from
  [nav.css](../nav.css).
- **`pages`**: page URL path → bar name. Case and a trailing slash don't
  matter. `/prefix/*` covers everything under `/prefix/` (`*` alone is every
  page). `false` turns a page off even if a pattern covers it. A value can
  also be a whole bar object instead of a name, for a one-off bar.
- **`settings`** (optional, rarely needed):
  - `"align": "full"` - put the label and links at the window edges instead
    of lining them up with the site's content width.
  - `"offset": 20` - extra pixels of space above the bar.
  - `"content": "#sections"` / `"header": "#header"` - CSS selectors for where
    the page content starts and what the site header is, if a template isn't
    recognised.

### Why it's keyed by URL path

| Option | Good | Not so good |
|---|---|---|
| **One settings block in Code Injection, keyed by path** (this) | One place for everything. Readable - you can see which page gets what. Nothing hosted anywhere else, so nothing outside the site can break it. | Saving is a copy-paste into Code Injection. If a page's URL slug changes, its entry no longer matches and that page silently loses its bar until it's re-picked. |
| Keyed by Squarespace's internal page ID | Survives renaming a page's URL. | Opaque IDs nobody can read or edit by hand; a deleted-and-recreated page gets a new one anyway. |
| Settings in a hosted JSON file (e.g. GitHub) | Edit without opening Squarespace. | The live site depends on that file staying online and on whoever can edit it. |
| Per-page Code Injection (Page settings → Advanced) | No shared list. | Still code on every page - what this install exists to avoid. |

Path keys plus `/*` patterns cover the common cases well, and the setup panel
lists pages from the live sitemap so a renamed page is easy to spot (it shows
up as an unlisted rule at the top of the page list).

---

## How it behaves

- **Placement.** The bar goes into Squarespace 7.1's `#sections` before the
  first section (7.0 templates: the main content area), so it's full width on
  its own and always sits under the header. If the header is **fixed** or
  **transparent** (drawn over the top of the content), the bar is pushed down
  by exactly the header's height so it's never hidden behind it. It's
  re-measured when the header or window changes size.
- **Lined up with the content.** The label and links follow the site's own
  content width and side gutter (`--sqs-site-max-width` /
  `--sqs-site-gutter`), so they line up with the text below.
- **Sticky** sticks just below a fixed header, rather than behind it.
- **In the editor** the bar is taken off the page, and put back when the
  editor closes, so it never gets in the way of Squarespace's own editing.
- **A page that already has a bar in a Code Block** (the per-page install)
  keeps that one, and the site-wide bar stays off that page - so you can move
  a site over one page at a time without ever showing two bars.

## Things to check on the real site

- **Transparent headers.** Squarespace already pads a page's first section
  down to clear a transparent header. With the bar pushed below the header as
  well, that first section can end up with more space at its top than
  before. If it looks off, turn the header's transparency off for that page,
  or reduce the first section's top padding.
- **Pages missing from the list.** The list combines `sitemap.xml`, the
  links in the site's menus, and pages you've opened in this browser since
  using setup. Squarespace caches `sitemap.xml`, so a brand-new page that
  isn't in a menu yet can be missing for a while, and the sitemap leaves out
  disabled pages and pages hidden from search engines. Open the page once,
  then click **Refresh list**, or add it with **Add a page or a pattern**.
- **Squarespace's own "scroll back" header**, which hides as you scroll down,
  leaves a gap above a sticky bar while it's hidden.
- **Check in a private window.** The setup panel shows your unsaved draft;
  a private window shows exactly what visitors get.

## Who can open the setup panel

Anyone who adds `?sitenav-setup` to the address - but all it can do is change
what *that person* sees in *their own* browser and hand them some code. Only
someone who can edit Code Injection can make a change live.

## Updating the engine later

Change `nav.css`, `site.css`, `nav.js` or `site.js`, then `npm run build` and
`npm test`. The setup panel always hands back the snippet with the engine that
is currently live, so to move to a new engine: paste the new
`dist/site-wide-install.html` over the old block, then put your settings back
by copying the `site-nav-config` block from the old one (or open setup with
the draft still in your browser and copy from Save).
