/* ==========================================================================
   Build the minified engine
   --------------------------------------------------------------------------
   Turns nav.css and nav.js into the two minified files the builder fetches
   and folds into the single self-contained snippet you paste into a Code
   Block on each page - CSS and JS included, so nothing loads from anywhere
   else once that snippet is on the page.

   Run it with:  npm install && npm run build

   It writes into dist/:
     site-nav.custom-css.css   -> the stylesheet, minified
     site-nav.engine.js        -> the script, minified
   ========================================================================== */

const fs = require("fs");
const path = require("path");
const CleanCSS = require("clean-css");
const { minify } = require("terser");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function write(file, contents) {
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, file), contents);
  const kb = (Buffer.byteLength(contents) / 1024).toFixed(1);
  console.log(`  dist/${file}  ${kb} KB`);
}

async function build() {
  const css = new CleanCSS({ level: 2 }).minify(read("nav.css"));
  if (css.errors.length) throw new Error(css.errors.join("\n"));
  css.warnings.forEach((w) => console.warn("  css warning: " + w));

  const js = await minify(read("nav.js"), { compress: true, mangle: true, format: { ascii_only: true } });
  if (!js.code) throw new Error("terser produced no output");

  /* Guard against a minifier quietly dropping something the embed depends
     on - easy to lose silently and hard to notice until a page's bar breaks. */
  const checks = [
    [css.styles, ".sn-nav", "the bar's own styles in nav.css"],
    [js.code, "data-site-nav", "the marker attribute in nav.js"]
  ];
  for (const [haystack, needle, what] of checks) {
    if (!haystack.includes(needle)) {
      throw new Error(`Minifying dropped ${what} (looked for "${needle}")`);
    }
  }

  console.log("Building the engine...");

  write("site-nav.custom-css.css", css.styles + "\n");
  write("site-nav.engine.js", js.code + "\n");

  const total = Buffer.byteLength(css.styles) + Buffer.byteLength(js.code);
  console.log(`\nEngine total: ${(total / 1024).toFixed(1)} KB minified.`);

  await buildSiteWide();
}

/* The site-wide install: the same engine plus site.js, pasted once into
   Settings -> Advanced -> Code Injection -> Footer instead of into a Code
   Block on each page. Writes the ready-to-paste snippet too. */
async function buildSiteWide() {
  const css = new CleanCSS({ level: 2 }).minify(read("nav.css") + "\n" + read("site.css"));
  if (css.errors.length) throw new Error(css.errors.join("\n"));

  const js = await minify(read("nav.js") + "\n" + read("site.js"), { compress: true, mangle: true, format: { ascii_only: true } });
  if (!js.code) throw new Error("terser produced no output");

  const checks = [
    [css.styles, ".sn-site", "the site-wide wrapper styles in site.css"],
    [js.code, "site-nav-config", "the settings block id in site.js"],
    [js.code, "sitenav-setup", "the setup panel switch in site.js"]
  ];
  for (const [haystack, needle, what] of checks) {
    if (!haystack.includes(needle)) {
      throw new Error(`Minifying dropped ${what} (looked for "${needle}")`);
    }
  }
  // It goes inline in a <script> tag, so it must never contain anything that
  // would end that tag early.
  if (/<\/script|<!--/i.test(js.code)) {
    throw new Error("The site-wide script contains </script or <!--, which would break it inline");
  }

  const empty = '{\n  "source": "",\n  "bars": {},\n  "pages": {}\n}';
  const snippet = [
    "<!-- Secondary navigation bar: start -->",
    "<style data-site-nav-style>" + css.styles + "</style>",
    '<script type="application/json" id="site-nav-config">\n' + empty + "\n</script>",
    "<script>" + js.code + "</script>",
    "<!-- Secondary navigation bar: end -->"
  ].join("\n");

  console.log("\nBuilding the site-wide install...");
  write("site-nav.site.css", css.styles + "\n");
  write("site-nav.site.js", js.code + "\n");
  write("site-wide-install.html", snippet + "\n");
}

build().catch((error) => {
  console.error("\nBuild failed: " + error.message);
  process.exit(1);
});
