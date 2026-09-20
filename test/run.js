/* ==========================================================================
   Checks the parts of nav.js the Squarespace install depends on.

   Run it with:  npm test

   It loads test/fixture.html in a real browser, because the thing being tested
   is how the script reads markup that Squarespace produced - a DOM stub would
   not tell us much.
   ========================================================================== */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const FIXTURE = "file://" + path.join(__dirname, "fixture.html");

/* Some environments ship a Chromium that does not match the version Playwright
   would download for itself. Point CHROMIUM_PATH at it in that case. */
const LAUNCH = process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH }
  : {};

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

async function main() {
  const browser = await chromium.launch(LAUNCH);

  /* ---- The live site: bars get built ---- */
  const page = await browser.newPage();
  await page.goto(FIXTURE);
  await page.waitForFunction("document.querySelectorAll('.sn-nav__link').length > 0");

  const native = await page.evaluate(() => {
    const el = document.querySelector("#case-native [data-site-nav]");
    return {
      title: el.querySelector(".sn-nav__title").textContent,
      links: [...el.querySelectorAll(".sn-nav__link")].map((a) => ({
        label: a.textContent,
        href: a.getAttribute("href"),
        newTab: a.target === "_blank"
      })),
      sourceHidden:
        document.querySelector("#case-native .html-block").getAttribute("data-sn-source"),
      titleIsHeading: el.querySelector(".sn-nav__title").tagName
    };
  });

  check("native: label read from the heading", native.title, "Watch Online");
  check("native: links read from the list", native.links, [
    { label: "Worship Services", href: "/worship-services", newTab: false },
    { label: "Memorial Services", href: "/memorial-services", newTab: false },
    { label: "Give", href: "https://example.org/give", newTab: true }
  ]);
  check("native: javascript: link dropped", native.links.length, 3);
  check("native: source block hidden", native.sourceHidden, "hidden");
  check("native: label rendered as the site's h4", native.titleIsHeading, "H4");

  const attrs = await page.evaluate(() => {
    const el = document.querySelector("#case-attrs [data-site-nav]");
    return {
      title: el.querySelector(".sn-nav__title").textContent,
      labels: [...el.querySelectorAll(".sn-nav__link")].map((a) => a.textContent)
    };
  });
  check("code block: title still works", attrs.title, "Give");
  check("code block: links still work", attrs.labels, ["One Time", "Recurring"]);

  const bystanders = await page.evaluate(() => {
    const el = document.querySelector("#case-bystanders [data-site-nav]");
    return {
      title: el.querySelector(".sn-nav__title").textContent,
      labels: [...el.querySelectorAll(".sn-nav__link")].map((a) => a.textContent),
      listHidden: document.getElementById("the-list").getAttribute("data-sn-source"),
      headingHidden: document.getElementById("unrelated-heading").getAttribute("data-sn-source"),
      buttonHidden: document.getElementById("unrelated-button").getAttribute("data-sn-source")
    };
  });
  check("bystanders: label comes from the list's own block", bystanders.title, "Ministries");
  check("bystanders: button not harvested", bystanders.labels, ["Youth", "Music"]);
  check("bystanders: list block hidden", bystanders.listHidden, "hidden");
  check("bystanders: unrelated heading left alone", bystanders.headingHidden, null);
  check("bystanders: unrelated button left alone", bystanders.buttonHidden, null);

  const fallback = await page.evaluate(() => ({
    marker: document.documentElement.classList.contains("sn-js"),
    version: window.SiteNav.version
  }));
  check("fallback class added", fallback.marker, true);
  check("version exposed", typeof fallback.version, "number");

  /* ---- The editor: the page must be left completely alone ---- */
  const editing = await browser.newPage();
  await editing.addInitScript(() => {
    // Squarespace marks the editor on <body>; set it before nav.js runs.
    document.addEventListener("readystatechange", () => {
      if (document.body) document.body.classList.add("sqs-edit-mode");
    });
  });
  await editing.goto(FIXTURE);
  await editing.waitForLoadState("load");

  const inEditor = await editing.evaluate(() => ({
    barsBuilt: document.querySelectorAll(".sn-nav__link").length,
    listStillVisible: !document.querySelector("#case-native .html-block")
      .hasAttribute("data-sn-source")
  }));
  check("editor: no bars built", inEditor.barsBuilt, 0);
  check("editor: the link list is left visible", inEditor.listStillVisible, true);

  /* ---- Site-wide settings from the Code Injection block ---- */
  const configured = await browser.newPage();
  await configured.addInitScript(() => {
    window.SiteNavConfig = {
      defaults: { phone: "swipe", style: "--sn-bg:#001122", boldLinks: true }
    };
  });
  await configured.goto(FIXTURE);
  await configured.waitForFunction("document.querySelectorAll('.sn-nav__link').length > 0");

  const applied = await configured.evaluate(() => {
    const el = document.querySelector("#case-native [data-site-nav]");
    return {
      phone: el.getAttribute("data-phone"),
      bold: el.getAttribute("data-bold-links"),
      bg: getComputedStyle(el).backgroundColor
    };
  });
  check("settings: phone layout applied", applied.phone, "swipe");
  check("settings: bold applied", applied.bold, "true");
  check("settings: colors applied", applied.bg, "rgb(0, 17, 34)");

  /* ---- The same fixture, but running the minified files that actually get
         pasted into Squarespace. This is the artifact being shipped, so a
         minifier that broke something needs to fail the build, not the site. ---- */
  const distDir = path.join(__dirname, "..", "dist");
  if (fs.existsSync(path.join(distDir, "site-nav.all-in-one.html"))) {
    const bundle = fs.readFileSync(path.join(distDir, "site-nav.all-in-one.html"), "utf8");
    const source = fs.readFileSync(path.join(__dirname, "fixture.html"), "utf8");

    // Swap the two source files for the one built bundle.
    const built = source
      .replace('<link rel="stylesheet" href="../nav.css">', "")
      .replace('<script src="../nav.js"></script>', bundle);

    const builtPath = path.join(__dirname, ".fixture-dist.html");
    fs.writeFileSync(builtPath, built);

    const dist = await browser.newPage();
    await dist.goto("file://" + builtPath);
    await dist.waitForFunction("document.querySelectorAll('.sn-nav__link').length > 0");

    const result = await dist.evaluate(() => {
      const el = document.querySelector("#case-native [data-site-nav]");
      const list = document.querySelector("#case-native .html-block");
      return {
        title: el.querySelector(".sn-nav__title").textContent,
        titleTag: el.querySelector(".sn-nav__title").tagName,
        links: [...el.querySelectorAll(".sn-nav__link")].map((a) => a.textContent),
        sourceGone: getComputedStyle(list).display,
        bars: document.querySelectorAll(".sn-nav__inner").length
      };
    });

    check("minified: label read", result.title, "Watch Online");
    check("minified: heading level kept", result.titleTag, "H4");
    check("minified: links read", result.links, [
      "Worship Services", "Memorial Services", "Give"
    ]);
    check("minified: source list hidden by the stylesheet", result.sourceGone, "none");
    check("minified: every bar built", result.bars, 3);

    fs.unlinkSync(builtPath);
  } else {
    console.log("  skip  minified checks (run `npm run build` first)");
  }

  await browser.close();

  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
