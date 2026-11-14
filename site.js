/* ==========================================================================
   Page Navigation - site-wide install
   --------------------------------------------------------------------------
   You do NOT need to edit this file.

   The per-page install puts a Code Block on every page that needs a bar. This
   one is pasted ONCE, into Settings -> Advanced -> Code Injection -> Footer,
   and decides which pages get a bar from a single list of settings - a JSON
   script block with id="site-nav-config", next to this script:

       {
         "bars":  { "watch": { "title": "Watch Online", "links": [ ... ] } },
         "pages": { "/watch-online": "watch", "/sermons": "watch" }
       }

   "bars" are the link sets, each with a name. "pages" says which bar shows on
   which page, by the page's URL path. A page that isn't listed has no bar.

   On every page it:
     1. Looks the current page up in "pages".
     2. If it has a bar, adds it at the very top of the page content - below
        Squarespace's own header and navigation, above the first section.
     3. Pushes it down if a fixed or transparent header would cover it.

   You never edit that list by hand unless you want to. Open any page of the
   live site with ?sitenav-setup on the end of its address, e.g.

     https://www.example.org/?sitenav-setup

   and a setup panel lists every page on the site (from Squarespace's own
   sitemap.xml), lets you pick a bar for each one, previews it on the page
   you are looking at, and gives you the updated code to paste back into Code
   Injection. Nothing is saved anywhere else - Squarespace has no way for a
   script to change its own Code Injection, so the paste is the save.

   nav.js (bundled ahead of this file) does the actual drawing of the bar;
   this file only decides where and with what.
   ========================================================================== */

(function () {
  "use strict";

  var VERSION = 1;
  if (window.SiteNavSite && window.SiteNavSite.version >= VERSION) return;

  /* This script's own text, so the setup panel can hand back a complete
     Code Injection snippet (styles + settings + this script) rather than
     only the settings. Only possible when it was pasted in inline, which is
     how the install works; loaded from a URL, the panel hands back only the
     settings. */
  var OWN_SOURCE = (document.currentScript && !document.currentScript.src)
    ? document.currentScript.textContent : "";

  var SETUP_PARAM = "sitenav-setup";
  var SETUP_FLAG = "sitenav-setup-open";   // sessionStorage: panel stays open across pages
  var DRAFT_KEY = "sitenav-setup-draft";   // localStorage: unsaved changes

  /* Where "the top of the page content" is, best first. #sections is
     Squarespace 7.1's list of page sections; the rest cover 7.0 templates. */
  var CONTENT_SELECTORS = [
    "#sections",
    ".Main-content",
    "#content",
    "main#page",
    "main",
    "#page",
    "[role='main']"
  ];

  var HEADER_SELECTORS = "#header, header.Header, .Header, header[role='banner'], #siteWrapper > header, body > header";

  var COLOR_VARS = { bg: "--sn-bg", text: "--sn-text", hover: "--sn-hover", muted: "--sn-muted", accent: "--sn-accent" };
  var SAFE_VAR = /^--sn-[a-z-]+$/;
  var SAFE_VALUE = /^[^;{}<>"\\]*$/;

  var current = null;      // the wrapper currently on the page
  var currentKey = "";     // what it was built from, to skip needless rebuilds
  var cleanups = [];       // listeners/observers tied to the current wrapper

  /* ---------------------------------------------------------------------
     Settings
     --------------------------------------------------------------------- */

  /* The settings pasted into Code Injection. Either the JSON block (what the
     setup panel writes) or, for anyone who prefers it, window.SiteNavConfig.
     With a "source" (the settings service the Save button writes to), these
     are only the fallback for a visitor's very first page, if that service
     can't be reached. */
  function inlineConfig() {
    // The JSON block(s) in Code Injection come first. If an older copy of
    // the snippet was left in as well there are two: use the one that names
    // a settings service, otherwise the last one.
    var data = null;
    var blocks = document.querySelectorAll("script[id='site-nav-config']");
    for (var i = 0; i < blocks.length; i++) {
      var parsed = parseSettings(blocks[i].textContent);
      if (!parsed) continue;
      if (!data || !sourceOf(data) || sourceOf(parsed)) data = parsed;
    }
    // window.SiteNavConfig only if there's no block - and only if it really
    // is settings: other code on a site can define a global of that name
    // (or the browser can, for an element with that id or name), and it
    // must never hide the block's settings service address.
    var global = window.SiteNavConfig;
    var usable = global && typeof global === "object" && !global.nodeType &&
      (global.bars || global.pages || global.source);
    if (!data && usable) data = global;
    else if (data && usable && !sourceOf(data) && sourceOf(global)) data = global;
    var config = normalize(data);
    var source = sourceOf(data);
    if (source) config.source = source;
    return config;
  }

  /* Some editors turn straight quotes into curly ones on paste, which
     breaks JSON - so try again with them straightened before giving up. */
  var settingsProblem = "";
  function parseSettings(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      try {
        return JSON.parse(String(text).replace(/[\u201c\u201d\u201e\u2033]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/\u00a0/g, " "));
      } catch (again) {
        settingsProblem = String(again && again.message || again);
        warn("The site-nav-config settings in Code Injection aren't valid JSON.", again);
        return null;
      }
    }
  }

  /* The settings service's address, if one is set. Forgiving about how it
     was typed: "name.workers.dev", with or without https:// or a slash. */
  function sourceOf(data) {
    var source = data && typeof data.source === "string" ? data.source.trim().replace(/\/+$/, "") : "";
    if (!source) return "";
    if (!/^[a-z]+:\/\//i.test(source)) source = "https://" + source;
    return /^https:\/\/[^\s/]+(\/[^\s]*)?$/i.test(source) ? source : "";
  }

  /* What's live: the last settings read from the settings service (kept in
     this browser, so the bar shows straight away on the next page instead of
     waiting for the network), or the pasted settings if there's no service. */
  function liveConfig() {
    var inline = inlineConfig();
    if (!inline.source) return inline;
    var saved = remote || readRemoteCache();
    if (!saved || saved.source !== inline.source) return inline;
    var config = normalize(saved.config);
    config.source = inline.source;
    return config;
  }

  var remote = null;   // { source, version, config } from the settings service
  var REMOTE_CACHE = "sitenav-remote";

  function readRemoteCache() {
    try {
      var data = JSON.parse(localStorage.getItem(REMOTE_CACHE) || "null");
      return data && typeof data === "object" ? data : null;
    } catch (error) {
      return null;
    }
  }

  function keepRemote(source, data) {
    remote = { source: source, version: Number(data && data.version) || 0, config: (data && data.config) || {} };
    try {
      localStorage.setItem(REMOTE_CACHE, JSON.stringify(remote));
    } catch (error) { /* private mode: it just fetches every page */ }
    return remote;
  }

  /* Fetch the latest settings from the service, then re-check this page's
     bar. Only rebuilds it if something about it actually changed. */
  function fetchRemote() {
    var source = inlineConfig().source;
    if (!source) return Promise.resolve(null);
    return fetch(source + "/config", { cache: "no-cache", credentials: "omit" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        keepRemote(source, data);
        mount();
        remoteListeners.forEach(function (fn) { fn(); });
        return remote;
      })
      .catch(function (error) {
        warn("Couldn't load the bar settings from " + source + ". Using the last ones this browser saw.", error);
        remoteListeners.forEach(function (fn) { fn(error); });
        return null;
      });
  }
  var remoteListeners = [];

  function normalize(data) {
    data = data && typeof data === "object" ? data : {};
    var out = {
      bars: {},
      pages: {},
      settings: data.settings && typeof data.settings === "object" ? clone(data.settings) : {}
    };
    var bars = data.bars && typeof data.bars === "object" ? data.bars : {};
    Object.keys(bars).forEach(function (name) {
      if (bars[name] && typeof bars[name] === "object") out.bars[name] = clone(bars[name]);
    });
    var pages = data.pages && typeof data.pages === "object" ? data.pages : {};
    Object.keys(pages).forEach(function (path) {
      var value = pages[path];
      if (typeof value === "string" || (value && typeof value === "object") || value === false) {
        out.pages[tidyRule(path)] = clone(value);
      }
    });
    return out;
  }

  /* While the setup panel is open, the page previews its unsaved changes. */
  function activeConfig() {
    if (setupOpen()) {
      var draft = readDraft();
      if (draft) return draft;
    }
    return liveConfig();
  }

  /* Which bar this path gets. An exact path wins; otherwise the longest
     matching "/prefix/*" rule (a "*" on its own matches every page). A page
     set to false has no bar even if a wider rule would give it one. */
  function barFor(config, pathname) {
    var path = tidyPath(pathname);
    var value;

    if (Object.prototype.hasOwnProperty.call(config.pages, path)) {
      value = config.pages[path];
    } else {
      var best = -1;
      Object.keys(config.pages).forEach(function (rule) {
        if (!/\*$/.test(rule)) return;
        var prefix = rule.replace(/\/?\*$/, "");
        var matches = prefix === "" || path === prefix || path.indexOf(prefix + "/") === 0;
        if (matches && prefix.length > best) {
          best = prefix.length;
          value = config.pages[rule];
        }
      });
    }

    if (typeof value === "string") value = config.bars[value];
    if (!value || typeof value !== "object") return null;
    if (!Array.isArray(value.links) || !value.links.length) return null;
    return value;
  }

  /* ---------------------------------------------------------------------
     Putting the bar on the page
     --------------------------------------------------------------------- */

  function mount() {
    if (isEditing()) return unmount();

    var config = activeConfig();
    var bar = barFor(config, window.location.pathname);
    if (!bar || hasOwnCodeBlockBar()) return unmount();

    var settings = config.settings || {};
    var key = window.location.pathname + "|" + JSON.stringify(bar) + "|" + JSON.stringify(settings);
    if (current && currentKey === key && document.documentElement.contains(current)) return;

    var spot = findSpot(settings);
    if (!spot) {
      warn("Couldn't find where the page content starts. Set settings.content to a CSS selector for it.");
      return unmount();
    }

    unmount();

    var wrap = document.createElement("div");
    wrap.className = "sn-site";
    wrap.setAttribute("data-sn-site", "");
    wrap.setAttribute("data-align", settings.align === "full" ? "full" : "site");
    wrap.setAttribute("data-sticky", bar.sticky === true ? "true" : "false");
    wrap.appendChild(marker(bar));

    spot.parent.insertBefore(wrap, spot.before);
    current = wrap;
    currentKey = key;

    if (window.SiteNav && typeof window.SiteNav.refresh === "function") window.SiteNav.refresh();
    clearHeader(wrap, settings);
  }

  function unmount() {
    cleanups.splice(0).forEach(function (fn) { fn(); });
    if (current && current.parentNode) current.parentNode.removeChild(current);
    current = null;
    currentKey = "";
  }

  /* A page that already has a bar in a Code Block of its own (the per-page
     install) keeps that one, so moving a site over page by page never shows
     two bars. */
  function hasOwnCodeBlockBar() {
    var navs = document.querySelectorAll("[data-site-nav]");
    for (var i = 0; i < navs.length; i++) {
      if (!navs[i].closest("[data-sn-site], [data-site-nav-admin]")) return true;
    }
    return false;
  }

  /* The same marker a Code Block would carry, so nav.js builds it exactly
     the way it builds every other bar. */
  function marker(bar) {
    var el = document.createElement("div");
    el.setAttribute("data-site-nav", "");
    if (bar.title) el.setAttribute("data-title", String(bar.title));
    if (bar.titleUrl) el.setAttribute("data-title-url", String(bar.titleUrl));

    // "site" text style (the default): real heading/paragraph tags, so the
    // site's own fonts apply. "plain": the bar's own type settings.
    var siteText = bar.textStyle !== "plain";
    var titleTag = bar.titleTag || (siteText ? "h4" : "");
    if (titleTag) el.setAttribute("data-title-tag", String(titleTag));
    if (bar.linkTag === "p" || (siteText && !bar.linkTag)) el.setAttribute("data-link-tag", "p");

    el.setAttribute("data-phone", bar.phone === "swipe" ? "swipe" : "dropdown");
    if (bar.boldLabel) el.setAttribute("data-bold-label", "true");
    if (bar.boldLinks) el.setAttribute("data-bold-links", "true");
    el.setAttribute("data-links", JSON.stringify(bar.links));

    var style = [];
    var colors = bar.colors || {};
    Object.keys(COLOR_VARS).forEach(function (name) {
      if (colors[name] && SAFE_VALUE.test(colors[name])) style.push(COLOR_VARS[name] + ":" + colors[name]);
    });
    var vars = bar.vars || {};
    Object.keys(vars).forEach(function (name) {
      if (SAFE_VAR.test(name) && SAFE_VALUE.test(String(vars[name]))) style.push(name + ":" + vars[name]);
    });
    if (style.length) el.setAttribute("style", style.join(";"));

    return el;
  }

  /* The very top of the page content: just before the first section. When
     the content area holds the header itself (some 7.0 templates), just
     after the header instead. */
  function findSpot(settings) {
    var header = findHeader(settings);
    var selectors = settings.content ? [settings.content] : CONTENT_SELECTORS;

    for (var i = 0; i < selectors.length; i++) {
      var container;
      try {
        container = document.querySelector(selectors[i]);
      } catch (error) {
        warn("settings.content isn't a valid CSS selector.", error);
        continue;
      }
      if (!container) continue;

      if (header && container.contains(header)) {
        // Climb to the header's ancestor that is a direct child of the
        // container, and go right after it.
        var top = header;
        while (top.parentNode !== container) top = top.parentNode;
        return { parent: container, before: top.nextSibling };
      }
      if (header && header.contains(container)) continue;
      return { parent: container, before: firstRealChild(container) };
    }
    return null;
  }

  /* Skip past anything our own wrapper or a stray text node sits in front of. */
  function firstRealChild(container) {
    var node = container.firstChild;
    while (node && (node.nodeType !== 1 || node.hasAttribute("data-sn-site"))) node = node.nextSibling;
    return node;
  }

  function findHeader(settings) {
    try {
      return document.querySelector((settings && settings.header) || HEADER_SELECTORS);
    } catch (error) {
      warn("settings.header isn't a valid CSS selector.", error);
      return null;
    }
  }

  /* Squarespace's header is either part of the page's normal flow (the bar
     lands below it on its own), or fixed / transparent and drawn over the
     top of the content. In the second case the bar would be hidden behind
     it, so it is pushed down by however much the header overlaps it. A
     header that stays on screen as you scroll also sets where a sticky bar
     sticks. Re-measured whenever the header or window changes size. */
  function clearHeader(wrap, settings) {
    var header = findHeader(settings);
    var extra = Number(settings.offset) || 0;

    function measure() {
      if (!document.documentElement.contains(wrap)) return;
      wrap.style.marginTop = "";
      var push = 0;
      var stickTop = 0;

      if (header && !header.contains(wrap)) {
        var cs = getComputedStyle(header);
        var scrollY = window.pageYOffset || 0;
        var barTop = wrap.getBoundingClientRect().top + scrollY;
        var headerBottom = null;

        if (cs.position === "fixed") {
          // Measured from where it sits at the top of the page, so a header
          // that slides away while scrolling still counts in full.
          var top = parseFloat(cs.top) || 0;
          headerBottom = top + header.offsetHeight;
          stickTop = headerBottom;
        } else if (cs.position === "sticky") {
          stickTop = (parseFloat(cs.top) || 0) + header.offsetHeight;
        } else if (cs.display !== "none") {
          headerBottom = header.getBoundingClientRect().bottom + scrollY;
        }

        if (headerBottom !== null) push = Math.max(0, Math.ceil(headerBottom - barTop));
      }

      push += extra;
      if (push) wrap.style.marginTop = push + "px";
      wrap.style.setProperty("--sn-sticky-top", stickTop + "px");
    }

    var queued = false;
    function soon() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; measure(); });
    }

    measure();
    on(window, "resize", soon);
    on(window, "load", soon);
    if (header && typeof ResizeObserver === "function") {
      var observer = new ResizeObserver(soon);
      observer.observe(header);
      cleanups.push(function () { observer.disconnect(); });
    }
  }

  function on(target, type, fn) {
    target.addEventListener(type, fn);
    cleanups.push(function () { target.removeEventListener(type, fn); });
  }

  /* ---------------------------------------------------------------------
     Keeping it there
     --------------------------------------------------------------------- */

  function isEditing() {
    return !!document.body && /sqs-edit-mode/.test(document.body.className);
  }

  /* Squarespace's editor opens on the same page without a reload, and some
     7.0 templates swap page content in without one too. Either way, check
     again: take the bar off while editing, put it back afterwards, and
     re-add it if the content it sat in was replaced. */
  function watch() {
    document.addEventListener("mercury:load", mount); // 7.0 Ajax templates
    window.addEventListener("popstate", function () { setTimeout(mount, 50); });

    if (typeof MutationObserver !== "function" || !document.body) return;

    new MutationObserver(function () { mount(); })
      .observe(document.body, { attributes: true, attributeFilter: ["class"] });

    var pending = null;
    new MutationObserver(function () {
      if (pending) return;
      pending = setTimeout(function () {
        pending = null;
        if (!current || !document.documentElement.contains(current)) mount();
      }, 150);
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ---------------------------------------------------------------------
     Setup panel  (?sitenav-setup)
     --------------------------------------------------------------------- */

  function setupOpen() {
    try {
      return sessionStorage.getItem(SETUP_FLAG) === "1";
    } catch (error) {
      return false;
    }
  }

  function setSetupOpen(open) {
    try {
      if (open) sessionStorage.setItem(SETUP_FLAG, "1");
      else sessionStorage.removeItem(SETUP_FLAG);
    } catch (error) { /* private mode: the panel just won't follow you between pages */ }
  }

  /* A draft remembers which saved version it started from, so saving it
     can't quietly overwrite someone else's save made in the meantime. */
  function readDraftRecord() {
    try {
      var data = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (!data || typeof data !== "object") return null;
      return data.draft && data.config ? data : { draft: true, config: data, base: null };
    } catch (error) {
      return null;
    }
  }

  function readDraft() {
    var record = readDraftRecord();
    return record ? normalize(record.config) : null;
  }

  function writeDraft(config, base) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft: true, config: config, base: base }));
    } catch (error) { /* nothing to do - the panel still works for this page */ }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (error) { /* ignore */ }
  }

  function wantsSetup() {
    return new RegExp("[?&]" + SETUP_PARAM + "(=|&|$)").test(window.location.search) || setupOpen();
  }

  var PANEL_CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box}",
    ".panel{position:fixed;top:0;right:0;bottom:0;width:min(440px,100vw);background:#fff;color:#1a1a1a;",
    "font:14px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;",
    "box-shadow:-8px 0 30px rgba(0,0,0,.18);display:flex;flex-direction:column;z-index:2147483646}",
    ".panel[hidden]{display:none}",
    ".top{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #e5e5e5}",
    ".top h1{font-size:15px;margin:0;flex:1}",
    ".here{padding:12px 14px;background:#f6f7f9;border-bottom:1px solid #e5e5e5}",
    ".here .path{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;word-break:break-all}",
    ".tabs{display:flex;border-bottom:1px solid #e5e5e5}",
    ".tabs button{flex:1;border:0;background:none;padding:10px;font:inherit;cursor:pointer;color:#555;border-bottom:2px solid transparent}",
    ".tabs button[aria-selected=true]{color:#000;font-weight:600;border-bottom-color:#000}",
    ".body{flex:1;overflow:auto;padding:14px}",
    ".foot{padding:10px 14px;border-top:1px solid #e5e5e5;font-size:12px;color:#666}",
    "button.btn{border:1px solid #c8c8c8;background:#fff;border-radius:6px;padding:6px 10px;font:inherit;font-size:13px;cursor:pointer}",
    "button.btn:hover{background:#f2f2f2}",
    "button.primary{background:#111;color:#fff;border-color:#111}",
    "button.primary:hover{background:#333}",
    "button.danger{color:#b00020}",
    "button.icon{border:0;background:none;cursor:pointer;font:inherit;padding:4px 6px;color:#555}",
    "label{display:block;font-size:12px;font-weight:600;margin:10px 0 4px;color:#333}",
    "input[type=text],input[type=search],select,textarea{width:100%;font:inherit;font-size:13px;padding:6px 8px;border:1px solid #c8c8c8;border-radius:6px;background:#fff;color:inherit}",
    "textarea{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;height:220px}",
    ".row{display:flex;gap:6px;align-items:center}",
    ".row>*{min-width:0}",
    ".grow{flex:1}",
    ".check{display:flex;gap:6px;align-items:center;font-weight:400;font-size:13px;margin:6px 0}",
    ".pages{list-style:none;margin:8px 0 0;padding:0}",
    ".pages li{display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0}",
    ".pages a{flex:1;min-width:0;color:#1a1a1a;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;word-break:break-all;text-decoration:none}",
    ".pages a:hover{text-decoration:underline}",
    ".pages select{width:150px;flex:none}",
    ".pages li.on a{font-weight:700}",
    ".card{border:1px solid #e0e0e0;border-radius:8px;padding:10px 12px;margin-bottom:12px}",
    ".card h2{font-size:14px;margin:0 0 4px}",
    ".link{display:grid;grid-template-columns:1fr 1fr auto;gap:4px;margin-bottom:4px;align-items:center}",
    ".link .tools{display:flex}",
    ".muted{color:#666;font-size:12px}",
    ".note{background:#fff8e1;border:1px solid #f3e1a0;border-radius:6px;padding:8px 10px;font-size:12px;margin-bottom:10px}",
    ".color{display:flex;gap:4px}",
    ".color input[type=color]{width:34px;height:31px;padding:0;border:1px solid #c8c8c8;border-radius:6px;background:none;flex:none}",
    ".tab{position:fixed;right:0;top:40%;z-index:2147483646;border:0;border-radius:8px 0 0 8px;background:#111;color:#fff;",
    "padding:10px 8px;font:600 12px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;cursor:pointer;writing-mode:vertical-rl}",
    ".tab[hidden]{display:none}",
    ".panel.inline{position:relative;top:auto;right:auto;bottom:auto;width:100%;box-shadow:none;border:1px solid #e0e0e0;border-radius:10px;z-index:auto}",
    ".panel.inline .body{overflow:visible}",
    ".foot .row{justify-content:space-between}",
    ".msg{border-radius:6px;padding:8px 10px;font-size:13px;margin:10px 0}",
    ".msg.ok{background:#e8f5e9;border:1px solid #b9dfbd}",
    ".msg.bad{background:#fdecea;border:1px solid #f3b8b2}",
    ".here .path{font-size:13px}",
    ".pages li{padding:0}",
    ".pagebtn{flex:1;min-width:0;display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;text-align:left;border:0;background:none;padding:9px 4px;cursor:pointer;font:inherit;color:inherit;border-radius:6px}",
    ".pagebtn:hover{background:#f4f5f7}",
    ".pathname{flex:1;min-width:0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;word-break:break-all}",
    ".chip{font-size:12px;padding:2px 8px;border-radius:999px;background:#111;color:#fff;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}",
    ".chip.off{background:#eef0f3;color:#666}",
    ".chip.found{background:#e8f5e9;color:#1b5e20}",
    ".pages a.visit{flex:none;font-family:inherit}",
    ".visit{color:#666;text-decoration:none;padding:6px 8px;border-radius:6px;font-size:14px}",
    ".visit:hover{background:#f4f5f7;color:#000}",
    ".foot input[type=password]{width:100%;font:inherit;font-size:13px;padding:6px 8px;border:1px solid #c8c8c8;border-radius:6px}",
    ".overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:2147483647;display:flex;align-items:flex-start;justify-content:center;padding:4vh 16px;overflow:auto;",
    "font:14px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a}",
    ".overlay[hidden]{display:none}",
    ".modal{background:#fff;border-radius:12px;width:min(760px,100%);box-shadow:0 20px 60px rgba(0,0,0,.3);display:flex;flex-direction:column;max-height:92vh}",
    ".mtop{display:flex;align-items:flex-start;gap:8px;padding:14px 16px;border-bottom:1px solid #e5e5e5}",
    ".mtop h2{margin:0;font-size:16px;font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-all}",
    ".mbody{padding:4px 16px 16px;overflow:auto}",
    ".mfoot{display:flex;gap:8px;align-items:center;padding:12px 16px;border-top:1px solid #e5e5e5}",
    ".pv{border:1px dashed #d0d0d0;border-radius:8px;overflow:hidden;background:#fff;font-family:initial;color:#111}",
    ".pv .empty{padding:14px}"
  ].join("");

  var PASSWORD_KEY = "sitenav-admin-password";

  function getPassword() {
    try {
      return localStorage.getItem(PASSWORD_KEY) || sessionStorage.getItem(PASSWORD_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function setPassword(password, remember) {
    try {
      localStorage.removeItem(PASSWORD_KEY);
      sessionStorage.removeItem(PASSWORD_KEY);
      if (password) (remember ? localStorage : sessionStorage).setItem(PASSWORD_KEY, password);
    } catch (error) { /* it's asked for again next time */ }
  }

  /* Opens the setup panel - either laid over the right of whatever page
     you're on (?sitenav-setup), or, given an element, inside it: the
     settings page, a Squarespace page holding just
     <div data-site-nav-admin></div> in a Code Block.

     One list of the site's pages. Clicking a page opens a popup with its bar:
     a preview, and everything about the bar to edit. */
  function openSetup(container) {
    var inline = !!(container && container.nodeType === 1);
    if (inline) {
      if (container.querySelector("[data-sn-setup]")) return;
    } else {
      setSetupOpen(true);
      if (document.querySelector("body > [data-sn-setup]")) return;
    }

    var source = inlineConfig().source || "";
    var draftRecord = readDraftRecord();
    var startRemote = remote || readRemoteCache();
    var state = {
      config: draftRecord ? normalize(draftRecord.config) : liveConfig(),
      restored: !!draftRecord,
      baseVersion: draftRecord && draftRecord.base !== null && draftRecord.base !== undefined
        ? draftRecord.base
        : (startRemote && startRemote.source === source ? startRemote.version : null),
      loaded: !source || !!remote,   // has the latest from the service arrived yet
      filter: "",
      paths: null,     // every page we could find, once loaded
      sitemapError: "",
      editing: null,   // the page (or pattern) whose popup is open; "#publish" for the code popup
      scan: null,      // finding bars already on the site
      foundOn: {},     // pages whose bar came from one of their Code Blocks
      message: "",
      messageKind: "",
      saving: false,
      conflict: null
    };

    var host = document.createElement("div");
    host.setAttribute("data-sn-setup", "");
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    if (inline) {
      container.innerHTML = "";
      container.appendChild(host);
    } else {
      document.body.appendChild(host);
    }

    // The latest settings arrived from the service. If nothing's been
    // changed here yet, show those.
    remoteListeners.push(function (error) {
      state.loaded = true;
      if (!error && !state.restored) {
        state.config = liveConfig();
        state.baseVersion = remote.version;
      }
      if (error && source) {
        say("Couldn't reach the settings service, so this shows the last settings this browser saw. Saving may not work until it's back.", "bad");
      }
      draw();
    });

    var style = document.createElement("style");
    // The bar's own styles go in too, so the preview in the popup is the
    // real thing - plus the site's own heading and paragraph type, which
    // can't reach in here on their own.
    var navCss = document.querySelector("style[data-site-nav-style]");
    style.textContent = PANEL_CSS + (navCss ? navCss.textContent : "") + siteTypeCss();
    root.appendChild(style);

    var panel = h("div", { className: inline ? "panel inline" : "panel", role: inline ? "region" : "dialog", "aria-label": "Secondary navigation setup" });
    var tabButton = h("button", { className: "tab", hidden: true, text: "Navigation setup" });
    var overlay = h("div", { className: "overlay", hidden: true });
    root.appendChild(panel);
    root.appendChild(tabButton);
    root.appendChild(overlay);

    tabButton.addEventListener("click", function () {
      panel.hidden = false;
      tabButton.hidden = true;
    });
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeEditor();
    });
    root.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.editing) closeEditor();
    });

    rememberPage(true);
    function refreshPaths() {
      state.paths = null;
      draw();
      loadPaths().then(function (result) {
        state.paths = result.paths;
        state.sitemapError = result.sitemapError;
        draw();
      });
    }

    /* Every change goes through here: saved as a draft (so it survives
       moving to another page), previewed on the page and in the popup, and
       the panel redrawn unless the change came from typing in a box
       (redrawing would take the cursor out of it). */
    function changed(redraw) {
      writeDraft(state.config, state.baseVersion);
      state.restored = true;
      if (state.messageKind === "ok") state.message = "";
      currentKey = "";
      mount();
      if (redraw !== false) {
        draw();
      } else {
        drawFoot();
        drawPopupPreview();
      }
    }

    function say(message, kind) {
      state.message = message;
      state.messageKind = kind || "";
    }

    /* ---------------- The panel: one list of pages ---------------- */

    var body = null;
    var foot = null;
    var list = null;
    var status = null;

    function draw() {
      var scrollTop = body ? body.scrollTop : 0;
      panel.innerHTML = "";

      var minimise = h("button", { className: "icon", title: "Hide the panel", text: "–" });
      minimise.addEventListener("click", function () {
        panel.hidden = true;
        tabButton.hidden = false;
      });
      var close = h("button", { className: "icon", title: "Close setup", text: "×" });
      close.addEventListener("click", function () {
        if (state.restored && !window.confirm("Close setup? Your changes are kept as a draft in this browser and come back next time you open it.")) return;
        setSetupOpen(false);
        host.parentNode.removeChild(host);
        currentKey = "";
        mount();
      });
      panel.appendChild(h("div", { className: "top" }, inline
        ? [h("h1", { text: "Secondary navigation" })]
        : [h("h1", { text: "Secondary navigation" }), minimise, close]));

      // On a live page: straight to this page's bar.
      if (!inline) {
        var here = tidyPath(window.location.pathname);
        var editHere = h("button", { className: "btn primary", text: "Edit this page's bar" });
        editHere.addEventListener("click", function () { openEditor(here); });
        panel.appendChild(h("div", { className: "here" }, [
          h("div", { className: "muted", text: "This page" }),
          h("div", { className: "row", style: "margin-top:4px" }, [
            h("div", { className: "path grow", text: here + " · " + describe(here) }),
            editHere
          ])
        ]));
      }

      body = h("div", { className: "body" });
      panel.appendChild(body);

      if (state.message) body.appendChild(h("div", { className: "msg " + state.messageKind, role: "status", text: state.message }));
      if (state.conflict) body.appendChild(conflictButtons());

      var search = h("input", { type: "search", placeholder: "Filter pages…", value: state.filter });
      search.setAttribute("aria-label", "Filter pages");
      search.addEventListener("input", function () {
        state.filter = search.value;
        drawList();
      });
      var refresh = h("button", { className: "btn", text: "Refresh", title: "Look for pages again - e.g. one you just added" });
      refresh.addEventListener("click", refreshPaths);
      body.appendChild(h("div", { className: "row" }, [h("div", { className: "grow" }, [search]), refresh]));

      var find = h("button", { className: "btn", text: state.scan && state.scan.running ? "Finding bars…" : "Find bars already on the site" });
      find.title = "Looks through every page for bars pasted into Code Blocks, and connects each one to its page here.";
      find.disabled = !!(state.scan && state.scan.running) || state.paths === null;
      find.addEventListener("click", startScan);
      body.appendChild(h("div", { className: "row", style: "margin-top:8px" }, [find]));

      status = h("div", { className: "muted", style: "margin-top:10px" });
      body.appendChild(status);
      list = h("ul", { className: "pages" });
      body.appendChild(list);
      drawList();

      var addInput = h("input", { type: "text", placeholder: "/new-page or /sermons/*" });
      var addButton = h("button", { className: "btn", text: "Add" });
      addButton.addEventListener("click", function () {
        var rule = tidyRule(addInput.value);
        if (!addInput.value.trim() || (rule.charAt(0) !== "/" && rule !== "*")) return;
        if (!(rule in state.config.pages) && (!state.paths || state.paths.indexOf(rule) === -1)) {
          state.config.pages[rule] = false;
          changed();
        }
        openEditor(rule);
      });
      body.appendChild(h("div", { style: "margin-top:16px" }, [
        h("label", { text: "Missing a page? Add it, or a pattern" }),
        h("div", { className: "muted", text: "Ending in /* covers every page under that address, e.g. each post of a blog. A page's own setting always wins over a pattern." }),
        h("div", { className: "row", style: "margin-top:6px" }, [h("div", { className: "grow" }, [addInput]), addButton])
      ]));

      body.scrollTop = scrollTop;

      foot = h("div", { className: "foot" });
      panel.appendChild(foot);
      drawFoot();
      drawPopup();
    }

    /* What a page currently shows, in a few words. */
    function describe(path) {
      var value = state.config.pages[path];
      if (typeof value === "string" && state.config.bars[value]) return barLabel(value);
      if (value && typeof value === "object") return value.title || "Bar";
      if (value === undefined) {
        var rule = ruleFor(path);
        if (rule) return barLabel(state.config.pages[rule]) + " (from " + rule + ")";
      }
      return "No bar";
    }

    // The most specific "/prefix/*" rule covering a path, if any.
    function ruleFor(path) {
      var best = "";
      Object.keys(state.config.pages).forEach(function (rule) {
        if (!/\*$/.test(rule) || typeof state.config.pages[rule] !== "string") return;
        var prefix = rule.replace(/\/?\*$/, "");
        var matches = prefix === "" || path === prefix || path.indexOf(prefix + "/") === 0;
        if (matches && rule !== path && prefix.length >= best.replace(/\/?\*$/, "").length) best = rule;
      });
      return best;
    }

    function drawList() {
      list.innerHTML = "";
      if (state.paths === null) {
        status.textContent = "Finding the site's pages…";
        return;
      }

      // Patterns and pages that only exist in the settings first, then
      // every page found on the site.
      var rules = Object.keys(state.config.pages).filter(function (rule) {
        return state.paths.indexOf(rule) === -1;
      }).sort();
      var all = rules.concat(state.paths);
      var needle = state.filter.trim().toLowerCase();
      var shown = all.filter(function (p) { return !needle || p.indexOf(needle) !== -1; });

      var MAX = 400;
      status.textContent = (state.sitemapError
        ? "Couldn't read this site's sitemap.xml (" + state.sitemapError + "), so this only lists pages linked from the site's menus. "
        : "") + "Click a page to set up its bar. " + shown.length + " of " + all.length + " pages" +
        (shown.length > MAX ? ", showing the first " + MAX + " - filter to narrow it down" : "") + ".";

      shown.slice(0, MAX).forEach(function (p) {
        var text = describe(p);
        var on = text !== "No bar";
        var item = h("li", { className: on ? "on" : "" });
        var open = h("button", { className: "pagebtn" }, [
          h("span", { className: "pathname", text: p }),
          h("span", { className: on ? "chip" : "chip off", text: text }),
          state.foundOn[p] ? h("span", { className: "chip found", text: "found on page" }) : null
        ]);
        open.setAttribute("aria-label", "Set up the bar for " + p);
        open.addEventListener("click", function () { openEditor(p); });
        item.appendChild(open);
        if (!/\*$/.test(p)) {
          var visit = inline
            ? h("a", { className: "visit", href: p + "?" + SETUP_PARAM, target: "_blank", title: "Open this page, with setup on it", text: "↗" })
            : h("a", { className: "visit", href: p, title: "Go to this page (setup stays open)", text: "↗" });
          item.appendChild(visit);
        }
        list.appendChild(item);
      });
    }

    function barNames() {
      return Object.keys(state.config.bars);
    }

    function barLabel(name) {
      var bar = state.config.bars[name];
      if (!bar) return name;
      if (bar.title) return bar.title;
      var first = (bar.links || []).filter(function (l) { return l && l.label; })[0];
      return first ? "Bar: " + first.label + "…" : "Untitled bar";
    }

    function pagesUsing(name) {
      return Object.keys(state.config.pages).filter(function (p) { return state.config.pages[p] === name; });
    }

    /* ---------------- The popup for one page ---------------- */

    var popupPreview = null;

    function openEditor(path) {
      state.editing = path;
      drawPopup();
    }

    function closeEditor() {
      state.editing = null;
      draw();
    }

    function drawPopup() {
      overlay.innerHTML = "";
      popupPreview = null;
      if (!state.editing) {
        overlay.hidden = true;
        return;
      }
      overlay.hidden = false;
      if (state.editing === "#publish" || state.editing === "#export") return drawPublishPopup(state.editing === "#export");

      var path = state.editing;
      var isRule = /\*$/.test(path);
      var value = state.config.pages[path];
      var inherited = value === undefined ? ruleFor(path) : "";
      var name = typeof value === "string" && state.config.bars[value]
        ? value
        : (inherited ? state.config.pages[inherited] : "");

      var modal = h("div", { className: "modal", role: "dialog", "aria-label": "Bar for " + path });
      var closeButton = h("button", { className: "icon", title: "Close", text: "×" });
      closeButton.addEventListener("click", closeEditor);
      modal.appendChild(h("div", { className: "mtop" }, [
        h("div", { className: "grow" }, [
          h("div", { className: "muted", text: isRule ? "Pattern" : "Page" }),
          h("h2", { text: path })
        ]),
        closeButton
      ]));

      var mbody = h("div", { className: "mbody" });
      modal.appendChild(mbody);

      // Which bar this page shows.
      var select = h("select");
      select.setAttribute("aria-label", "Bar on this page");
      select.appendChild(h("option", { value: "", text: "No bar" }));
      barNames().forEach(function (n) { select.appendChild(h("option", { value: n, text: barLabel(n) })); });
      select.appendChild(h("option", { value: "#new", text: "+ A new bar" }));
      select.value = name;
      select.addEventListener("change", function () {
        var choice = select.value;
        if (choice === "#new") {
          choice = uniqueName("bar");
          state.config.bars[choice] = { title: "", links: [{ label: "", url: isRule ? "" : path }], phone: "dropdown" };
        }
        if (choice) state.config.pages[path] = choice;
        else if (ruleFor(path)) state.config.pages[path] = false;   // off, despite a wider pattern
        else delete state.config.pages[path];
        changed(false);
        drawPopup();
      });
      mbody.appendChild(h("label", { text: isRule ? "Bar on every page under this address" : "Bar on this page" }));
      mbody.appendChild(select);
      if (inherited) {
        mbody.appendChild(h("div", { className: "muted", style: "margin-top:4px", text: "Comes from the pattern " + inherited + ". Choosing here sets this page on its own." }));
      }
      if (state.foundOn[path]) {
        mbody.appendChild(h("div", { className: "muted", style: "margin-top:4px", text: "Found in a Code Block on this page. Once these settings are saved, that Code Block can be deleted." }));
      }

      if (name) {
        var bar = state.config.bars[name];

        popupPreview = h("div", { className: "pv" });
        mbody.appendChild(h("label", { text: "Preview" }));
        mbody.appendChild(popupPreview);
        drawPopupPreview();

        var others = pagesUsing(name).filter(function (p) { return p !== path; });
        if (others.length) {
          var copy = h("button", { className: "btn", text: "Make a separate copy for this page" });
          copy.addEventListener("click", function () {
            var fresh = uniqueName(slug(bar.title) || "bar");
            state.config.bars[fresh] = clone(bar);
            state.config.pages[path] = fresh;
            changed(false);
            drawPopup();
          });
          mbody.appendChild(h("div", { className: "note", style: "margin-top:12px" }, [
            h("div", { text: "This bar is also on " + others.length + " other page" + (others.length === 1 ? "" : "s") + " (" + others.slice(0, 4).join(", ") + (others.length > 4 ? ", …" : "") + "). Changes here change it there too." }),
            h("div", { style: "margin-top:6px" }, [copy])
          ]));
        }

        barFields(bar).forEach(function (el) { mbody.appendChild(el); });

        var linked = h("button", { className: "btn", text: "Also put this bar on the pages it links to" });
        linked.addEventListener("click", function () {
          var count = 0;
          bar.links.concat(bar.titleUrl ? [{ url: bar.titleUrl }] : []).forEach(function (link) {
            var p = localPath(link.url);
            if (p && state.config.pages[p] !== name) { state.config.pages[p] = name; count++; }
          });
          say(count ? "Turned this bar on for " + count + " more page" + (count === 1 ? "" : "s") + "." : "It's already on every page it links to.", "ok");
          changed(false);
          drawPopup();
        });
        mbody.appendChild(h("div", { style: "margin-top:16px" }, [linked]));

        var del = h("button", { className: "btn danger", text: "Delete this bar from every page" });
        del.addEventListener("click", function () {
          var using = pagesUsing(name).length;
          if (!window.confirm("Delete this bar? It comes off " + using + " page" + (using === 1 ? "" : "s") + ".")) return;
          delete state.config.bars[name];
          Object.keys(state.config.pages).forEach(function (p) {
            if (state.config.pages[p] === name) delete state.config.pages[p];
          });
          changed(false);
          drawPopup();
        });
        mbody.appendChild(h("div", { style: "margin-top:16px" }, [del]));
      }

      var done = h("button", { className: "btn primary", text: "Done" });
      done.addEventListener("click", closeEditor);
      modal.appendChild(h("div", { className: "mfoot" }, [
        h("span", { className: "muted grow", text: source ? "Changes are kept until you click Save." : "Changes are kept until you publish." }),
        done
      ]));

      overlay.appendChild(modal);
      select.focus();
    }

    /* The bar as it'll look, drawn by the real bar code. */
    function drawPopupPreview() {
      if (!popupPreview) return;
      popupPreview.innerHTML = "";
      var value = state.config.pages[state.editing];
      var name = typeof value === "string" ? value : (value === undefined ? state.config.pages[ruleFor(state.editing)] : "");
      var bar = name && state.config.bars[name];
      if (!bar) return;
      var links = (bar.links || []).filter(function (l) { return l && l.label && l.url; });
      if (!links.length) {
        popupPreview.appendChild(h("div", { className: "muted empty", text: "Add a link below to see the bar." }));
        return;
      }
      var copy = clone(bar);
      copy.links = links;
      var wrap = h("div", { className: "sn-site", "data-align": "full" });
      var el = marker(copy);
      wrap.appendChild(el);
      popupPreview.appendChild(wrap);
      if (window.SiteNav && typeof window.SiteNav.build === "function") window.SiteNav.build(el);
    }

    /* Everything about a bar. Typing updates it in place. */
    function barFields(bar) {
      var out = [];
      out.push(field("Label", bar.title, function (v) { if (v) bar.title = v; else delete bar.title; }));
      out.push(field("Label links to (optional)", bar.titleUrl, function (v) { if (v) bar.titleUrl = v; else delete bar.titleUrl; }, "sn-paths"));

      out.push(h("label", { text: "Links" }));
      bar.links = Array.isArray(bar.links) ? bar.links : [];
      var links = h("div");
      out.push(links);
      function drawLinks() {
        links.innerHTML = "";
        bar.links.forEach(function (link, index) {
          var label = h("input", { type: "text", placeholder: "Label", value: link.label || "" });
          label.setAttribute("aria-label", "Link " + (index + 1) + " label");
          label.addEventListener("input", function () { link.label = label.value; changed(false); });
          var url = h("input", { type: "text", placeholder: "/page or https://…", value: link.url || "" });
          url.setAttribute("aria-label", "Link " + (index + 1) + " address");
          url.setAttribute("list", "sn-paths");
          url.addEventListener("input", function () { link.url = url.value.trim(); changed(false); });

          var up = h("button", { className: "icon", title: "Move up", text: "↑" });
          up.disabled = index === 0;
          up.addEventListener("click", function () { move(bar.links, index, -1); changed(false); drawLinks(); });
          var down = h("button", { className: "icon", title: "Move down", text: "↓" });
          down.disabled = index === bar.links.length - 1;
          down.addEventListener("click", function () { move(bar.links, index, 1); changed(false); drawLinks(); });
          var newTab = h("input", { type: "checkbox", title: "Open in a new tab" });
          newTab.checked = !!link.newTab;
          newTab.addEventListener("change", function () { if (newTab.checked) link.newTab = true; else delete link.newTab; changed(false); });
          var remove = h("button", { className: "icon", title: "Remove link", text: "×" });
          remove.addEventListener("click", function () { bar.links.splice(index, 1); changed(false); drawLinks(); });

          links.appendChild(h("div", { className: "link" }, [label, url, h("div", { className: "tools" }, [newTab, up, down, remove])]));
        });
      }
      drawLinks();
      out.push(h("div", { className: "muted", text: "The checkbox opens that link in a new tab." }));
      var addLink = h("button", { className: "btn", text: "+ Add link", style: "margin-top:6px" });
      addLink.addEventListener("click", function () { bar.links.push({ label: "", url: "" }); changed(false); drawLinks(); });
      out.push(addLink);

      var datalist = h("datalist", { id: "sn-paths" });
      (state.paths || []).forEach(function (p) { datalist.appendChild(h("option", { value: p })); });
      out.push(datalist);

      out.push(choice("On phones", bar.phone === "swipe" ? "swipe" : "dropdown",
        [["dropdown", "Dropdown"], ["swipe", "Swipeable row"]],
        function (v) { bar.phone = v; }));
      out.push(choice("Text style", bar.textStyle === "plain" ? "plain" : "site",
        [["site", "Site styles (Heading 4 + paragraph)"], ["plain", "Plain"]],
        function (v) { if (v === "plain") bar.textStyle = "plain"; else delete bar.textStyle; delete bar.titleTag; delete bar.linkTag; }));
      out.push(checkbox("Bold label", bar.boldLabel, function (v) { if (v) bar.boldLabel = true; else delete bar.boldLabel; }));
      out.push(checkbox("Bold links", bar.boldLinks, function (v) { if (v) bar.boldLinks = true; else delete bar.boldLinks; }));
      out.push(checkbox("Stick to top when scrolling", bar.sticky, function (v) { if (v) bar.sticky = true; else delete bar.sticky; }));

      [["bg", "Bar background", "#ececec"], ["text", "Text", "#111111"], ["hover", "Link color on hover", "#111111"]].forEach(function (c) {
        out.push(colorField(c[1], bar, c[0], c[2]));
      });
      return out;
    }

    /* ---------------- Finding bars already on the site ---------------- */

    function startScan() {
      var paths = (state.paths || []).filter(function (p) { return !/\*$/.test(p); });
      state.scan = { running: true, done: 0, total: paths.length, failed: 0 };
      say("");
      draw();
      scanSite(paths, function (done, failed) {
        state.scan.done = done;
        state.scan.failed = failed;
        if (status) status.textContent = "Looking through pages for bars… " + done + " of " + paths.length;
      }).then(function (found) {
        var made = 0;
        var pages = 0;
        found.forEach(function (item) {
          var name = matchingBar(item.bar);
          if (!name) {
            name = uniqueName(slug(item.bar.title) || "bar");
            state.config.bars[name] = item.bar;
            made++;
          }
          item.pages.forEach(function (p) {
            state.config.pages[p] = name;
            state.foundOn[p] = true;
            pages++;
          });
        });
        var failed = state.scan.failed;
        state.scan = null;
        if (!found.length) {
          say("Looked through " + paths.length + " pages and found no bars in Code Blocks." + (failed ? " (" + failed + " couldn't be read.)" : ""), "ok");
          return draw();
        }
        say("Found " + found.length + " bar" + (found.length === 1 ? "" : "s") + " on " + pages + " page" + (pages === 1 ? "" : "s") +
          " and connected each one to its page" + (made < found.length ? " (" + (found.length - made) + " matched a bar you already had)" : "") +
          ". They're marked “found on page” below." + (failed ? " " + failed + " page(s) couldn't be read." : "") +
          " Each page keeps showing its own Code Block until you delete it, so " +
          (source ? "Save, then delete the old Code Blocks." : "publish, then delete the old Code Blocks."), "ok");
        writeDraft(state.config, state.baseVersion);
        state.restored = true;
        currentKey = "";
        mount();
        draw();
      });
    }

    // An existing bar here with the same label and links, if there is one.
    function matchingBar(bar) {
      var key = sameBarKey(bar);
      var names = barNames();
      for (var i = 0; i < names.length; i++) {
        if (sameBarKey(state.config.bars[names[i]]) === key) return names[i];
      }
      return "";
    }

    /* ---------------- Saving ---------------- */

    /* Where things stand, and the Save (or Publish) button. */
    function drawFoot() {
      if (!foot) return;
      foot.innerHTML = "";
      var text = !state.loaded
        ? "Loading the live settings…"
        : state.restored ? "You have unsaved changes." : "Everything here is live on the site.";

      var row = h("div", { className: "row", style: "flex-wrap:wrap" }, [h("span", { className: "grow", text: text })]);
      foot.appendChild(row);

      if (state.restored) {
        var discard = h("button", { className: "btn", text: "Discard" });
        discard.title = "Throw away your changes and go back to what's live";
        discard.addEventListener("click", function () {
          if (!window.confirm("Throw away your changes and go back to what's live on the site?")) return;
          clearDraft();
          state.config = liveConfig();
          state.baseVersion = remote ? remote.version : state.baseVersion;
          state.restored = false;
          state.foundOn = {};
          state.conflict = null;
          say("");
          currentKey = "";
          mount();
          draw();
        });
        row.appendChild(discard);
      }

      if (!source) {
        var publish = h("button", { className: "btn primary", text: "Publish…" });
        publish.addEventListener("click", function () { openEditor("#publish"); });
        row.appendChild(publish);
        return;
      }

      // Leaving the settings service: everything, settings included, as one
      // self-contained Code Injection snippet.
      var leave = h("button", { className: "btn", text: "Move off Cloudflare\u2026" });
      leave.title = "Get everything as one Code Injection snippet that needs no outside service";
      leave.addEventListener("click", function () { openEditor("#export"); });
      row.insertBefore(leave, row.children[1] || null);

      if (!getPassword()) {
        var password = h("input", { type: "password", placeholder: "Settings password" });
        password.setAttribute("aria-label", "Settings password");
        password.setAttribute("autocomplete", "current-password");
        var remember = h("input", { type: "checkbox" });
        password.addEventListener("keydown", function (event) {
          if (event.key === "Enter") go();
        });
        row.appendChild(h("div", { style: "flex:1 1 160px" }, [password]));
        row.appendChild(h("label", { className: "check", style: "margin:0" }, [remember, document.createTextNode("Remember")]));
      }
      var save = h("button", { className: "btn primary", text: state.saving ? "Saving…" : "Save" });
      save.disabled = state.saving || !state.loaded || !state.restored;
      function go() {
        if (password) {
          if (!password.value) return password.focus();
          setPassword(password.value, remember.checked);
        }
        doSave(false);
      }
      save.addEventListener("click", go);
      row.appendChild(save);
    }

    function conflictButtons() {
      var theirs = h("button", { className: "btn", text: "Load their version (lose my changes)" });
      theirs.addEventListener("click", function () {
        keepRemote(source, state.conflict);
        clearDraft();
        state.config = liveConfig();
        state.baseVersion = remote.version;
        state.restored = false;
        state.conflict = null;
        state.foundOn = {};
        say("Loaded the latest saved settings.", "ok");
        currentKey = "";
        mount();
        draw();
      });
      var mine = h("button", { className: "btn danger", text: "Save mine over theirs" });
      mine.addEventListener("click", function () { doSave(true); });
      return h("div", { className: "row", style: "margin-bottom:10px;flex-wrap:wrap" }, [theirs, mine]);
    }

    /* Saves straight to the settings service: live on every page at once
       (Cloudflare can take up to a minute to show it everywhere). */
    function doSave(force) {
      if (!getPassword()) {
        say("Enter the settings password, then click Save.", "bad");
        return draw();
      }
      state.saving = true;
      say("");
      draw();
      fetch(source + "/config", {
        method: "PUT",
        credentials: "omit",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + getPassword() },
        body: JSON.stringify({ baseVersion: state.baseVersion, force: !!force, config: tidyConfig(state.config) })
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          return { status: response.status, data: data };
        });
      }).then(function (result) {
        state.saving = false;
        state.conflict = null;
        if (result.status === 200) {
          keepRemote(source, result.data);
          clearDraft();
          state.config = liveConfig();
          state.baseVersion = remote.version;
          state.restored = false;
          say("Saved. It's live on the site now - give it up to a minute to show everywhere.", "ok");
          currentKey = "";
          mount();
        } else if (result.status === 401) {
          setPassword("");
          say("That password wasn't right.", "bad");
        } else if (result.status === 409) {
          state.conflict = result.data && result.data.current;
          say("Someone else saved changes after you opened these settings.", "bad");
        } else {
          say((result.data && result.data.error) || "Couldn't save (error " + result.status + ").", "bad");
        }
        draw();
      }, function () {
        state.saving = false;
        say("Couldn't reach the settings service. Your changes are kept in this browser - try again in a moment.", "bad");
        draw();
      });
    }

    /* Without a settings service: the code to paste into Code Injection. */
    function drawPublishPopup(exporting) {
      var title = exporting ? "Move off Cloudflare" : "Publish";
      var modal = h("div", { className: "modal", role: "dialog", "aria-label": title });
      var closeButton = h("button", { className: "icon", title: "Close", text: "\u00d7" });
      closeButton.addEventListener("click", closeEditor);
      modal.appendChild(h("div", { className: "mtop" }, [h("h2", { className: "grow", text: title }), closeButton]));
      var mbody = h("div", { className: "mbody" });
      modal.appendChild(mbody);

      if (exporting) {
        var exported = installCode(state.config);
        if (!exported.full) {
          mbody.appendChild(h("div", { className: "msg bad", text: "This page can't read its own copy of the bar's code, so it can only hand back the settings. Paste dist/site-wide-install.html from the project into Code Injection, then put these settings in its site-nav-config block." }));
        }
        mbody.appendChild(h("p", { text: "This is the whole thing in one piece: the bar's code plus every bar and page setting shown here" +
          (state.restored ? " (including your unsaved changes)" : "") + ", with no Cloudflare address in it." }));
        mbody.appendChild(h("ol", {}, [
          h("li", { text: "Copy it." }),
          h("li", { text: "In Squarespace: Settings \u2192 Advanced \u2192 Code Injection \u2192 Footer. Select everything from \u201cSecondary navigation bar: start\u201d to \u201cend\u201d, paste this over it, and Save." }),
          h("li", { text: "Check a page with a bar in a private window. Once it's right, the Cloudflare worker can be deleted - nothing uses it any more." })
        ]));
        mbody.appendChild(h("p", { className: "muted", text: "Afterwards this settings page still works the same, but its button at the bottom becomes Publish: changes go live by pasting the code it gives you, in the same way." }));
        var exportArea = h("textarea", { readOnly: true });
        exportArea.value = exported.text;
        var exportCopy = h("button", { className: "btn primary", text: "Copy code" });
        exportCopy.addEventListener("click", function () {
          copyText(exported.text, exportArea).then(function () {
            exportCopy.textContent = "Copied";
            setTimeout(function () { exportCopy.textContent = "Copy code"; }, 1500);
          });
        });
        mbody.appendChild(h("div", { className: "row", style: "margin-bottom:8px" }, [exportCopy]));
        mbody.appendChild(exportArea);
        overlay.appendChild(modal);
        return;
      }

      mbody.appendChild(h("div", { className: "msg bad", text: "Saving straight to the site isn't set up, so publishing means pasting code. To get a Save button instead, put your settings service's address in \"source\" in Code Injection - see SAVE-BUTTON-SETUP.md. If you already did, check Code Injection doesn't still have an older copy of this snippet without it." }));
      if (settingsProblem) mbody.appendChild(h("div", { className: "msg bad", text: "The settings block in Code Injection (site-nav-config) can't be read, so the worker address in it is being ignored. The error was: " + settingsProblem + ". Check for a missing comma or quote near the address." }));
      var blocks = document.querySelectorAll("script[id='site-nav-config']").length;
      var engines = document.querySelectorAll("style[data-site-nav-style]").length;
      mbody.appendChild(h("p", { className: "muted", text: "On this page: " + blocks + " settings block" + (blocks === 1 ? "" : "s") + " and " + engines + " copy" + (engines === 1 ? "" : "ies") + " of the bar's code. With everything set up right that's 1 and 1." }));

      var code = installCode(state.config);
      mbody.appendChild(h("p", { text: code.full
        ? "To publish: in Squarespace go to Settings → Advanced → Code Injection, select everything in the Footer box that belongs to the navigation bar (from “Secondary navigation bar: start” to “: end”), and paste this over it. Then Save."
        : "To publish: in Code Injection → Footer, replace the site-nav-config block with this one. Then Save." }));

      var area = h("textarea", { readOnly: true });
      area.value = code.text;
      var copy = h("button", { className: "btn primary", text: "Copy code" });
      copy.addEventListener("click", function () {
        copyText(code.text, area).then(function () {
          copy.textContent = "Copied";
          setTimeout(function () { copy.textContent = "Copy code"; }, 1500);
        });
      });
      mbody.appendChild(h("div", { className: "row", style: "margin-bottom:8px" }, [copy]));
      mbody.appendChild(area);
      mbody.appendChild(h("p", { className: "muted", text: "Once the new code is live, the draft clears itself the next time you open setup." }));
      overlay.appendChild(modal);
    }

    /* ---------------- Small form pieces ---------------- */

    function field(text, value, set, list) {
      var input = h("input", { type: "text", value: value || "" });
      if (list) input.setAttribute("list", list);
      input.addEventListener("input", function () { set(input.value.trim()); changed(false); });
      return h("div", {}, [h("label", { text: text }), input]);
    }

    function choice(text, value, options, set) {
      var select = h("select");
      options.forEach(function (o) { select.appendChild(h("option", { value: o[0], text: o[1] })); });
      select.value = value;
      select.addEventListener("change", function () { set(select.value); changed(false); });
      return h("div", {}, [h("label", { text: text }), select]);
    }

    function checkbox(text, value, set) {
      var input = h("input", { type: "checkbox" });
      input.checked = !!value;
      input.addEventListener("change", function () { set(input.checked); changed(false); });
      return h("label", { className: "check" }, [input, document.createTextNode(text)]);
    }

    function colorField(text, bar, key, fallback) {
      var colors = bar.colors || {};
      var input = h("input", { type: "text", placeholder: "Default (" + fallback + ")", value: colors[key] || "" });
      var picker = h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(colors[key] || "") ? colors[key] : fallback });
      function set(v) {
        bar.colors = bar.colors || {};
        if (v && SAFE_VALUE.test(v)) bar.colors[key] = v;
        else delete bar.colors[key];
        if (!Object.keys(bar.colors).length) delete bar.colors;
        changed(false);
      }
      input.addEventListener("input", function () {
        set(input.value.trim());
        if (/^#[0-9a-f]{6}$/i.test(input.value.trim())) picker.value = input.value.trim();
      });
      picker.addEventListener("input", function () { input.value = picker.value; set(picker.value); });
      return h("div", {}, [h("label", { text: text }), h("div", { className: "color" }, [picker, input])]);
    }

    function uniqueName(base) {
      if (base !== "bar" && !state.config.bars[base]) return base;
      var n = 1;
      while (state.config.bars[base + "-" + n]) n++;
      return base + "-" + n;
    }

    // A draft that matches what's now live is no longer a draft.
    if (state.restored && JSON.stringify(tidyConfig(state.config)) === JSON.stringify(tidyConfig(liveConfig()))) {
      clearDraft();
      state.restored = false;
    }

    refreshPaths();
  }

  /* The site's own Heading 4 and paragraph type, measured from the page, so
     the preview inside the setup panel matches the live bar. */
  function siteTypeCss() {
    var into = document.querySelector("#sections .content, #sections, main, body");
    if (!into) return "";
    var probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden";
    var heading = document.createElement("h4");
    var para = document.createElement("p");
    heading.textContent = para.textContent = "x";
    probe.appendChild(heading);
    probe.appendChild(para);
    into.appendChild(probe);
    var props = ["font-family", "font-size", "font-weight", "font-style", "letter-spacing", "text-transform", "line-height"];
    function rules(el) {
      var cs = getComputedStyle(el);
      return props.map(function (p) { return p + ":" + cs.getPropertyValue(p); }).join(";");
    }
    var css = ".pv{font-family:" + getComputedStyle(into).fontFamily + "}" +
      ".pv h4.sn-nav__title{" + rules(heading) + "}.pv p.sn-nav__text{" + rules(para) + "}";
    into.removeChild(probe);
    return css;
  }

  /* Looks through the given pages for bars pasted into Code Blocks (the
     per-page install), and turns each one back into bar settings. Pages
     whose bars are identical are grouped into one bar. Resolves to
     [{ bar, pages: [paths] }]. */
  function scanSite(paths, progress) {
    var queue = paths.slice(0, 1000);
    var done = 0;
    var failed = 0;
    var groups = {};
    var order = [];

    function one(path) {
      return fetch(path, { credentials: "same-origin" }).then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.text();
      }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var markers = doc.querySelectorAll("[data-site-nav]");
        return Promise.all(Array.prototype.map.call(markers, barFromMarker));
      }).then(function (bars) {
        bars.forEach(function (bar) {
          if (!bar) return;
          var key = sameBarKey(bar);
          if (!groups[key]) {
            groups[key] = { bar: bar, pages: [] };
            order.push(key);
          }
          if (groups[key].pages.indexOf(path) === -1) groups[key].pages.push(path);
        });
      }, function () {
        failed++;
      }).then(function () {
        done++;
        progress(done, failed);
      });
    }

    // A few pages at a time, so a big site doesn't flood the server.
    function worker() {
      var path = queue.shift();
      return path === undefined ? Promise.resolve() : one(path).then(worker);
    }
    var workers = [];
    for (var i = 0; i < 4; i++) workers.push(worker());
    return Promise.all(workers).then(function () {
      return order.map(function (key) {
        groups[key].pages.sort();
        return groups[key];
      });
    });
  }

  /* The reverse of marker(): a Code Block's attributes as bar settings. */
  function barFromMarker(el) {
    var read = function (name) { return el.getAttribute(name); };
    var linksPromise;
    if (read("data-links")) {
      linksPromise = Promise.resolve(read("data-links"));
    } else if (read("data-source")) {
      linksPromise = fetch(read("data-source"), { cache: "no-cache" }).then(function (r) { return r.ok ? r.text() : "[]"; }, function () { return "[]"; });
    } else {
      return Promise.resolve(null);
    }

    return linksPromise.then(function (text) {
      var data;
      try { data = JSON.parse(text); } catch (error) { return null; }
      var list = Array.isArray(data) ? data : data && data.links;
      if (!Array.isArray(list)) return null;
      var links = list.filter(function (l) {
        return l && typeof l.label === "string" && typeof l.url === "string";
      }).map(function (l) {
        var link = { label: l.label, url: l.url };
        if (l.newTab) link.newTab = true;
        return link;
      });
      if (!links.length) return null;

      var bar = {};
      if (read("data-title")) bar.title = read("data-title");
      if (read("data-title-url")) bar.titleUrl = read("data-title-url");
      bar.links = links;
      bar.phone = read("data-phone") === "swipe" ? "swipe" : "dropdown";

      // Text style: the default (h4 + paragraph) needs nothing written down.
      var titleTag = String(read("data-title-tag") || "").toLowerCase();
      var linkP = read("data-link-tag") === "p";
      if (!/^h[1-6]$/.test(titleTag) && !linkP) {
        bar.textStyle = "plain";
      } else if (titleTag !== "h4" || !linkP) {
        if (/^h[1-6]$/.test(titleTag)) bar.titleTag = titleTag;
        else bar.textStyle = "plain";
        bar.linkTag = linkP ? "p" : "none";
      }

      if (read("data-bold-label") === "true") bar.boldLabel = true;
      if (read("data-bold-links") === "true") bar.boldLinks = true;
      if (read("data-sticky") === "true") bar.sticky = true;

      var names = {};
      Object.keys(COLOR_VARS).forEach(function (key) { names[COLOR_VARS[key]] = key; });
      String(read("style") || "").split(";").forEach(function (rule) {
        var at = rule.indexOf(":");
        if (at < 0) return;
        var prop = rule.slice(0, at).trim();
        var value = rule.slice(at + 1).trim();
        if (!SAFE_VAR.test(prop) || !value || !SAFE_VALUE.test(value)) return;
        if (names[prop]) {
          bar.colors = bar.colors || {};
          bar.colors[names[prop]] = value;
        } else {
          bar.vars = bar.vars || {};
          bar.vars[prop] = value;
        }
      });
      return bar;
    });
  }

  /* Two bars are the same if everything that shows matches. */
  function sameBarKey(bar) {
    bar = bar || {};
    function sorted(object) {
      return Object.keys(object || {}).sort().filter(function (k) { return object[k]; }).map(function (k) { return [k, object[k]]; });
    }
    return JSON.stringify([
      bar.title || "", bar.titleUrl || "",
      (bar.links || []).filter(function (l) { return l && l.label && l.url; }).map(function (l) { return [l.label, l.url, !!l.newTab]; }),
      bar.phone === "swipe" ? "swipe" : "dropdown",
      bar.textStyle === "plain" ? "plain" : "site", bar.titleTag || "", bar.linkTag || "",
      !!bar.boldLabel, !!bar.boldLinks, !!bar.sticky,
      sorted(bar.colors), sorted(bar.vars)
    ]);
  }

  function slug(text) {
    return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  }

  /* Every page on the site we can find, from three places:
       - Squarespace's own sitemap.xml: every enabled page and collection
         item - but Squarespace caches it, so a page added a moment ago can
         be missing for a while, and it leaves out pages hidden from search
         engines.
       - the links in the site's menus (header, footer, mobile menu), read
         from this page and the home page - this catches new pages as soon
         as they're in the navigation.
       - pages opened in this browser since setup was first used here, so a
         page that's in neither shows up once you've visited it.
     Resolves to { paths, sitemapError }. */
  function loadPaths() {
    function fetchText(url) {
      return fetch(url, { credentials: "same-origin", cache: "no-cache" }).then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.text();
      });
    }
    function fetchXml(url) {
      return fetchText(url).then(function (text) {
        return new DOMParser().parseFromString(text, "application/xml");
      });
    }

    function locs(doc, parent) {
      return Array.prototype.map.call(doc.getElementsByTagName(parent), function (node) {
        var loc = node.getElementsByTagName("loc")[0];
        return loc ? loc.textContent.trim() : "";
      }).filter(Boolean);
    }

    var sitemapError = "";
    var fromSitemap = fetchXml("/sitemap.xml").then(function (doc) {
      var children = locs(doc, "sitemap").filter(sameOrigin).slice(0, 20);
      if (!children.length) return locs(doc, "url");
      return Promise.all(children.map(function (url) {
        return fetchXml(url).then(function (child) { return locs(child, "url"); }, function () { return []; });
      })).then(function (lists) { return [].concat.apply([], lists); });
    }).catch(function (error) {
      sitemapError = String(error && error.message || error);
      return [];
    });

    var fromHome = fetchText("/").then(function (html) {
      return menuLinks(new DOMParser().parseFromString(html, "text/html"));
    }, function () { return []; });

    return Promise.all([fromSitemap, fromHome]).then(function (lists) {
      var urls = lists[0].concat(lists[1], menuLinks(document), knownPages());
      var seen = {};
      var paths = urls.map(localPath).filter(function (p) {
        if (!p || seen[p] || !looksLikePage(p)) return false;
        seen[p] = true;
        return true;
      }).sort(function (a, b) {
        // Shorter (top-level) pages first, then alphabetical.
        var da = a.split("/").length, db = b.split("/").length;
        return da - db || (a < b ? -1 : a > b ? 1 : 0);
      });
      return { paths: paths, sitemapError: sitemapError };
    });
  }

  /* Same-site links in a page's menus. Squarespace's mobile menu holds
     every page in the navigation, including the ones inside folders. */
  function menuLinks(doc) {
    var anchors = doc.querySelectorAll("header a[href], nav a[href], footer a[href], .header-menu a[href], [data-folder] a[href]");
    return Array.prototype.map.call(anchors, function (a) {
      var href = a.getAttribute("href");
      try {
        return new URL(href, window.location.href).href;
      } catch (error) {
        return "";
      }
    }).filter(sameOrigin);
  }

  /* Squarespace's own non-page addresses, and files. */
  function looksLikePage(path) {
    return !/^\/(cart|checkout|account|config|commerce|api|s|static|search)(\/|$)/.test(path) &&
      !/\.[a-z0-9]{2,5}$/.test(path);
  }

  var KNOWN_KEY = "sitenav-known-pages";

  function knownPages() {
    try {
      var list = JSON.parse(localStorage.getItem(KNOWN_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (error) {
      return [];
    }
  }

  /* Only in a browser where setup has been opened - visitors' browsers
     never keep this list. */
  function rememberPage(start) {
    try {
      if (!start && localStorage.getItem(KNOWN_KEY) === null) return;
      var list = knownPages();
      var path = tidyPath(window.location.pathname);
      if (list.indexOf(path) === -1) list.push(path);
      localStorage.setItem(KNOWN_KEY, JSON.stringify(list.slice(-2000)));
    } catch (error) { /* fine - the other two sources still work */ }
  }

  /* What gets pasted back into Code Injection. With this script's own text
     to hand, the whole snippet; otherwise just the settings block. */
  /* The settings as saved: empty links dropped, pages in order. */
  function tidyConfig(config) {
    var tidy = { bars: {}, pages: {} };
    Object.keys(config.bars).forEach(function (name) {
      var bar = clone(config.bars[name]);
      bar.links = (bar.links || []).filter(function (l) { return l && l.label && l.url; });
      if (bar.colors && !Object.keys(bar.colors).length) delete bar.colors;
      tidy.bars[name] = bar;
    });
    Object.keys(config.pages).sort().forEach(function (p) { tidy.pages[p] = config.pages[p]; });
    if (config.settings && Object.keys(config.settings).length) tidy.settings = config.settings;
    return tidy;
  }

  function installCode(config) {
    var tidy = tidyConfig(config);
    var json = JSON.stringify(tidy, null, 2).replace(/</g, "\\u003c");
    // "\x3c" is "<" - written that way so this script can itself sit inline
    // in a <script> tag without these strings ending it early.
    var settingsBlock = '\x3cscript type="application/json" id="site-nav-config">\n' + json + "\n\x3c/script>";

    var css = document.querySelector("style[data-site-nav-style]");
    if (!OWN_SOURCE || !css) return { full: false, text: settingsBlock };

    return {
      full: true,
      text: [
        "\x3c!-- Secondary navigation bar: start --\x3e",
        "\x3cstyle data-site-nav-style>" + css.textContent.trim() + "\x3c/style>",
        settingsBlock,
        "\x3cscript>" + OWN_SOURCE.trim() + "\x3c/script>",
        "\x3c!-- Secondary navigation bar: end --\x3e"
      ].join("\n")
    };
  }

  /* ---------------------------------------------------------------------
     Helpers
     --------------------------------------------------------------------- */

  /* Tiny element builder. Text always goes in as text, never as HTML. */
  function h(tag, props, children) {
    var el = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      var value = props[key];
      if (key === "text") el.textContent = value;
      else if (key === "className") el.className = value;
      else if (key === "style") el.setAttribute("style", value);
      else if (key === "value" || key === "hidden" || key === "type" || key === "href" || key === "placeholder" || key === "title" || key === "id") el[key] = value;
      else el.setAttribute(key, value);
    });
    (children || []).forEach(function (child) { if (child) el.appendChild(child); });
    return el;
  }

  function copyText(text, fallback) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(fallback); });
    }
    return legacyCopy(fallback);
  }

  function legacyCopy(area) {
    area.focus();
    area.select();
    try { document.execCommand("copy"); } catch (error) { /* the text is selected; Ctrl/Cmd+C works */ }
    return Promise.resolve();
  }

  function move(list, index, by) {
    var item = list.splice(index, 1)[0];
    list.splice(index + by, 0, item);
  }

  function renameKey(object, from, to) {
    var out = {};
    Object.keys(object).forEach(function (key) { out[key === from ? to : key] = object[key]; });
    return out;
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function sameOrigin(url) {
    try {
      return new URL(url, window.location.href).origin === window.location.origin;
    } catch (error) {
      return false;
    }
  }

  /* "/About-Us/" and "https://this-site/about-us" are the same page. Links
     elsewhere aren't a page on this site. */
  function localPath(url) {
    if (!url) return "";
    try {
      var target = new URL(url, window.location.href);
      if (target.origin !== window.location.origin) return "";
      return tidyPath(decodeURI(target.pathname));
    } catch (error) {
      return "";
    }
  }

  function tidyPath(path) {
    return String(path || "").replace(/\/+$/, "").toLowerCase() || "/";
  }

  function tidyRule(rule) {
    rule = String(rule || "").trim();
    if (rule === "*") return "*";
    if (/\*$/.test(rule)) return tidyPath(rule.replace(/\/?\*$/, "")).replace(/\/$/, "") + "/*";
    if (/^https?:\/\//i.test(rule)) return localPath(rule) || rule;
    return tidyPath(rule.charAt(0) === "/" ? rule : "/" + rule);
  }

  function warn(message, error) {
    if (window.console && console.warn) console.warn("[site-navigation] " + message, error || "");
  }

  /* ---------------------------------------------------------------------
     Start
     --------------------------------------------------------------------- */
  function begin() {
    rememberPage(false);
    var admin = document.querySelector("[data-site-nav-admin]");
    if (admin && !isEditing()) openSetup(admin);
    else if (wantsSetup() && !isEditing()) openSetup();
    mount();
    watch();
    fetchRemote();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", begin);
  } else {
    begin();
  }

  window.SiteNavSite = {
    version: VERSION,
    refresh: function () { currentKey = ""; mount(); return fetchRemote(); },
    setup: openSetup,
    barFor: function (pathname) { return barFor(activeConfig(), pathname || window.location.pathname); }
  };
})();
