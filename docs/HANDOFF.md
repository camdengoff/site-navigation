# How to change the navigation links

*This page is for whoever looks after the website. You do not need to know how
to code, and you do not need to change any files.*

The row of links near the top of pages like **Watch Online** is built by a tool.
You fill in a form, it gives you a block of code, and you paste that code back
into Squarespace.

**The tool:** <https://camdengoff.github.io/site-navigation/builder.html>

---

## Changing, adding, or removing a link

**Step 1 — copy what's there now**

1. In Squarespace, click **Edit** on the page with the links.
2. Click on the row of links. A **Code Block** editor opens.
3. Select everything inside it and copy it (Ctrl+C / Cmd+C).

**Step 2 — load it into the tool**

1. Open the tool link above.
2. Scroll to **Start from existing code** and paste what you copied.
3. Click **Load this code**. The form fills in with your current links.

**Step 3 — make your changes**

- **Change wording:** type in the *Text shown* box.
- **Change a color:** click the colored square to pick one, or type a hex code
  like `#1a56db` in the box next to it.
- **Fonts** come from the website's own style settings, so you don't set them
  here. The label uses your Heading 4 style and the links use your paragraph
  style. Change those in Squarespace and the bar follows.
- **Make text bold:** tick *Bold the label* or *Bold the links* under
  **Appearance**.
- **Change where it goes:** type in the *Goes to* box. For a page on your own
  site use the short version, like `/worship-services`. For another website,
  paste the whole address starting with `https://`.
- **Add a link:** click **+ Add a link** at the bottom of the list.
- **Remove a link:** click the **×** on that row.
- **Reorder:** use the **↑** and **↓** arrows.

Check the **Preview** on the right as you go. Click **Phone** to see how it will
look on a phone.

**Step 4 — put it back**

1. Click **Copy code**.
2. Back in Squarespace, select everything in the Code Block and delete it.
3. Paste the new code in.
4. Click **Apply**, then **Save**.
5. Open the live page and refresh to check it.

---

## Good to know

- **Finding a page's address:** open that page on the live site and look at the
  address bar. The part after `.org` or `.com` is what goes in *Goes to* —
  for example `https://example.org/worship-services` means you type
  `/worship-services`.
- **The underline** appears automatically on whichever link matches the page the
  visitor is on. You don't set it.
- **On phones**, the bar stays one line: your label on the left and an arrow on
  the right that people tap to open the links. Under **Appearance** you can
  switch this to a row that swipes sideways instead — that works nicely with
  only two or three links.
- **If the bar disappears** after pasting, something was left out of the code.
  Go back to the tool, rebuild it, and paste the whole block again.
- **Don't retype the code by hand.** Always copy and paste the whole block.

---

## If something looks wrong

The bar is loaded from a GitHub page. If every navigation bar on the site
disappears at once, that page is unavailable — that's not something you can fix
from Squarespace. Contact whoever set this up.
