/* ==========================================================================
   Page Navigation - behavior
   --------------------------------------------------------------------------
   You do NOT need to edit this file. It reads the links out of the embed code
   on the page and builds the navigation bar from them.

   What it does, in plain language:
     1. Finds any element on the page with a data-site-nav attribute.
     2. Reads the list of links from that element (or downloads it from a
        links file, if one was given).
     3. Builds the bar, and underlines whichever link matches the page the
        visitor is currently on.
     4. Watches the bar's width, so it switches to the stacked "narrow" layout
        whenever it is in a tight space, and shows the little fade on the right
        edge only while there is more to swipe to.
   ========================================================================== */

(function () {
  "use strict";

  /* Bumped whenever this file changes in a way that matters. Each page carries
     its own copy of this script in its own Code Block, so re-pasting an
     updated block onto a page that briefly still has the old one loaded (e.g.
     mid-save) can leave two copies running. The older one steps aside instead
     of the two fighting over the same bar. */
  var VERSION = 5;
  if (window.SiteNav && window.SiteNav.version >= VERSION) return;

  /* Below this many pixels wide, the bar switches to its narrow layout. */
  var NARROW_WIDTH = 640;

  /* Used to give each bar's link list a unique id, so the dropdown button can
     point at the list it opens. */
  var counter = 0;

  /* The label can be rendered as a real heading so it picks up the site's own
     heading style. Anything not in this list falls back to plain text. */
  var HEADING_TAGS = { h1: true, h2: true, h3: true, h4: true, h5: true, h6: true };

  /* Only these link types are allowed. This blocks things like javascript:
     links, which is a common way people try to sneak code onto a page. */
  var SAFE_LINK = /^(https?:\/\/|\/|\.\/|\.\.\/|#|mailto:|tel:)/i;

  /* Squarespace switches JavaScript off while you are editing a page, so this
     rarely comes up - but the site preview does run scripts, and we leave the
     page alone there too rather than replacing content someone is editing. */
  function isEditing() {
    return !!document.body && /sqs-edit-mode/.test(document.body.className);
  }

  /* ---------------------------------------------------------------------
     Step 1: get the list of links for one nav
     --------------------------------------------------------------------- */
  function getLinks(el) {
    // Option A (normal): the links are written into the embed code itself.
    var inline = el.getAttribute("data-links");
    if (inline) {
      return Promise.resolve(parseLinks(inline, el));
    }

    // Option B (optional): the links live in a separate .json file, so every
    // page can share one list. See docs/HOW-TO-EDIT.md.
    var source = el.getAttribute("data-source");
    if (source) {
      return fetch(source, { cache: "no-cache" })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.text();
        })
        .then(function (text) {
          return parseLinks(text, el);
        })
        .catch(function (error) {
          warn(el, "Could not load the links file at " + source, error);
          return [];
        });
    }

    warn(el, "No links were found. Add a data-links attribute with your links in it.");
    return Promise.resolve([]);
  }

  function parseLinks(text, el) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      warn(el, "The list of links is not valid. Rebuild it with the builder tool.", error);
      return [];
    }

    // Accept either a plain list, or an object like { "links": [...] }.
    var list = Array.isArray(data) ? data : data && data.links;
    if (!Array.isArray(list)) {
      warn(el, "The list of links is not valid. Rebuild it with the builder tool.");
      return [];
    }

    return list.filter(function (item) {
      return item && typeof item.label === "string" && typeof item.url === "string";
    });
  }

  /* ---------------------------------------------------------------------
     Step 2: build the bar
     --------------------------------------------------------------------- */
  function render(el, links) {
    var title = el.getAttribute("data-title");
    var titleUrl = el.getAttribute("data-title-url");
    // In a tight space the links become a dropdown, unless the embed asks for
    // the swipeable row instead.
    var phoneMode = el.getAttribute("data-phone") === "swipe" ? "swipe" : "dropdown";

    el.classList.add("sn-nav");
    el.setAttribute("data-sticky", el.getAttribute("data-sticky") === "true" ? "true" : "false");
    el.setAttribute("data-has-title", title ? "true" : "false");
    el.setAttribute("data-phone", phoneMode);
    el.innerHTML = "";

    var nav = document.createElement("nav");
    nav.className = "sn-nav__inner";
    nav.setAttribute("aria-label", title || "Section navigation");

    // The label and the dropdown button share a row, so they live together in
    // a "head" wrapper.
    var head = document.createElement("div");
    head.className = "sn-nav__head";

    // data-title-tag="h4" renders the label as a real <h4>, so the site's own
    // Heading 4 style applies to it. Without it, the label is plain text and
    // the bar's own type settings apply instead.
    var titleTag = String(el.getAttribute("data-title-tag") || "").toLowerCase();

    if (title) {
      head.appendChild(
        HEADING_TAGS[titleTag]
          ? buildHeadingTitle(titleTag, title, titleUrl)
          : buildPlainTitle(title, titleUrl)
      );
    }

    var scroller = document.createElement("div");
    scroller.className = "sn-nav__scroller";
    scroller.id = "sn-links-" + (++counter);

    var list = document.createElement("ul");
    list.className = "sn-nav__list";

    var currentLabel = "";

    // data-link-tag="p" wraps each link in a real <p>, so the site's paragraph
    // style applies to the link text.
    var wrapInParagraph = el.getAttribute("data-link-tag") === "p";

    links.forEach(function (item) {
      if (!isSafe(item.url)) return;

      var li = document.createElement("li");
      li.className = "sn-nav__item";

      var a = document.createElement("a");
      a.className = "sn-nav__link";
      a.href = item.url;
      a.textContent = item.label; // textContent, so labels can never inject code
      if (item.newTab) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      if (isCurrentPage(item.url)) {
        a.setAttribute("aria-current", "page");
        currentLabel = item.label;
      }

      if (wrapInParagraph) {
        var paragraph = document.createElement("p");
        paragraph.className = "sn-nav__text";
        paragraph.appendChild(a);
        li.appendChild(paragraph);
      } else {
        a.classList.add("sn-nav__link--plain");
        li.appendChild(a);
      }

      list.appendChild(li);
    });

    scroller.appendChild(list);

    if (phoneMode === "dropdown") {
      head.appendChild(buildToggle(el, scroller, title, currentLabel));
    }

    nav.appendChild(head);
    nav.appendChild(scroller);
    el.appendChild(nav);

    watchSize(el, scroller);
    fitSection(el);
  }

  /* Squarespace won't let a Code Block be dragged shorter than its own
     minimum (several grid rows), and the section around it adds its own
     minimum height and padding - together leaving a band of empty space
     around the bar. This sizes the whole section to the bar instead: every
     wrapper from the bar up to its section loses its minimum height, fixed
     height, and padding, and any grid on the way loses its fixed rows and
     row gaps. Heights become "auto" rather than a measured number, so the
     section still grows when the phone dropdown opens.

     Done from here rather than in CSS so it doesn't depend on Squarespace's
     own class names for each wrapper - whatever sits between the bar and its
     section gets fitted. Scripts don't run in the editor, so the editor
     keeps Squarespace's own sizing and its drag handles still line up.

     Only when the bar is the only block in its section: the rows and
     padding being removed belong to the whole section, and another block
     there would lose its layout. */
  function fitSection(el) {
    if (el.getAttribute("data-shrink-block") !== "true") {
      return debug(el, null, "not fitting: data-shrink-block isn't \"true\"");
    }

    var section = el.closest("section, .page-section");
    if (!section) return debug(el, null, "not fitting: no <section> around the bar");

    var blocks = section.querySelectorAll(".sqs-block, .fe-block");
    for (var i = 0; i < blocks.length; i++) {
      if (!blocks[i].contains(el)) {
        return debug(el, section, "not fitting: another block shares the section: " + describe(blocks[i]));
      }
    }

    // The first section on a page is often padded down to clear a header
    // that sits over it - keep that, or the bar would slide under the header.
    var keepTop = !section.previousElementSibling ||
      !section.previousElementSibling.matches("section, .page-section");

    var path = [];
    for (var node = el.parentElement; node; node = node.parentElement) {
      path.push(node);
      if (node === section) break;
    }

    function fit() {
      path.forEach(function (node) {
        var style = node.style;
        force(style, "min-height", "0");
        force(style, "padding-bottom", "0");
        force(style, "margin-bottom", "0");
        if (!keepTop) {
          force(style, "padding-top", "0");
          force(style, "margin-top", "0");
        }
        if (node !== section) force(style, "height", "auto");

        if (/grid/.test(getComputedStyle(node).display)) {
          force(style, "grid-template-rows", "none");
          force(style, "grid-auto-rows", "auto");
          force(style, "row-gap", "0");
        }
      });

      // Then end the section exactly where the bar ends. This catches any
      // space left over that isn't one of the wrappers' own sizing - e.g.
      // Squarespace's Mobile layout adding spacing of its own.
      var height = Math.ceil(el.getBoundingClientRect().bottom - section.getBoundingClientRect().top);
      if (height > 0) force(section.style, "height", height + "px");

      debug(el, section, "fitted" + (keepTop ? " (first section: top spacing kept)" : ""), path);
    }

    // Refit whenever something could have changed the sizes: the bar itself
    // (the phone dropdown opening, or switching layouts), the window, or
    // Squarespace's own scripts rewriting a wrapper's styles after load -
    // which is what its Mobile layout does. fit() only writes a style that
    // actually differs, so reacting to its own changes settles immediately.
    var queued = false;
    function soon() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        fit();
      });
    }

    fit();
    window.addEventListener("resize", soon);
    window.addEventListener("load", soon);
    if (DEBUG) window.addEventListener("scroll", soon, { passive: true });
    if (typeof ResizeObserver === "function") {
      // Runs before the next paint, so the section never shows a frame
      // at the wrong height when the dropdown opens or closes.
      new ResizeObserver(fit).observe(el);
    }
    if (typeof MutationObserver === "function") {
      var observer = new MutationObserver(soon);
      path.forEach(function (node) {
        observer.observe(node, { attributes: true, attributeFilter: ["style", "class"] });
      });
    }
  }

  /* Diagnostics, shown only when the page address ends in ?sn-debug. Lays
     out, in a panel on the page itself (so it can be read on a phone with no
     developer tools), what fitSection() did and what actually sits under
     the bar - enough to tell where any remaining gap comes from. */
  var DEBUG = /[?&]sn-debug(=|&|$)/.test(window.location.search);

  function debug(el, section, status, path) {
    if (!DEBUG) return;

    var lines = ["site-navigation v" + VERSION + " | window " + window.innerWidth + "px wide", status];
    var bar = el.getBoundingClientRect();
    lines.push("bar: " + px(bar.height) + " tall");

    if (section) {
      section.style.outline = "3px dashed red";
      section.style.outlineOffset = "-3px";
      var box = section.getBoundingClientRect();
      lines.push("section (red): " + describe(section) + " | " + px(box.height) +
        " tall | ends " + px(box.bottom - bar.bottom) + " below the bar");

      var next = section.nextElementSibling;
      while (next && /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(next.tagName)) next = next.nextElementSibling;
      if (next) {
        next.style.outline = "3px dashed blue";
        next.style.outlineOffset = "-3px";
        var after = next.getBoundingClientRect();
        var first = next.querySelector(".sqs-block, h1, h2, h3, h4, h5, h6, p, img");
        lines.push("next (blue): " + describe(next) + " | starts " + px(after.top - box.bottom) +
          " after the section" + (first ? " | its content starts " + px(first.getBoundingClientRect().top - after.top) + " below its top" : ""));
        lines.push("  " + spacing(next));
      } else {
        lines.push("next: nothing after the section in " + describe(section.parentElement));
      }
    }

    if (bar.bottom + 8 < window.innerHeight && bar.bottom > 0) {
      var probe = document.elementFromPoint(window.innerWidth / 2, bar.bottom + 8);
      lines.push("8px under the bar: " + (probe ? describe(probe) : "nothing") +
        (probe && probe.closest("section") ? " (in " + describe(probe.closest("section")) + ")" : ""));
    } else {
      lines.push("8px under the bar: (scroll so the bar is on screen)");
    }

    if (path) {
      lines.push("wrappers, bar -> section:");
      path.forEach(function (node) {
        lines.push("  " + describe(node) + " | h " + px(node.getBoundingClientRect().height) + " | " + spacing(node));
      });
    }

    var panel = document.getElementById("sn-debug");
    if (!panel) {
      panel = document.createElement("pre");
      panel.id = "sn-debug";
      panel.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;margin:0;" +
        "max-height:50vh;overflow:auto;padding:8px;background:rgba(0,0,0,0.85);color:#fff;" +
        "font:11px/1.4 monospace;white-space:pre-wrap;word-break:break-all;";
      document.body.appendChild(panel);
    }
    panel.textContent = lines.join("\n");
  }

  function describe(node) {
    if (!node || !node.tagName) return String(node);
    var classes = typeof node.className === "string" ? node.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    return node.tagName.toLowerCase() + (node.id ? "#" + node.id : "") + (classes ? "." + classes : "");
  }

  function spacing(node) {
    var cs = getComputedStyle(node);
    return "pad " + cs.paddingTop + "/" + cs.paddingBottom + " | margin " + cs.marginTop + "/" + cs.marginBottom +
      " | min-h " + cs.minHeight + (/grid/.test(cs.display) ? " | rows " + cs.gridTemplateRows + " gap " + cs.rowGap : "");
  }

  function px(value) {
    return Math.round(value) + "px";
  }

  /* Sets an inline !important style, but only if it isn't already set - so
     the MutationObserver above isn't re-triggered by its own no-op writes. */
  function force(style, property, value) {
    if (style.getPropertyValue(property) !== value || style.getPropertyPriority(property) !== "important") {
      style.setProperty(property, value, "important");
    }
  }

  /* A real heading element, so the site's heading style styles it. We add no
     type rules of our own here - that is the whole point. */
  function buildHeadingTitle(tag, title, titleUrl) {
    var heading = document.createElement(tag);
    heading.className = "sn-nav__title";

    if (isSafe(titleUrl)) {
      var link = document.createElement("a");
      link.className = "sn-nav__title-link";
      link.href = titleUrl;
      link.textContent = title;
      heading.appendChild(link);
    } else {
      heading.textContent = title;
    }

    return heading;
  }

  /* Plain text instead: a link if it has an address, otherwise a span. This one
     does take the bar's own font size and weight settings. */
  function buildPlainTitle(title, titleUrl) {
    var titleEl = document.createElement(isSafe(titleUrl) ? "a" : "span");
    titleEl.className = "sn-nav__title sn-nav__title--plain";
    titleEl.textContent = title;
    if (titleEl.tagName === "A") titleEl.href = titleUrl;
    return titleEl;
  }

  /* The button that opens the dropdown.
     When the bar has a label, the button is just the arrow, sitting on the same
     line as that label. With no label to sit beside, it fills the row and names
     the page you are on instead, so the bar never shows a bare arrow. */
  function buildToggle(el, scroller, title, currentLabel) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "sn-nav__toggle";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", scroller.id);

    if (title) {
      button.setAttribute("aria-label", title + " links");
    } else {
      var text = document.createElement("span");
      text.textContent = currentLabel || "Links";
      button.appendChild(text);
    }

    var chevron = document.createElement("span");
    chevron.className = "sn-nav__chevron";
    chevron.setAttribute("aria-hidden", "true");

    button.appendChild(chevron);

    button.addEventListener("click", function () {
      setOpen(el, button, el.getAttribute("data-open") !== "true");
    });

    // Tapping anywhere else on the page closes it.
    document.addEventListener("click", function (event) {
      if (!el.contains(event.target)) setOpen(el, button, false);
    });

    // Escape closes it and puts the focus back on the button.
    el.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && el.getAttribute("data-open") === "true") {
        setOpen(el, button, false);
        button.focus();
      }
    });

    return button;
  }

  function setOpen(el, button, open) {
    el.setAttribute("data-open", open ? "true" : "false");
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }

  /* ---------------------------------------------------------------------
     Helpers
     --------------------------------------------------------------------- */

  function isSafe(url) {
    return typeof url === "string" && SAFE_LINK.test(url.trim());
  }

  /* Is this link pointing at the page we are already on? */
  function isCurrentPage(url) {
    try {
      var target = new URL(url, window.location.href);
      if (target.origin !== window.location.origin) return false;
      return tidyPath(target.pathname) === tidyPath(window.location.pathname);
    } catch (error) {
      return false;
    }
  }

  function tidyPath(path) {
    return path.replace(/\/+$/, "").toLowerCase() || "/";
  }

  /* Picks the wide or narrow layout from the bar's own width, and shows the
     fade on the right edge only while there is more to swipe to. */
  function watchSize(el, scroller) {
    function update() {
      var narrow = el.clientWidth < NARROW_WIDTH;
      el.setAttribute("data-narrow", narrow ? "true" : "false");

      // Widening the window while the dropdown is open would otherwise leave it
      // stuck open behind the wide layout.
      if (!narrow && el.getAttribute("data-open") === "true") {
        var button = el.querySelector(".sn-nav__toggle");
        if (button) setOpen(el, button, false);
      }

      var remaining = scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft;
      el.setAttribute("data-overflow", remaining > 8 ? "true" : "false");
    }

    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(update).observe(el);
    }
    update();
  }

  /* Problems are written to the browser console instead of shown to visitors. */
  function warn(el, message, error) {
    if (window.console && console.warn) {
      console.warn("[site-navigation] " + message, error || "", el);
    }
  }

  /* ---------------------------------------------------------------------
     Start everything
     --------------------------------------------------------------------- */
  function start() {
    if (isEditing()) return;

    var navs = document.querySelectorAll("[data-site-nav]:not([data-site-nav-ready])");
    Array.prototype.forEach.call(navs, function (el) {
      el.setAttribute("data-site-nav-ready", "true");
      getLinks(el).then(function (links) {
        render(el, links);
      });
    });
  }

  /* Squarespace swaps page content in without a full reload on some templates,
     and the site preview re-renders as you work. Either way a new marker can
     appear on a page that has already been through start(), so we watch for
     one arriving instead of only looking once. */
  function watchForNewBars() {
    var pending = null;
    function soon() {
      if (pending) return;
      pending = setTimeout(function () { pending = null; start(); }, 100);
    }

    document.addEventListener("mercury:load", start); // 7.0 Ajax templates
    window.addEventListener("popstate", soon);

    if (typeof MutationObserver !== "function" || !document.body) return;

    // Only react to a new marker appearing. Watching everything would mean
    // re-running on our own changes, and on every scroll of the swipe row.
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) continue;
          if (node.hasAttribute("data-site-nav") || node.querySelector("[data-site-nav]")) {
            return soon();
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function begin() {
    start();
    watchForNewBars();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", begin);
  } else {
    begin();
  }

  // Exposed so the builder's preview - and anyone debugging a page - can force
  // a re-run by hand.
  window.SiteNav = { version: VERSION, refresh: start };
})();
