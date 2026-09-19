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

  /* Below this many pixels wide, the bar stacks the label above the links. */
  var NARROW_WIDTH = 640;

  /* Only these link types are allowed. This blocks things like javascript:
     links, which is a common way people try to sneak code onto a page. */
  var SAFE_LINK = /^(https?:\/\/|\/|\.\/|\.\.\/|#|mailto:|tel:)/i;

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

    warn(el, "No links were found. Add a data-links or data-source attribute.");
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

    el.classList.add("sn-nav");
    el.setAttribute("data-sticky", el.getAttribute("data-sticky") === "true" ? "true" : "false");
    el.setAttribute("data-has-title", title ? "true" : "false");
    el.innerHTML = "";

    var nav = document.createElement("nav");
    nav.className = "sn-nav__inner";
    nav.setAttribute("aria-label", title || "Section navigation");

    if (title) {
      // A title with a link becomes a link; without one it is just text.
      var titleEl = document.createElement(isSafe(titleUrl) ? "a" : "span");
      titleEl.className = "sn-nav__title";
      titleEl.textContent = title;
      if (titleEl.tagName === "A") titleEl.href = titleUrl;
      nav.appendChild(titleEl);
    }

    var scroller = document.createElement("div");
    scroller.className = "sn-nav__scroller";

    var list = document.createElement("ul");
    list.className = "sn-nav__list";

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
      }

      li.appendChild(a);
      list.appendChild(li);
    });

    scroller.appendChild(list);
    nav.appendChild(scroller);
    el.appendChild(nav);

    watchSize(el, scroller);
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
      el.setAttribute("data-narrow", el.clientWidth < NARROW_WIDTH ? "true" : "false");
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
    var navs = document.querySelectorAll("[data-site-nav]:not([data-site-nav-ready])");
    Array.prototype.forEach.call(navs, function (el) {
      el.setAttribute("data-site-nav-ready", "true");
      getLinks(el).then(function (links) {
        render(el, links);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  // Squarespace sometimes swaps page content in without a full reload, so we
  // expose this for a manual re-run if that ever happens.
  window.SiteNav = { refresh: start };
})();
