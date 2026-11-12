/* ==========================================================================
   Checks the Save button: the settings page, the settings service
   (worker/worker.js), and the site reading what was saved.

   Run it with:  npm test   (after npm run build)

   The worker runs right here in Node against an in-memory stand-in for
   Cloudflare KV, and the browser's requests to it are routed to it - so the
   real worker code and the real built snippet are what's being tested.
   ========================================================================== */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const LAUNCH = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const SITE = "http://site.test";
const SERVICE = "https://settings.test";
const PASSWORD = "correct horse battery staple";

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

function makeEnv() {
  const store = new Map();
  return {
    store,
    ADMIN_PASSWORD: PASSWORD,
    ALLOWED_ORIGINS: SITE + ", https://www.example.org",
    SITE_NAV: {
      get: async (key) => (store.has(key) ? store.get(key) : null),
      put: async (key, value) => { store.set(key, value); }
    }
  };
}

async function workerChecks(worker) {
  console.log("\nSettings service (worker/worker.js)");
  const env = makeEnv();
  const call = (method, body, headers) => worker.fetch(new Request(SERVICE + "/config", {
    method,
    headers: Object.assign({ Origin: SITE, "Content-Type": "application/json" }, headers || {}),
    body: body === undefined ? undefined : JSON.stringify(body)
  }), env);
  const auth = { Authorization: "Bearer " + PASSWORD };
  const config = { bars: { a: { title: "A", links: [{ label: "x", url: "/x" }] } }, pages: { "/x": "a" } };

  let res = await call("GET");
  check("GET before anything is saved: empty, version 0", (await res.json()).version, 0);

  res = await call("OPTIONS");
  check("preflight allowed", res.status, 204);

  res = await call("PUT", { baseVersion: 0, config });
  check("save without a password: refused", res.status, 401);

  res = await call("PUT", { baseVersion: 0, config }, { Authorization: "Bearer wrong" });
  check("save with the wrong password: refused", res.status, 401);

  res = await worker.fetch(new Request(SERVICE + "/config", {
    method: "PUT", headers: Object.assign({ Origin: "https://evil.test" }, auth), body: JSON.stringify({ baseVersion: 0, config })
  }), env);
  check("save from another site: refused, even with the password", res.status, 403);

  res = await call("PUT", { baseVersion: 0, config: { pages: {} } }, auth);
  check("save with malformed settings: refused", res.status, 400);

  res = await call("PUT", { baseVersion: 0, config }, auth);
  const saved = await res.json();
  check("save: accepted", res.status, 200);
  check("save: version goes up", saved.version, 1);

  res = await call("GET");
  check("GET returns what was saved", (await res.json()).config.pages, { "/x": "a" });

  res = await call("PUT", { baseVersion: 0, config }, auth);
  const conflict = await res.json();
  check("save from an out-of-date copy: refused as a conflict", res.status, 409);
  check("conflict hands back the current settings", conflict.current.version, 1);

  res = await call("PUT", { baseVersion: 0, force: true, config }, auth);
  check("save over a conflict on purpose: accepted", (await res.json()).version, 2);
}

/* ---- The browser side ---- */

const HEADER_CSS = "#header{height:90px;position:relative}";

function snippet(inline) {
  const built = fs.readFileSync(path.join(ROOT, "dist", "site-wide-install.html"), "utf8");
  return built.replace(
    /(<script type="application\/json" id="site-nav-config">)[\s\S]*?(<\/script>)/,
    (_, open, close) => open + JSON.stringify(inline) + close
  );
}

function pageHtml(url, footer) {
  const body = url.pathname === "/settings"
    ? '<section class="page-section" id="first"><div class="sqs-block code-block"><div data-site-nav-admin></div></div></section>'
    : '<section class="page-section" id="first">Content</section>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0}${HEADER_CSS}.page-section{min-height:200px}</style></head>
<body><header id="header">Header</header><main id="page"><article id="sections">${body}</article></main>${footer}</body></html>`;
}

async function site(browser, worker, env, options) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const opts = Object.assign({ inline: { source: SERVICE, bars: {}, pages: {} }, down: false }, options);
  await context.route(SITE + "/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/sitemap.xml") {
      return route.fulfill({ contentType: "application/xml", body: "<urlset>" + ["/", "/settings", "/watch-online", "/sermons"].map((p) => "<url><loc>" + SITE + p + "</loc></url>").join("") + "</urlset>" });
    }
    return route.fulfill({ contentType: "text/html", body: pageHtml(url, opts.footer || snippet(opts.inline)) });
  });
  await context.route(SERVICE + "/**", async (route) => {
    if (opts.down) return route.fulfill({ status: 503, body: "down" });
    const req = route.request();
    const headers = Object.assign({}, req.headers());
    const response = await worker.fetch(new Request(req.url(), {
      method: req.method(),
      headers,
      body: ["GET", "OPTIONS"].includes(req.method()) ? undefined : req.postData()
    }), env);
    const out = {};
    response.headers.forEach((v, k) => { out[k] = v; });
    return route.fulfill({ status: response.status, headers: out, body: response.status === 204 ? "" : await response.text() });
  });
  return { context, opts };
}

async function message(page) {
  await page.waitForFunction(() => {
    const m = document.querySelector("[data-sn-setup]").shadowRoot.querySelector(".msg");
    return m && m.textContent;
  }, null, { timeout: 5000 });
  return page.evaluate(() => document.querySelector("[data-sn-setup]").shadowRoot.querySelector(".msg").textContent);
}

async function openSettings(page) {
  await page.goto(SITE + "/settings");
  await page.waitForFunction(() => {
    const host = document.querySelector("[data-site-nav-admin] [data-sn-setup]");
    return host && host.shadowRoot.querySelectorAll(".pages .pagebtn").length > 0 &&
      !/Loading/.test(host.shadowRoot.querySelector(".foot").textContent);
  }, null, { timeout: 5000 });
}

/* Opens the popup for a page, does something in it, and clicks Done. */
async function inPopup(page, path, fn, arg) {
  await page.evaluate((p) => {
    const root = document.querySelector("[data-sn-setup]").shadowRoot;
    [...root.querySelectorAll(".pagebtn")].find((b) => b.querySelector(".pathname").textContent === p).click();
  }, path);
  const result = await page.evaluate(fn, arg);
  await page.evaluate(() => {
    const root = document.querySelector("[data-sn-setup]").shadowRoot;
    const done = [...root.querySelectorAll("button")].find((b) => b.textContent === "Done");
    if (done) done.click();
  });
  return result;
}

/* Puts a new bar on /watch-online, with one link. Returns the preview's label. */
async function makeBar(page, title) {
  return inPopup(page, "/watch-online", async (t) => {
    const root = document.querySelector("[data-sn-setup]").shadowRoot;
    const type = (el, v) => { el.value = v; el.dispatchEvent(new Event("input")); };
    const select = root.querySelector(".modal select");
    select.value = "#new";
    select.dispatchEvent(new Event("change"));
    const modal = root.querySelector(".modal");
    type(modal.querySelector(".mbody input[type=text]"), t);
    const link = modal.querySelector(".link");
    type(link.querySelectorAll("input[type=text]")[0], "Live");
    type(link.querySelectorAll("input[type=text]")[1], "/watch-online");
    await new Promise((r) => setTimeout(r, 200));
    const shown = root.querySelector(".pv .sn-nav__title");
    return shown && shown.textContent;
  }, title);
}

async function setTitle(page, title) {
  await inPopup(page, "/watch-online", (t) => {
    const input = document.querySelector("[data-sn-setup]").shadowRoot.querySelector(".mbody input[type=text]");
    input.value = t;
    input.dispatchEvent(new Event("input"));
  }, title);
}

async function save(page, password) {
  await page.evaluate((pw) => {
    const root = document.querySelector("[data-sn-setup]").shadowRoot;
    const input = root.querySelector(".foot input[type=password]");
    if (input) input.value = pw;
    [...root.querySelectorAll(".foot button")].find((b) => b.textContent === "Save").click();
  }, password);
  return message(page);
}

async function barTitle(page, url) {
  await page.goto(url);
  try {
    await page.waitForFunction("document.querySelectorAll('.sn-site .sn-nav__link').length > 0", null, { timeout: 2000 });
  } catch (error) {
    return null;
  }
  return page.evaluate(() => document.querySelector(".sn-site .sn-nav__title").textContent);
}

async function browserChecks(worker) {
  console.log("\nSettings page and Save (dist/site-wide-install.html)");
  const browser = await chromium.launch(LAUNCH);
  const env = makeEnv();

  const visitor0 = await site(browser, worker, env);
  const v0 = await visitor0.context.newPage();
  check("nothing saved yet: no bar", await barTitle(v0, SITE + "/watch-online"), null);
  await visitor0.context.close();

  /* ---- Admin makes a bar and saves ---- */
  const admin = await site(browser, worker, env);
  const page = await admin.context.newPage();
  await openSettings(page);
  const layout = await page.evaluate(() => {
    const host = document.querySelector("[data-sn-setup]");
    const panel = host.shadowRoot.querySelector(".panel");
    return { inPage: !!host.closest("[data-site-nav-admin]"), position: getComputedStyle(panel).position };
  });
  check("settings page: panel sits in the page, not over it", layout, { inPage: true, position: "relative" });

  const previewTitle = await makeBar(page, "Watch Online");
  check("settings page: the page's popup previews the bar being edited", previewTitle, "Watch Online");

  check("wrong password: says so", await save(page, "nope"), "That password wasn't right.");
  check("wrong password: nothing saved", env.store.has("config"), false);

  const ok = await save(page, PASSWORD);
  check("save: confirms it's live", /^Saved/.test(ok), true);
  const stored = JSON.parse(env.store.get("config"));
  check("save: settings stored", stored.config.pages, { "/watch-online": "bar-1" });
  check("save: no code to paste", await page.evaluate(() => !document.querySelector("[data-sn-setup]").shadowRoot.querySelector("textarea")), true);

  /* ---- A brand new visitor sees it ---- */
  const visitor = await site(browser, worker, env);
  const vp = await visitor.context.newPage();
  check("new visitor: bar shows on the chosen page", await barTitle(vp, SITE + "/watch-online"), "Watch Online");
  check("new visitor: not on other pages", await barTitle(vp, SITE + "/sermons"), null);

  /* ---- Service down: a returning visitor still gets the bar ---- */
  visitor.opts.down = true;
  check("service down: returning visitor still sees the bar (cached)", await barTitle(vp, SITE + "/watch-online"), "Watch Online");
  await visitor.context.close();

  /* ---- Two people editing at once ---- */
  const other = await site(browser, worker, env);
  const op = await other.context.newPage();
  await openSettings(op);

  await setTitle(page, "Watch Online Now");
  check("first editor saves", /^Saved/.test(await save(page, PASSWORD)), true);

  await setTitle(op, "Watch Live");
  check("second editor's stale save: warned, not overwritten", await save(op, PASSWORD), "Someone else saved changes after you opened these settings.");
  check("second editor's stale save: first editor's change kept",
    JSON.parse(env.store.get("config")).config.bars["bar-1"].title, "Watch Online Now");

  await op.evaluate(() => {
    const root = document.querySelector("[data-sn-setup]").shadowRoot;
    [...root.querySelectorAll("button")].find((b) => b.textContent === "Save mine over theirs").click();
  });
  await op.waitForFunction(() => /^Saved/.test(document.querySelector("[data-sn-setup]").shadowRoot.querySelector(".msg")?.textContent || ""), null, { timeout: 5000 });
  check("second editor saves over it on purpose", JSON.parse(env.store.get("config")).config.bars["bar-1"].title, "Watch Live");

  const later = await site(browser, worker, env);
  const lp = await later.context.newPage();
  check("visitors get the latest save", await barTitle(lp, SITE + "/watch-online"), "Watch Live");

  /* ---- An old copy of the snippet left in Code Injection, and the
         address typed without https:// - still connects ---- */
  const messy = await site(browser, worker, env, {
    footer: snippet({ bars: {}, pages: {} }) + "\n" + snippet({ source: "settings.test/", bars: {}, pages: {} })
  });
  const mp = await messy.context.newPage();
  // Something else on the page defines a global with the same name.
  await mp.addInitScript(() => { window.SiteNavConfig = { somethingElse: true }; });
  await openSettings(mp);
  const mode = await mp.evaluate(() => {
    const root = document.querySelector("[data-sn-setup]").shadowRoot;
    const labels = [...root.querySelectorAll(".foot button")].map((b) => b.textContent);
    return { password: labels.includes("Save"), code: labels.some((l) => /Publish/.test(l)) };
  });
  check("old copy left behind + bare address: still gets the Save button, no code", mode, { password: true, code: false });
  check("old copy left behind: visitors still get the saved bar", await barTitle(mp, SITE + "/watch-online"), "Watch Live");

  await browser.close();
}

async function main() {
  const worker = (await import(path.join(ROOT, "worker", "worker.js"))).default;
  await workerChecks(worker);
  if (fs.existsSync(path.join(ROOT, "dist", "site-wide-install.html"))) {
    await browserChecks(worker);
  } else {
    console.log("  skip  browser checks (run `npm run build` first)");
  }
  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll save checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
