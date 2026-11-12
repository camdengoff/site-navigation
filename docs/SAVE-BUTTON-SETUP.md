# Settings page with a Save button

This is an add-on to the [site-wide install](SITE-WIDE-INSTALL.md). Without it,
the setup panel gives you code to paste into Code Injection every time you
change something. With it, you get **a page on your Squarespace site where you
change the bars, click Save, and every page updates on its own**. After the
one-time setup below, nobody touches code again.

## Why it needs a small outside service

Squarespace has no way for a script to save anything into the site itself.
There's no API for Code Injection, pages, or blocks. So the Save button
writes the settings to a tiny storage service that you own, and every page of
the site reads them from there.

That service is a **Cloudflare Worker**: free, fast (around 50ms from
anywhere), and in your own Cloudflare account. Its code is
[`worker/worker.js`](../worker/worker.js), one file.

- **Anyone can read** the settings. They're only the links that show in the
  bar on your public site anyway.
- **Saving needs your password**, and only works from your own site's
  address.
- **If the service is ever down**, returning visitors still see the bar,
  because each browser keeps the last settings it saw. A visitor's very first
  page falls back to whatever settings are pasted in Code Injection (none, by
  default).
- **If two people edit at once**, the second person to click Save is warned
  instead of silently overwriting the first person's change.

---

## One-time setup

### 1. Cloudflare (about 10 minutes)

1. Make a free account at [dash.cloudflare.com](https://dash.cloudflare.com).
   You don't need to move your domain there.
2. **Storage & Databases → KV → Create**. Call it `site-nav`.
3. **Workers & Pages → Create → Worker**. Start from *Hello World*, call it
   `site-nav-settings`, and **Deploy**.
4. **Edit code**. Delete what's there, paste in all of
   [`worker/worker.js`](../worker/worker.js), and **Deploy**.
5. In the worker's **Settings → Bindings → Add → KV namespace**: set the
   variable name to `SITE_NAV` (exactly) and pick the `site-nav` namespace.
6. In **Settings → Variables and Secrets**, add:
   - `ALLOWED_ORIGINS` (type **Text**): every address you open the site at,
     comma separated, with no trailing slash. For example:
     `https://www.yoursite.org,https://yoursite.org,https://yoursite-abc1.squarespace.com`.
     Saving is refused from any address not on this list.
   - `ADMIN_PASSWORD` (type **Secret**): the password for the settings page.
     Make it long, because the address is public and the password is the
     only thing that stops strangers from saving.
7. Copy the worker's address from the top of its page. It looks like
   `https://site-nav-settings.yourname.workers.dev`.

Prefer the command line? `worker/wrangler.toml` is set up for
`npx wrangler deploy`. Fill in the KV id and `ALLOWED_ORIGINS`, then run
`npx wrangler secret put ADMIN_PASSWORD`.

### 2. Squarespace

1. **Settings → Advanced → Code Injection → Footer**: paste
   [`dist/site-wide-install.html`](../dist/site-wide-install.html) (if it
   isn't there already). In its settings block near the top, put the worker's
   address in `"source"`:

   ```json
   {
     "source": "https://site-nav-settings.yourname.workers.dev",
     "bars": {},
     "pages": {}
   }
   ```

   **Save.** This is the last time you edit Code Injection.

2. Add a new page, e.g. **Nav settings**, under **Not Linked** so it isn't in
   the menu. In its page settings:
   - give it a **page password**
   - turn on **Hide from search engines**
3. On that page, add a **Code Block** containing only:

   ```html
   <div data-site-nav-admin></div>
   ```

   **Apply**, then **Save**.

### 3. Use it

Open the settings page **on the live site** (not in the editor, where
Squarespace turns scripts off):

- **Moving over from Code Blocks?** On **Bars**, click **Find bars already
  on the site**. It reads every page, lists each bar it finds in a Code Block
  (one entry per distinct bar, with the pages it's on), and **Bring in the
  ticked bars** adds them here, set on those same pages. Save, then delete the
  old Code Blocks. A page's own Code Block wins while it's still there, so
  visitors see no change at any point.
- **Bars**: make a bar (label, links, colors). It previews above the panel as
  you go.
- **Pages**: pick a bar for each page, or **No bar**. Each page name opens
  that page in a new tab with the panel on it, so you can see the bar in
  place before saving.
- **Save**: enter the password once (tick *Remember on this device* if you
  like), then click **Save**. It's live straight away. Cloudflare can take up
  to a minute to show the change everywhere.

---

## Things to know

- **Changing the password** or the allowed addresses happens in the
  worker's *Variables and Secrets*, with no change to the site.
- **Backups.** The settings live in the `site-nav` KV namespace under the key
  `config`. You can view or download them in the Cloudflare dashboard, and
  each save bumps the `version` number inside it.
- **The Squarespace page password** keeps the settings page itself private.
  The worker password is what actually protects saving, so it's needed even
  if someone found the page some other way.
- **Free plan limits** (100,000 reads and 1,000 saves a day) are far beyond
  what a church or small business site uses. Each page view is one read, and
  returning visitors' browsers still check for changes in the background.
- **Turning it off**: remove `"source"` from the Code Injection settings, and
  the site goes back to the settings pasted there.
