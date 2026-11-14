/* ==========================================================================
   Checks the site-wide install (site.js): one snippet in Code Injection,
   with a bar on whichever pages its settings list.

   Run it with:  npm test   (after npm run build)

   Serves a small fake Squarespace 7.1 site - header, #sections, a
   sitemap.xml - from inside the browser, so the script sees real paths like
   /watch-online and /sermons/easter. Runs everything twice: once from the
   source files, and once from dist/site-wide-install.html, the exact snippet
   that gets pasted into Squarespace.
   ========================================================================== */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const LAUNCH = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log("  ok    " + name);
  } else {
    failures++;
    console.log("  FAIL  " + name + "\n          expected " + e + "\n          actual   " + a);
  }
}

const CONFIG = {
  bars: {
    watch: {
      title: "Watch Online",
      titleUrl: "/watch-online",
      links: [
        { label: "Live", url: "/watch-online" },
        { label: "Sermons", url: "/sermons" },
        { label: "Podcast", url: "https://example.com/podcast", newTab: true }
      ]
    },
    give: {
      title: "Give",
      sticky: true,
      textStyle: "plain",
      colors: { bg: "#001122", text: "#ffffff" },
      links: [{ label: "One Time", url: "/give" }, { label: "Recurring", url: "/give/recurring" }]
    }
  },
  pages: {
    "/watch-online": "watch",
    "/sermons": "watch",
    "/sermons/*": "watch",
    "/sermons/hidden": false,
    "/give": "give",
    "/own-block": "watch"
  }
};

const SITEMAP_PATHS = ["/", "/about", "/watch-online", "/sermons", "/sermons/easter", "/give", "/give/recurring", "/own-block", "/ministries/youth", "/ministries/music"];

/* A bar pasted into a Code Block the old way - the same one on two pages. */
const LEGACY_BLOCK = '<section class="page-section" id="own"><div class="sqs-block code-block"><div data-site-nav data-title="Ministries" data-title-tag="h4" data-link-tag="p" data-phone="swipe" data-bold-links="true" style="--sn-bg:#001122;--sn-height:3rem" data-links=\'[{"label":"Youth","url":"/ministries/youth"},{"label":"Music","url":"/ministries/music","newTab":true}]\'></div></div></section>';

function sitemap() {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    SITEMAP_PATHS.map((p) => "<url><loc>http://site.test" + p + "</loc></url>").join("") + "</urlset>";
}

/* The footer snippet for one run, with the given settings swapped in. */
function sourceSnippet(config) {
  const css = fs.readFileSync(path.join(ROOT, "nav.css"), "utf8") + "\n" + fs.readFileSync(path.join(ROOT, "site.css"), "utf8");
  const js = fs.readFileSync(path.join(ROOT, "nav.js"), "utf8") + "\n" + fs.readFileSync(path.join(ROOT, "site.js"), "utf8");
  return "<style data-site-nav-style>" + css + "</style>\n" +
    '<script type="application/json" id="site-nav-config">' + JSON.stringify(config) + "</script>\n" +
    "<script>" + js + "</script>";
}

function distSnippet(config) {
  const built = fs.readFileSync(path.join(ROOT, "dist", "site-wide-install.html"), "utf8");
  return built.replace(
    /(<script type="application\/json" id="site-nav-config">)[\s\S]*?(<\/script>)/,
    (_, open, close) => open + JSON.stringify(config) + close
  );
}

const HEADER_MODES = {
  // Part of the page flow, like most Squarespace 7.1 headers.
  normal: "#header{position:relative}",
  // Stays on screen while scrolling, drawn over the content.
  fixed: "#header{position:fixed;top:0;left:0;right:0}",
  // Transparent header laid over the first section.
  overlay: "#header{position:absolute;top:0;left:0;right:0;background:transparent}"
};

function pageHtml(url, footer) {
  const mode = url.searchParams.get("header") || "normal";
  const own = url.pathname === "/own-block"
    ? '<section class="page-section" id="own"><div class="sqs-block code-block"><div data-site-nav data-links=\'[{"label":"Own","url":"/own-block"}]\'></div></div></section>'
    : url.pathname.indexOf("/ministries/") === 0 ? LEGACY_BLOCK : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fake site</title>
<style>
  :root { --sqs-site-max-width: 1200px; --sqs-site-gutter: 40px; }
  body { margin: 0; font-family: sans-serif; }
  #header { height: 90px; background: #fff; z-index: 10; }
  ${HEADER_MODES[mode]}
  .page-section { min-height: 300px; padding: 40px 0; background: #eef; }
</style></head>
<body class="">
<div id="siteWrapper">
  <header id="header" class="header">Site name &middot; <a href="/new-page">New page</a> <a href="/cart">Cart</a></header>
  <main id="page" role="main">
    <article class="sections" id="sections">
      ${own}
      <section class="page-section" id="first"><div class="content-wrapper">First section</div></section>
      <section class="page-section" id="second" style="min-height:2000px">Second section</section>
    </article>
  </main>
</div>
${footer}
</body></html>`;
}

/* A browser context that serves the fake site, with whatever snippet is
   currently in Code Injection. */
async function site(browser, snippetFor, config) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const state = { config };
  await context.route("http://site.test/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/sitemap.xml") {
      return route.fulfill({ contentType: "application/xml", body: sitemap() });
    }
    const footer = state.raw || snippetFor(state.config);
    return route.fulfill({ contentType: "text/html", body: pageHtml(url, footer) });
  });
  return { context, state };
}

function barInfo() {
  const wrap = document.querySelector(".sn-site");
  if (!wrap) return null;
  const header = document.getElementById("header").getBoundingClientRect();
  const nav = wrap.querySelector(".sn-nav");
  return {
    parent: wrap.parentElement.id,
    next: wrap.nextElementSibling && wrap.nextElementSibling.id,
    top: Math.round(wrap.getBoundingClientRect().top + window.scrollY),
    headerBottom: Math.round(header.bottom + window.scrollY),
    title: nav && nav.querySelector(".sn-nav__title") ? nav.querySelector(".sn-nav__title").textContent : null,
    links: nav ? [...nav.querySelectorAll(".sn-nav__link")].map((a) => a.textContent) : [],
    current: nav && nav.querySelector("[aria-current=page]") ? nav.querySelector("[aria-current=page]").textContent : null
  };
}

async function waitForBar(page) {
  await page.waitForFunction("document.querySelectorAll('.sn-site .sn-nav__link').length > 0", null, { timeout: 5000 });
}

async function run(browser, label, snippetFor) {
  console.log("\n" + label);
  const { context, state } = await site(browser, snippetFor, CONFIG);
  const page = await context.newPage();

  /* ---- Where it goes ---- */
  await page.goto("http://site.test/watch-online");
  await waitForBar(page);
  let info = await page.evaluate(barInfo);
  check("placed inside #sections", info.parent, "sections");
  check("placed before the first section", info.next, "first");
  check("sits right under the header", info.top, info.headerBottom);
  check("label from the settings", info.title, "Watch Online");
  check("links from the settings", info.links, ["Live", "Sermons", "Podcast"]);
  check("current page marked", info.current, "Live");

  const look = await page.evaluate(() => {
    const nav = document.querySelector(".sn-site .sn-nav");
    return {
      titleTag: nav.querySelector(".sn-nav__title").tagName,
      fullWidth: Math.round(nav.getBoundingClientRect().width) === document.documentElement.clientWidth,
      innerMax: getComputedStyle(nav.querySelector(".sn-nav__inner")).maxWidth,
      bleed: getComputedStyle(nav, "::before").display,
      newTab: [...nav.querySelectorAll(".sn-nav__link")].find((a) => a.textContent === "Podcast").target
    };
  });
  check("site text style by default (real h4)", look.titleTag, "H4");
  check("bar spans the full page width", look.fullWidth, true);
  check("label and links line up with the site's content width", look.innerMax, "1200px");
  check("no 100vw background trick needed", look.bleed, "none");
  check("new tab link", look.newTab, "_blank");

  /* ---- Which pages get it ---- */
  await page.goto("http://site.test/about");
  await page.waitForTimeout(300);
  check("page not listed: no bar", await page.evaluate(barInfo), null);

  await page.goto("http://site.test/sermons/easter");
  await waitForBar(page);
  check("pattern /sermons/* covers a post", (await page.evaluate(barInfo)).title, "Watch Online");

  await page.goto("http://site.test/sermons/hidden");
  await page.waitForTimeout(300);
  check("a page switched off wins over the pattern", await page.evaluate(barInfo), null);

  await page.goto("http://site.test/Watch-Online/");
  await waitForBar(page);
  check("path matching ignores case and trailing slash", (await page.evaluate(barInfo)).current, "Live");

  await page.goto("http://site.test/give");
  await waitForBar(page);
  const give = await page.evaluate(() => {
    const nav = document.querySelector(".sn-site .sn-nav");
    return {
      bg: getComputedStyle(nav).backgroundColor,
      titleTag: nav.querySelector(".sn-nav__title").tagName,
      sticky: getComputedStyle(document.querySelector(".sn-site")).position
    };
  });
  check("per-bar colors", give.bg, "rgb(0, 17, 34)");
  check("plain text style", give.titleTag, "SPAN");
  check("sticky bar", give.sticky, "sticky");

  /* ---- Headers drawn over the content ---- */
  for (const mode of ["fixed", "overlay"]) {
    await page.goto("http://site.test/watch-online?header=" + mode);
    await waitForBar(page);
    info = await page.evaluate(barInfo);
    check(mode + " header: bar pushed down to clear it", info.top, 90);
  }

  await page.goto("http://site.test/give?header=fixed");
  await waitForBar(page);
  const stickTop = await page.evaluate(() =>
    getComputedStyle(document.querySelector(".sn-site")).top);
  check("fixed header: sticky bar sticks just under it", stickTop, "90px");

  /* ---- Phones ---- */
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto("http://site.test/watch-online");
  await waitForBar(page);
  const phone = await page.evaluate(() => getComputedStyle(document.querySelector(".sn-site .sn-nav__toggle")).display);
  check("phone: dropdown button shown", phone, "flex");
  await page.setViewportSize({ width: 1400, height: 900 });

  /* ---- A page with its own Code Block bar keeps that one ---- */
  await page.goto("http://site.test/own-block");
  await page.waitForFunction("document.querySelectorAll('.sn-nav__link').length > 0");
  await page.waitForTimeout(300);
  const own = await page.evaluate(() => ({
    site: !!document.querySelector(".sn-site"),
    links: [...document.querySelectorAll(".sn-nav__link")].map((a) => a.textContent)
  }));
  check("page's own Code Block bar wins, no second bar", own, { site: false, links: ["Own"] });

  /* ---- The editor ---- */
  await page.goto("http://site.test/watch-online");
  await waitForBar(page);
  await page.evaluate(() => document.body.classList.add("sqs-edit-mode"));
  await page.waitForTimeout(100);
  check("editor: bar taken off", await page.evaluate(() => !!document.querySelector(".sn-site")), false);
  await page.evaluate(() => document.body.classList.remove("sqs-edit-mode"));
  await waitForBar(page);
  check("editor closed: bar back", (await page.evaluate(barInfo)).next, "first");

  /* ---- Content swapped in without a reload (7.0 Ajax templates) ---- */
  await page.evaluate(() => {
    const sections = document.getElementById("sections");
    sections.innerHTML = '<section class="page-section" id="swapped">New page</section>';
  });
  await waitForBar(page);
  check("content replaced: bar re-added", (await page.evaluate(barInfo)).next, "swapped");

  /* ---- Setup panel ---- */
  await page.goto("http://site.test/about?sitenav-setup");
  const panelRows = await page.waitForFunction(() => {
    const host = document.querySelector("[data-sn-setup]");
    const rows = host && host.shadowRoot.querySelectorAll(".pages .pathname");
    return rows && rows.length ? [...rows].map((a) => a.textContent) : null;
  }, null, { timeout: 5000 });
  const rows = await panelRows.jsonValue();
  check("setup: lists every page in the sitemap", SITEMAP_PATHS.every((p) => rows.includes(p)), true);
  check("setup: lists patterns from the settings too", rows.includes("/sermons/*"), true);
  check("setup: lists pages in the site's menus that the sitemap doesn't have yet", rows.includes("/new-page"), true);
  check("setup: leaves out Squarespace's own non-page links", rows.includes("/cart"), false);
  check("setup: one list - no separate Bars/Pages tabs",
    await page.evaluate(() => document.querySelector("[data-sn-setup]").shadowRoot.querySelectorAll(".tabs").length), 0);

  const chipFor = (path) => page.evaluate((p) => {
    const root = document.querySelector("[data-sn-setup]").shadowRoot;
    const button = [...root.querySelectorAll(".pagebtn")].find((b) => b.querySelector(".pathname").textContent === p);
    return [...button.querySelectorAll(".chip")].map((c) => c.textContent);
  }, path);
  check("setup: each page shows its bar", await chipFor("/watch-online"), ["Watch Online"]);
  check("setup: a page covered by a pattern says so", await chipFor("/sermons/easter"), ["Watch Online (from /sermons/*)"]);

  // Find the bars already pasted into Code Blocks around the site: each one
  // is connected straight to the page it was found on.
  await page.evaluate(() => {
    const root = document.querySelector("[data-sn-setup]").shadowRoot;
    [...root.querySelectorAll("button")].find((b) => b.textContent === "Find bars already on the site").click();
  });
  await page.waitForFunction(() => {
    const m = document.querySelector("[data-sn-setup]").shadowRoot.querySelector(".msg");
    return m && /^Found/.test(m.textContent);
  }, null, { timeout: 10000 });
  const imported = await page.evaluate(() => JSON.parse(localStorage.getItem("sitenav-setup-draft")).config);
  check("find bars: brought in with every setting", imported.bars.ministries, {
    title: "Ministries",
    links: [{ label: "Youth", url: "/ministries/youth" }, { label: "Music", url: "/ministries/music", newTab: true }],
    phone: "swipe",
    boldLinks: true,
    colors: { bg: "#001122" },
    vars: { "--sn-height": "3rem" }
  });
  check("find bars: the same bar on two pages becomes one bar on both",
    [imported.pages["/ministries/youth"], imported.pages["/ministries/music"]], ["ministries", "ministries"]);
  check("find bars: the other page's bar connected to its page",
    imported.bars[imported.pages["/own-block"]].links.map((l) => l.label), ["Own"]);
  check("find bars: the page list shows it, marked as found", await chipFor("/ministries/youth"), ["Ministries", "found on page"]);

  // Click a page: the popup has a preview and the editor.
  const openPopup = (path) => page.evaluate((p) => {
    const root = document.querySelector("[data-sn-setup]").shadowRoot;
    [...root.querySelectorAll(".pagebtn")].find((b) => b.querySelector(".pathname").textContent === p).click();
  }, path);
  await openPopup("/ministries/youth");
  const popup = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 200));
    const root = document.querySelector("[data-sn-setup]").shadowRoot;
    const modal = root.querySelector(".modal");
    return {
      title: modal.querySelector("h2").textContent,
      chosen: modal.querySelector("select").selectedOptions[0].textContent,
      preview: [...modal.querySelectorAll(".pv .sn-nav__link")].map((a) => a.textContent),
      previewBg: getComputedStyle(modal.querySelector(".pv .sn-nav")).backgroundColor,
      shared: !!modal.querySelector(".note"),
      label: modal.querySelector(".mbody input[type=text]").value
    };
  });
  check("popup: opens for the page clicked", popup.title, "/ministries/youth");
  check("popup: shows the page's bar", popup.chosen, "Ministries");
  check("popup: previews the bar for real", popup.preview, ["Youth", "Music"]);
  check("popup: preview uses the bar's own colors", popup.previewBg, "rgb(0, 17, 34)");
  check("popup: says the bar is shared with another page", popup.shared, true);
  check("popup: editor is right there", popup.label, "Ministries");

  // Edit the label in the popup: the preview follows.
  await page.evaluate(() => {
    const input = document.querySelector("[data-sn-setup]").shadowRoot.querySelector(".mbody input[type=text]");
    input.value = "Our Ministries";
    input.dispatchEvent(new Event("input"));
  });
  await page.waitForTimeout(100);
  check("popup: editing updates the preview", await page.evaluate(() =>
    document.querySelector("[data-sn-setup]").shadowRoot.querySelector(".pv .sn-nav__title").textContent), "Our Ministries");

  // Separate copy just for this page.
  await page.evaluate(() => {
    const root = document.querySelector("[data-sn-setup]").shadowRoot;
    [...root.querySelectorAll("button")].find((b) => b.textContent === "Make a separate copy for this page").click();
  });
  const split = await page.evaluate(() => JSON.parse(localStorage.getItem("sitenav-setup-draft")).config.pages);
  check("popup: a separate copy leaves the other page alone",
    split["/ministries/youth"] !== split["/ministries/music"] && split["/ministries/music"] === "ministries", true);
  await page.evaluate(() => {
    const root = document.querySelector("[data-sn-setup]").shadowRoot;
    [...root.querySelectorAll("button")].find((b) => b.textContent === "Done").click();
  });

  // This page: pick a bar from the popup.
  await page.evaluate(() => {
    const root = document.querySelector("[data-sn-setup]").shadowRoot;
    [...root.querySelectorAll("button")].find((b) => b.textContent === "Edit this page's bar").click();
    const select = root.querySelector(".modal select");
    select.value = "watch";
    select.dispatchEvent(new Event("change"));
  });
  await waitForBar(page);
  check("setup: previews the bar on this page straight away", (await page.evaluate(barInfo)).title, "Watch Online");

  // The panel follows you to another page in the same tab.
  await page.goto("http://site.test/give");
  await page.waitForSelector("[data-sn-setup]", { state: "attached" });
  check("setup: stays open on the next page", await page.evaluate(() => !!document.querySelector("[data-sn-setup]")), true);

  // Get the code to paste back into Code Injection.
  const code = await page.evaluate(() => {
    const root = document.querySelector("[data-sn-setup]").shadowRoot;
    [...root.querySelectorAll("button")].find((b) => b.textContent === "Publish\u2026").click();
    return root.querySelector("textarea").value;
  });
  check("setup: hands back the whole snippet", code.startsWith("<!-- Secondary navigation bar: start -->"), true);
  check("setup: snippet includes the change", code.includes('"/about": "watch"'), true);

  // Paste it in, as a fresh visitor: the change is live.
  const fresh = await site(browser, snippetFor, CONFIG);
  fresh.state.raw = code;
  const visitor = await fresh.context.newPage();
  await visitor.goto("http://site.test/about");
  await waitForBar(visitor);
  check("round trip: pasted snippet shows the bar on the new page", (await visitor.evaluate(barInfo)).title, "Watch Online");
  await visitor.goto("http://site.test/give");
  await waitForBar(visitor);
  check("round trip: other pages unchanged", (await visitor.evaluate(barInfo)).title, "Give");
  await fresh.context.close();

  await context.close();
}

async function main() {
  const browser = await chromium.launch(LAUNCH);

  await run(browser, "Site-wide install (source files)", sourceSnippet);

  if (fs.existsSync(path.join(ROOT, "dist", "site-wide-install.html"))) {
    await run(browser, "Site-wide install (dist/site-wide-install.html, what gets pasted)", distSnippet);
  } else {
    console.log("  skip  built snippet checks (run `npm run build` first)");
  }

  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll site-wide checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
