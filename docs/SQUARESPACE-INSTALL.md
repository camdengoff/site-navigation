# Putting this on a Squarespace page

*Day-to-day instructions to hand over are in [HANDOFF.md](HANDOFF.md) — read
this one first if you're setting it up for the first time.*

Each page's Code Block carries its own full copy of everything the bar
needs — styles, script, and that page's own label and links. Nothing loads
from GitHub, from this project, or from anyone's personal account, so nothing
here can ever break a client's live site, and there's no site-wide setup step
to do first.

---

## What you need

- A Squarespace plan that includes **Code Blocks**. That's the only
  Squarespace feature this depends on — no Code Injection required.
- The [builder](https://camdengoff.github.io/site-navigation/builder.html),
  to generate each page's code. It fetches the built engine from `dist/`, so
  if you're running it locally, build first:

  ```
  npm install
  npm run build
  ```

---

## Adding the bar to a page

1. Open the [builder](../builder.html). Fill in the label, links, colors, and
   layout. Watch the preview update as you go.
2. Click **Copy code**.
3. In Squarespace, edit the page and add a **Code Block** where you want the
   bar.
4. Delete anything already in the block, then paste the code in.
5. Click **Apply**, then **Save**.
6. Open the **live page** to check it (not the editor — see below).

Repeat this on every page that should have the bar. There's no "turn it on
for the whole site" step; each page's Code Block is what turns it on for that
page.

---

## How it behaves

**In the editor**, Squarespace switches JavaScript off entirely, so the whole
Code Block — the styles, the script, and the bar — renders as nothing. The
stylesheet is pasted inline in that same block, and stylesheets still apply
even when scripts don't, so a small dashed box labelled *Navigation bar*
shows instead of a blank gap, to stop it being deleted by accident.

**On the live site**, the script builds the finished bar in the block's
place.

**Per page**, the bar is off until its Code Block is added. No block, no bar.
Deleting the block turns it off again.

**If the script ever fails to load**, the block is simply empty — there's no
separate content underneath it to fall back to, since everything the bar
needs lives in that one block.

---

## Things to check on the real site

- **`sticky` probably won't work.** `position: sticky` needs no clipping
  ancestor, and Squarespace section wrappers commonly set `overflow: hidden`.
  Test it where you intend to use it, or leave the option off.
- **The bar's background always reaches the sides of the page on its own**,
  even though the Code Block itself is capped to the section's content
  width - only the background moves, the label and links stay where they
  were. It has the same clipping-ancestor caveat as `sticky` above: if it
  doesn't reach the edge on a given page, a Squarespace section wrapper is
  probably clipping it, so check the real page.
- **Squarespace's Fluid Engine editor enforces a minimum height per block**
  that it can't be dragged below, separately for Desktop and Mobile - which
  leaves a gap of empty white space around the bar. The builder's "Size the
  section to fit the bar" option (on by default) fixes it on the live page:
  once the bar is built, the script sizes the bar's whole section to the
  bar, removing the grid's reserved rows and gaps, the block's stretched
  height, and the section's own minimum height and padding, then ends the
  section exactly at the bottom of the bar - and re-applies that if
  Squarespace's Mobile layout changes things after the page loads. (The top padding
  of the page's first section is kept, so the bar isn't pulled up under the
  site header.) **It only applies when the bar is the only block in its
  section**, so give the bar a section of its own. With a second block in
  the section it does nothing, rather than disturbing that block's layout.
  The editor still shows the gap, because scripts don't run there.
- **Always check the live page, not the editor.** Scripts are off in the
  editor, and Squarespace also hides embedded code from logged-in admins
  sometimes. A private window on the live URL is the honest test.

## Updating the engine later

Change `nav.css` or `nav.js`, then:

```
npm run build
npm test
```

Every page's Code Block carries its own copy of the old engine, so nothing on
the live site changes on its own. To pick up the fix, regenerate that page's
code in the builder (paste the old code into **Start from existing code**
first, to keep its label/links) and re-paste it. Bump `VERSION` in `nav.js`
if the change matters enough that a page briefly running two copies at once
(mid re-paste) should keep the newer one.
