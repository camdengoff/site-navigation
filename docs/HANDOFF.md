# How to change the navigation links

*This page is for whoever looks after the website. You don't need to know how
to code, but you do need to copy and paste exactly.*

The row of links near the top of pages like **Watch Online** lives inside a
Code Block on that page. To change it, you regenerate that block using the
builder and paste the new version back in — the page's link list isn't
editable text on its own.

---

## Changing, adding, or removing a link

1. Open the [builder](https://camdengoff.github.io/site-navigation/builder.html).
2. If the page already has a bar: in Squarespace, open its Code Block and copy
   everything in it. Back in the builder, paste that into the **Start from
   existing code** box and click **Load this code** — this brings back the
   label, links, and colors it already had.
3. Make your changes — edit the label, add/remove/reorder links, adjust
   colors. Watch the preview update as you go.
4. Click **Copy code**.
5. In Squarespace, open that page's Code Block, delete everything already in
   it, and paste the new code in.
6. Click **Apply**, then **Save**.
7. Open the live page and refresh to check it.

**The bar won't show while you're editing the page.** Squarespace turns off
the code that builds it whenever you're in the editor, so the Code Block looks
empty there. That's normal — check the live page instead.

---

## Turning the bar on for another page

1. Open the builder and set up the label and links for that page — either
   starting fresh, or loading another page's code first as a starting point.
2. Click **Copy code**.
3. On the new page, add a **Code Block** where you want the bar, paste the
   code in, then **Apply** and **Save**.

Each page needs its own copy pasted in — there's no site-wide switch, since
every page's code carries everything the bar needs by itself.

## Turning the bar off for a page

Edit the page and delete the Code Block holding the bar. Every other page is
unaffected.

Pages are **off by default** — a page only shows the bar if someone added a
Code Block with this code to it.

---

## Good to know

- **The underline** appears automatically on whichever link matches the page
  the visitor is on. You don't set it.
- **Colors and layout are per page.** They're baked into that page's own code,
  so changing them everywhere means regenerating and re-pasting each page's
  block — there's no single place that changes every bar at once.
- **On phones**, the bar becomes either a dropdown (label on the left, an
  arrow that opens the links) or a swipeable row, depending on what was
  chosen when that page's code was generated.
- **The "Goes to" field is a plain text box**, not a page picker — type a path
  like `/worship-services` matching the live page's URL, or a full `https://`
  address for anywhere else. Double-check it before copying the code.
- **If the bar isn't showing on the live page**, check the Code Block still
  has the full snippet in it (it should start with `<style>`), not something
  partial or an old version.

## Adding a page to the menu that doesn't exist yet

Create and publish the page first, so you know its final URL, then add the
link for it in the builder.
