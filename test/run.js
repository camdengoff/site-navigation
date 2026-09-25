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

  /* ---- The live site: bars get built from their own attributes ---- */
  const page = await browser.newPage();
  await page.goto(FIXTURE);
  await page.waitForFunction("document.querySelectorAll('.sn-nav__link').length > 0");

  const attrs = await page.evaluate(() => {
    const el = document.querySelector("#case-attrs [data-site-nav]");
    return {
      title: el.querySelector(".sn-nav__title").textContent,
      titleTag: el.querySelector(".sn-nav__title").tagName,
      labels: [...el.querySelectorAll(".sn-nav__link")].map((a) => a.textContent),
      bg: getComputedStyle(el).backgroundColor
    };
  });
  check("attrs: title read", attrs.title, "Give");
  check("attrs: title rendered as its own heading tag", attrs.titleTag, "H4");
  check("attrs: links read", attrs.labels, ["One Time", "Recurring"]);
  check("attrs: its own color applied", attrs.bg, "rgb(0, 17, 34)");

  const options = await page.evaluate(() => {
    const el = document.querySelector("#case-options [data-site-nav]");
    return {
      labels: [...el.querySelectorAll(".sn-nav__link")].map((a) => a.textContent),
      linkCount: el.querySelectorAll(".sn-nav__link").length,
      newTab: [...el.querySelectorAll(".sn-nav__link")]
        .find((a) => a.textContent === "Music").target,
      phone: el.getAttribute("data-phone"),
      titleBold: getComputedStyle(el.querySelector(".sn-nav__title")).fontWeight,
      linkBold: getComputedStyle(el.querySelector(".sn-nav__link")).fontWeight,
      // The page's own h4/p rules (see fixture.html) are red and !important -
      // these must come out as the bar's own default colors, not red.
      titleColor: getComputedStyle(el.querySelector(".sn-nav__title")).color,
      linkColor: getComputedStyle(el.querySelector(".sn-nav__link")).color
    };
  });
  check("options: javascript: link dropped", options.linkCount, 2);
  check("options: links read", options.labels, ["Youth", "Music"]);
  check("options: new tab applied", options.newTab, "_blank");
  check("options: phone layout applied", options.phone, "swipe");
  check("options: bold label applied despite the page's own h4 weight", options.titleBold, "700");
  check("options: bold links applied despite the page's own p color", options.linkBold, "700");
  check("options: title color wins over the page's own h4 color", options.titleColor, "rgb(17, 17, 17)");
  check("options: link color matches the label's color (same base, same opacity)", options.linkColor, "rgb(17, 17, 17)");

  await page.hover("#case-options .sn-nav__link");
  await page.waitForTimeout(250); // let the color transition finish before reading it
  const hoverColor = await page.evaluate(() =>
    getComputedStyle(document.querySelector("#case-options .sn-nav__link")).color
  );
  check("options: hover color overrides to its own picked color", hoverColor, "rgb(0, 0, 255)");

  const fullBleed = await page.evaluate(() => {
    const wrapper = document.querySelector("#case-fullbleed");
    const engine = document.querySelector("#case-fullbleed .fluid-engine");
    const el = document.querySelector("#case-fullbleed [data-site-nav]");
    return {
      wrapperWidth: wrapper.getBoundingClientRect().width,
      barWidth: el.getBoundingClientRect().width,
      backgroundWidth: parseFloat(getComputedStyle(el, "::before").width),
      // The width check above only proves the pseudo-element's own intended
      // size, not whether a clipping ancestor actually lets it show - that's
      // a paint-time effect getComputedStyle can't see. What overflow
      // .fluid-engine itself resolves to is the real test: Squarespace ships
      // it as overflow: clip (set inline here, same as the real site), and
      // our :has() rule needs to override that back to visible or the
      // background never reaches past the section's own edge in practice.
      engineOverflow: getComputedStyle(engine).overflow
    };
  });
  check("fullbleed: wrapper stays narrow", fullBleed.wrapperWidth, 300);
  check("fullbleed: bar itself stays inside the wrapper", fullBleed.barWidth <= 300, true);
  check("fullbleed: background escapes the wrapper", fullBleed.backgroundWidth > 300, true);
  check("fullbleed: overrides the Fluid Engine section's own clip", fullBleed.engineOverflow, "visible");

  const measure = (id) => {
    const section = document.querySelector(id);
    return {
      sectionHeight: section.getBoundingClientRect().height,
      engineHeight: section.querySelector(".fluid-engine").getBoundingClientRect().height,
      barHeight: section.querySelector("[data-site-nav]").getBoundingClientRect().height
    };
  };
  const shrink = await page.evaluate(measure, "#case-shrink");
  // Without the override this section is at least 300px tall (its own
  // min-height), with a 7-row grid plus gaps and padding around the bar -
  // the white gap reported on the real site. Every one of those has to go,
  // so the grid and the whole section end up exactly the bar's own height.
  check("shrink: bar still rendered", shrink.barHeight > 20, true);
  check("shrink: grid is exactly the bar's height", Math.round(shrink.engineHeight), Math.round(shrink.barHeight));
  check("shrink: section is exactly the bar's height", Math.round(shrink.sectionHeight), Math.round(shrink.barHeight));

  // Heights are fitted as "auto", not a measured number, so opening the
  // phone dropdown still grows the section instead of being cut off.
  await page.setViewportSize({ width: 400, height: 800 });
  await page.click("#case-shrink .sn-nav__toggle");
  const opened = await page.evaluate(measure, "#case-shrink");
  check("shrink: open dropdown makes the bar taller", opened.barHeight > shrink.barHeight, true);
  check("shrink: section grows with the open dropdown", Math.round(opened.sectionHeight), Math.round(opened.barHeight));
  await page.click("#case-shrink .sn-nav__toggle");
  await page.setViewportSize({ width: 1280, height: 800 });

  const shared = await page.evaluate(measure, "#case-shared");
  // 6 x 24px + 5 x 11px = 199px - untouched because another block shares it.
  check("shrink: left alone when another block shares the section", Math.round(shared.engineHeight), 199);
  check("shrink: shared section keeps its own min-height", shared.sectionHeight >= 300, true);

  const version = await page.evaluate(() => typeof window.SiteNav.version);
  check("version exposed", version, "number");

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

  const barsBuilt = await editing.evaluate(() => document.querySelectorAll(".sn-nav__link").length);
  check("editor: no bars built", barsBuilt, 0);

  // The editor's drag handles expect Squarespace's own row sizing.
  const editorGrid = await editing.evaluate(() =>
    document.querySelector("#case-shrink .fluid-engine").getBoundingClientRect().height);
  check("editor: shrink leaves the grid alone", editorGrid > 200, true);

  /* ---- The same fixture, but running the minified files that actually get
         pasted into Squarespace. This is the artifact being shipped, so a
         minifier that broke something needs to fail the build, not the site. ---- */
  const distDir = path.join(__dirname, "..", "dist");
  const cssPath = path.join(distDir, "site-nav.custom-css.css");
  const jsPath = path.join(distDir, "site-nav.engine.js");
  if (fs.existsSync(cssPath) && fs.existsSync(jsPath)) {
    const css = fs.readFileSync(cssPath, "utf8");
    const js = fs.readFileSync(jsPath, "utf8");
    const source = fs.readFileSync(path.join(__dirname, "fixture.html"), "utf8");

    // Swap the linked source files for the built, minified ones - the same
    // <style>+<script> shape the builder folds into its generated code.
    const built = source
      .replace('<link rel="stylesheet" href="../nav.css">', "<style>" + css + "</style>")
      .replace('<script src="../nav.js"></script>', "<script>" + js + "</script>");

    const builtPath = path.join(__dirname, ".fixture-dist.html");
    fs.writeFileSync(builtPath, built);

    const dist = await browser.newPage();
    await dist.goto("file://" + builtPath);
    await dist.waitForFunction("document.querySelectorAll('.sn-nav__link').length > 0");

    const result = await dist.evaluate(() => {
      const el = document.querySelector("#case-attrs [data-site-nav]");
      return {
        title: el.querySelector(".sn-nav__title").textContent,
        titleTag: el.querySelector(".sn-nav__title").tagName,
        links: [...el.querySelectorAll(".sn-nav__link")].map((a) => a.textContent),
        bars: document.querySelectorAll(".sn-nav__inner").length
      };
    });

    check("minified: title read", result.title, "Give");
    check("minified: heading tag kept", result.titleTag, "H4");
    check("minified: links read", result.links, ["One Time", "Recurring"]);
    check("minified: every bar built", result.bars, 5);

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
