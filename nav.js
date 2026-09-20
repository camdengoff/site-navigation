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

  /* Bumped whenever this file changes in a way that matters. The Squarespace
     install pastes this whole file into the site, so a page can briefly end up
     with two copies of it - a leftover Code Block and the new site-wide one.
     The older copy steps aside instead of the two fighting over the same bar. */
  var VERSION = 2;
  if (window.SiteNav && window.SiteNav.version >= VERSION) return;

  /* Tells the stylesheet that this script is running. The rules that hide the
     list of links you typed into Squarespace are all written against this
     class, so if the script never runs, nothing gets hidden and the page still
     shows a plain, working list of links instead of an empty space. */
  document.documentElement.classList.add("sn-js");

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

  /* Settings shared by every bar on the site. The Squarespace install writes
     these once, so the colors and type live in one place instead of being
     repeated on every page. Anything set on an individual bar still wins. */
  function siteDefaults() {
    var config = window.SiteNavConfig;
    return (config && config.defaults) || {};
  }

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

    // Option C: nothing was written into the code at all, so look for the
    // links in the page itself - an ordinary Squarespace text block with a
    // list of links in it. This is the route that lets someone change the bar
    // without touching any code: they edit the list, we turn it into the bar.
    var harvested = harvestFromPage(el);
    if (harvested.links.length) {
      if (harvested.title && !el.getAttribute("data-title")) {
        el.setAttribute("data-title", harvested.title);
      }
      // These links and label were real site-styled text a moment ago, so they
      // are rendered back as a real heading and real paragraphs. Without this
      // the bar would quietly restyle text the person had already set up.
      if (harvested.titleTag && !el.hasAttribute("data-title-tag")) {
        el.setAttribute("data-title-tag", harvested.titleTag);
      }
      if (!el.hasAttribute("data-link-tag")) {
        el.setAttribute("data-link-tag", "p");
      }
      harvested.sources.forEach(function (block) {
        // Hidden from here rather than from the stylesheet, so that a script
        // that fails to run leaves the links on the page.
        block.setAttribute("data-sn-source", "hidden");
      });
      return Promise.resolve(harvested.links);
    }

    warn(el, "No links were found. Put a list of links in a text block beside this one, or add a data-links attribute.");
    return Promise.resolve([]);
  }

  /* ---------------------------------------------------------------------
     Reading the links out of the page (the no-code route)
     ---------------------------------------------------------------------
     On a Squarespace page the bar is marked by an empty Code Block, and the
     links sit next to it in a normal text block, written as a bulleted list.
     We read that list, hide it, and put the bar in its place. Everything here
     stays inside the one section the marker is in, and only ever hides the
     single block the links came from.
     --------------------------------------------------------------------- */

  /* The Squarespace section the marker sits in, which is as far out as we
     look. Falling back to the marker's own parent keeps this working on an
     ordinary web page, which has none of these wrappers. */
  function sourceScope(el) {
    var node = el.parentNode;
    while (node && node.nodeType === 1) {
      if (node.hasAttribute("data-section-id") ||
          node.tagName === "SECTION" ||
          /sqs-layout(\s|$)/.test(node.className)) {
        return node;
      }
      node = node.parentNode;
    }
    return el.parentNode;
  }

  /* The Squarespace block a node belongs to - the thing we hide once its
     contents have become the bar. Walking all the way up to the scope leaves
     us with the outermost block wrapper, which is the one to hide. */
  function owningBlock(node, scope) {
    var block = null;
    while (node && node !== scope) {
      if (node.nodeType === 1 && /sqs-block(\s|$)/.test(node.className)) block = node;
      node = node.parentNode;
    }
    return block;
  }

  function harvestFromPage(el) {
    var scope = sourceScope(el);
    var result = { links: [], title: "", titleTag: "", sources: [] };
    if (!scope) return result;

    // A real list is what the instructions ask for, and it is unambiguous, so
    // it wins: buttons and stray links elsewhere in the section are left alone.
    var lists = scope.querySelectorAll("ul, ol");
    var list = null;
    for (var i = 0; i < lists.length; i++) {
      if (el.contains(lists[i])) continue; // our own markup, on a re-run
      if (lists[i].querySelector("a[href]")) { list = lists[i]; break; }
    }

    // No list written as a list, so fall back to any text block that has links
    // in it. Less tidy, but it means a plain row of links still works.
    var anchors = [];
    var container = list;
    if (list) {
      anchors = list.querySelectorAll("a[href]");
    } else {
      var blocks = scope.querySelectorAll(".html-block");
      for (var j = 0; j < blocks.length && !anchors.length; j++) {
        if (el.contains(blocks[j])) continue;
        var found = blocks[j].querySelectorAll("a[href]");
        if (found.length) { anchors = found; container = blocks[j]; }
      }
    }

    Array.prototype.forEach.call(anchors, function (a) {
      var label = text(a);
      var url = a.getAttribute("href");
      if (!label || !isSafe(url)) return;
      var item = { label: label, url: url };
      if (a.target === "_blank") item.newTab = true;
      result.links.push(item);
    });

    if (!result.links.length) return result;

    var block = owningBlock(container, scope) || container;
    result.sources.push(block);

    // The bar's label: a heading in the same block as the links. Deliberately
    // not the whole section, so we never swallow a section title that belongs
    // to something else on the page.
    var headings = block.querySelectorAll("h1, h2, h3, h4");
    for (var k = 0; k < headings.length; k++) {
      if (list && list.contains(headings[k])) continue;
      result.title = text(headings[k]);
      if (result.title) {
        // Keep the level that was actually typed in Squarespace, so a label
        // written as a Heading 2 still renders as one in the bar.
        result.titleTag = headings[k].tagName.toLowerCase();
        break;
      }
    }

    return result;
  }

  function text(node) {
    return (node.textContent || "").replace(/\s+/g, " ").trim();
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
    applyDefaults(el);

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

  /* Fills in anything a bar did not say for itself from the site-wide settings.
     Written back as attributes, so the rest of this file never has to care
     whether a value came from the page or from the shared settings. */
  function applyDefaults(el) {
    var defaults = siteDefaults();
    var map = {
      "data-phone": defaults.phone,
      "data-title-tag": defaults.titleTag,
      "data-link-tag": defaults.linkTag,
      "data-sticky": defaults.sticky === true ? "true" : null,
      "data-bold-label": defaults.boldLabel === true ? "true" : null,
      "data-bold-links": defaults.boldLinks === true ? "true" : null
    };

    Object.keys(map).forEach(function (name) {
      if (map[name] && !el.hasAttribute(name)) el.setAttribute(name, map[name]);
    });

    // Colors arrive as a style string. Ours goes on first so that anything
    // already set on this particular bar overrides it.
    if (defaults.style) {
      el.setAttribute("style", defaults.style + ";" + (el.getAttribute("style") || ""));
    }
  }

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
