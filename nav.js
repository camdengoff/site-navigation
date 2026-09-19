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
