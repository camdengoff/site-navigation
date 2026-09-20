/* ==========================================================================
   Build the paste-in install files
   --------------------------------------------------------------------------
   Turns nav.css and nav.js into the blocks you paste into Squarespace once,
   so that a client's site carries its own copy of the code and nothing loads
   from someone else's account.

   Run it with:  npm install && npm run build

   It writes into dist/:
     site-nav.custom-css.css   -> Design > Custom CSS
     site-nav.header.html      -> Settings > Advanced > Code Injection > Header
     site-nav.all-in-one.html  -> the Header block, with the CSS folded in
     site-nav.engine.js        -> the script alone, used by the builder
     site-nav.block.html       -> the per-page marker, for reference
   ========================================================================== */

const fs = require("fs");
const path = require("path");
const CleanCSS = require("clean-css");
const { minify } = require("terser");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");

/* The site-wide settings that go in the Header block. The builder writes a
   customised version of this; these are the defaults it starts from. */
const DEFAULTS = {
  style:
    "--sn-bg:#ececec; --sn-text:#111111; --sn-accent:#111111; " +
    "--sn-muted:rgba(17,17,17,0.55); --sn-divider:rgba(17,17,17,0.15)",
  phone: "dropdown",
  titleTag: "h4",
  linkTag: "p",
  boldLabel: false,
  boldLinks: false
};

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function write(file, contents) {
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, file), contents);
  const kb = (Buffer.byteLength(contents) / 1024).toFixed(1);
  console.log(`  dist/${file}  ${kb} KB`);
}

function banner(where) {
  return [
    "/* Page Navigation - paste this into " + where + ".",
    "   Built from nav.css and nav.js; do not edit it here. Rebuild instead. */"
  ].join("\n");
}

function configBlock(defaults) {
  return [
    "<!-- Page Navigation: site-wide settings. Safe to edit. -->",
    "<script>",
    "window.SiteNavConfig = {",
    "  defaults: " + JSON.stringify(defaults, null, 2).replace(/\n/g, "\n  "),
    "};",
    "</script>"
  ].join("\n");
}

async function build() {
  const css = new CleanCSS({ level: 2 }).minify(read("nav.css"));
  if (css.errors.length) throw new Error(css.errors.join("\n"));
  css.warnings.forEach((w) => console.warn("  css warning: " + w));

  const js = await minify(read("nav.js"), { compress: true, mangle: true });
  if (!js.code) throw new Error("terser produced no output");

  /* Guard against a minifier quietly dropping something the install depends
     on. Both of these are load-bearing and easy to lose silently. */
  const checks = [
    [css.styles, ":has(", "the anti-flash rule in nav.css"],
    [css.styles, "sqs-edit-mode", "the editor label in nav.css"],
    [js.code, "sn-js", "the fallback class in nav.js"],
    [js.code, "SiteNavConfig", "the settings hook in nav.js"]
  ];
  for (const [haystack, needle, what] of checks) {
    if (!haystack.includes(needle)) {
      throw new Error(`Minifying dropped ${what} (looked for "${needle}")`);
    }
  }

  console.log("Building install files...");

  write(
    "site-nav.custom-css.css",
    banner("Design > Custom CSS") + "\n" + css.styles + "\n"
  );

  const header = [
    "<!-- Page Navigation - paste into Settings > Advanced > Code Injection > Header. -->",
    "<!-- The stylesheet goes in Design > Custom CSS instead. -->",
    configBlock(DEFAULTS),
    "<script>" + js.code + "</script>",
    ""
  ].join("\n");
  write("site-nav.header.html", header);

  const allInOne = [
    "<!-- Page Navigation - everything in one paste, for Settings > Advanced >",
    "     Code Injection > Header. Splitting the CSS into Design > Custom CSS",
    "     instead is the better install: only then does the bar's marker get",
    "     labelled inside the Squarespace editor. -->",
    configBlock(DEFAULTS),
    "<style>" + css.styles + "</style>",
    "<script>" + js.code + "</script>",
    ""
  ].join("\n");
  write("site-nav.all-in-one.html", allInOne);

  /* The engine on its own, so the builder can pair it with a settings block
     it generated from whatever colors someone picked. */
  write("site-nav.engine.js", js.code + "\n");

  write(
    "site-nav.block.html",
    [
      "<!-- Put this in a Code Block on any page that should show the bar, with",
      "     the label and links in a text block directly below it. -->",
      "<div data-site-nav></div>",
      ""
    ].join("\n")
  );

  const total = Buffer.byteLength(css.styles) + Buffer.byteLength(js.code);
  console.log(`\nEngine total: ${(total / 1024).toFixed(1)} KB minified.`);
}

build().catch((error) => {
  console.error("\nBuild failed: " + error.message);
  process.exit(1);
});
