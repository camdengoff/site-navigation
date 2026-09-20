# Installing this on a Squarespace site

*This is the one-time setup, done by whoever builds the site. It happens once
per site. After it, nobody needs this repo again — see
[HANDOFF.md](HANDOFF.md) for the day-to-day instructions to hand over.*

The point of this install is that **the site ends up carrying its own copy of
the code**. Nothing loads from GitHub, from this project, or from anyone's
personal account, so nothing here can ever break a client's live site.

---

## What you need

- A Squarespace plan that includes **Code Blocks** and **Code Injection**.
  Check this first — the entry-level plans don't, and the whole approach
  depends on both.
- The built files. Generate them with:

  ```
  npm install
  npm run build
  ```

  That writes `dist/`. Or open the [builder](../builder.html), leave
  **How it's installed** on *Squarespace, self-contained*, set your colors, and
  copy the two blocks it gives you under **One-time site setup** — they already
  have your colors in them.

---

## Step 1 — the stylesheet

Squarespace → **Design → Custom CSS**. Paste in `dist/site-nav.custom-css.css`.

It goes here rather than in Code Injection for one specific reason: Squarespace
doesn't apply injected styles inside the page editor, but it does apply Custom
CSS. That's what lets the bar's marker be labelled while someone is editing,
instead of appearing as an empty box they might delete by accident.

## Step 2 — the script

Squarespace → **Settings → Advanced → Code Injection → Header**. Paste in
`dist/site-nav.header.html`.

The top of that block is the site-wide settings — colors, phone layout, whether
the label is a real heading. Edit them here and every bar on the site changes at
once. The rest is the engine; leave it alone and rebuild instead.

> Prefer one paste instead of two? `dist/site-nav.all-in-one.html` has the
> stylesheet folded into the Header block. You lose the editor label from
> Step 1; everything else is identical.

## Step 3 — build the reusable section

On one page, in the editor:

1. Add a **Code Block**, and put exactly this in it:

   ```html
   <div data-site-nav></div>
   ```

2. Directly **below** it, add a **text block** with:
   - the bar's label, styled as a **Heading** (whichever level you want — the
     bar keeps the level you choose)
   - the links as a **bulleted list**, one per line, each one linked using
     Squarespace's normal link editor

3. Save the page and open the live page to check it.

Then hover that section, click the **heart** to save it, and give it a name like
*Page navigation*. It's now available on every page under
**Add Section → Saved**.

That's the whole install.

---

## How it behaves

**In the editor**, Squarespace switches JavaScript off, so the client sees the
label and the bulleted list as ordinary editable text, with a dashed box above
marking what it is. They edit it like any other text on the site — including
using the native page picker for link targets.

**On the live site**, the script reads that list, replaces it with the finished
bar, and hides the raw list.

**Per page**, the bar is off until the section is added. No section, no bar.
Deleting the section turns it off again.

**If the script ever fails to load**, nothing is hidden, and the page falls back
to a plain heading and a working list of links. That's deliberate — the worst
case is unstyled, not broken or blank.

---

## The two ways to supply links

Both work, and the engine detects which is in use:

| | How | Use it when |
|---|---|---|
| **Text block** | `<div data-site-nav></div>` plus a list in a text block | Normal. The client never sees code. |
| **Code block** | `<div data-site-nav data-title="..." data-links='[...]'></div>` | You need per-page colors, or you're generating pages programmatically. Attributes on the block override the site-wide settings. |

The builder writes either one. Its **Start from existing code** box still reads
a pasted block back in, so the old round-trip workflow is intact.

---

## Things to check on the real site

- **`sticky` probably won't work.** `position: sticky` needs no clipping
  ancestor, and Squarespace section wrappers commonly set `overflow: hidden`.
  Test it where you intend to use it, or leave the option off.
- **The bar can't go edge-to-edge from inside a Code Block.** It's capped to
  the section's content width. Full-bleed needs a different placement.
- **Always check the live page, not the editor.** Scripts are off in the
  editor, and Squarespace also hides embedded code from logged-in admins
  sometimes. A private window on the live URL is the honest test.

## Updating the engine later

Change `nav.css` or `nav.js`, then:

```
npm run build
npm test
```

Re-paste the two blocks from `dist/`. Bump `VERSION` in `nav.js` if the change
matters — a page that somehow ends up with two copies keeps the newer one.
Per-page blocks don't need touching.
