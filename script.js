/* ==========================================================================
   KabuK Exchange — site behavior (vanilla JS, no build step)
   --------------------------------------------------------------------------
   Responsibilities:
     1. Load site-config.json  -> Partner Login URL, footer links, form routing
     2. Localization           -> swap text via data-i18n, remember choice
     3. Mobile nav toggle
     4. Scroll-in reveal animation
     5. Ecosystem directory     -> render + filter from partners.json
     6. Lead forms              -> mailto (default) or API, driven by config
     7. Ecosystem visual        -> animated SVG connectors for [data-eco]
   Everything degrades gracefully if a JSON file fails to load.
   ========================================================================== */

(function () {
  "use strict";

  var LANG_KEY = "kbkx-lang";
  var DEFAULT_LANG = "en";

  // Cached config, resolved once and shared across features.
  var siteConfig = null;

  // Site root URL, derived from THIS script's own location. Because the pages
  // load script.js with a relative src ("script.js" / "../script.js"), its
  // resolved .src always points at <site-root>/script.js — so stripping the
  // filename gives the site root. This makes fetches + root-absolute config
  // links work at any mount point (domain root, GitHub Pages /repo/ subpath,
  // or a local server) without hardcoding a base path.
  var BASE = (function () {
    var s = document.currentScript;
    if (!s) { var all = document.getElementsByTagName("script"); s = all[all.length - 1]; }
    var src = (s && s.src) || "";
    return src ? src.replace(/[^/]*$/, "") : "";
  })();

  // Resolve a config href that may be root-absolute ("/hotels/") against BASE,
  // while leaving external (http, mailto, #…) links untouched.
  function resolveHref(href) {
    if (!href) return "#";
    if (/^(https?:|mailto:|tel:|#|\/\/)/i.test(href)) return href;
    if (href.charAt(0) === "/") return BASE + href.slice(1);
    return href;
  }

  /* ---------------------------------------------------------------------
     Small helpers
     --------------------------------------------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function fetchJSON(path) {
    return fetch(path, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("Failed to load " + path + " (" + r.status + ")");
      return r.json();
    });
  }

  /* ---------------------------------------------------------------------
     1. Site config
     --------------------------------------------------------------------- */
  function loadConfig() {
    return fetchJSON(BASE + "site-config.json")
      .then(function (cfg) { siteConfig = cfg; return cfg; })
      .catch(function (err) {
        console.warn("[KabuK Exchange] Using fallback config:", err.message);
        siteConfig = {
          adminConsoleUrl: "#",
          leadRouting: {},
          formMode: "mailto",
          footerLinks: [],
          companyLinks: []
        };
        return siteConfig;
      });
  }

  function applyConfig(cfg) {
    validateConfig(cfg);

    // Partner Login links (there may be more than one — desktop + mobile).
    $all("[data-role='partner-login']").forEach(function (a) {
      a.setAttribute("href", cfg.adminConsoleUrl || "#");
      a.setAttribute("rel", "noopener");
    });

    // KabuK Platform is a separate product/site. Configure its public URL once
    // in site-config.json -> kabukPlatformUrl. Until a real (non-placeholder)
    // URL is set, links render as a non-clickable "Learn more soon" treatment.
    var platformUrl = cfg.kabukPlatformUrl || "";
    var platformReady = !!platformUrl && platformUrl !== "#" && !/example\./i.test(platformUrl);
    $all("[data-role='kabuk-platform-link']").forEach(function (a) {
      if (platformReady) {
        a.setAttribute("href", resolveHref(platformUrl));
        a.setAttribute("rel", "noopener");
        if (/^https?:/i.test(platformUrl)) a.setAttribute("target", "_blank");
        a.classList.remove("is-disabled-link");
        a.removeAttribute("aria-disabled");
      } else {
        a.removeAttribute("href");
        a.removeAttribute("target");
        a.setAttribute("aria-disabled", "true");
        a.classList.add("is-disabled-link");
        var soonKey = a.getAttribute("data-soon-i18n");
        var label = soonKey ? a.querySelector("[data-i18n]") : null;
        if (label) label.setAttribute("data-i18n", soonKey);
        var arrow = a.querySelector(".arrow");
        if (arrow && soonKey) arrow.parentNode.removeChild(arrow);
        if (!soonKey) a.setAttribute("title", "Coming soon");
      }
    });

    // Lead forms: label the submit button honestly for the configured mode.
    var mailto = (cfg.formMode || "mailto") !== "api" || !cfg.apiEndpoint;
    $all("form[data-lead-form]").forEach(function (form) {
      var btn = form.querySelector("[type='submit']");
      if (btn) btn.setAttribute("data-i18n", mailto ? "form.submitMailto" : "form.submit");
      var note = form.querySelector(".form-note");
      if (note) note.setAttribute("data-i18n", mailto ? "form.noteMailto" : "form.noteApi");
    });
    if (currentLang) applyLang(currentLang);

    // Developer and documentation destinations are edited once in site-config.json.
    var devLinks = cfg.developerLinks || {};
    var roleMap = {
      "developer-docs-link": devLinks.developerDocsUrl,
      "api-reference-link": devLinks.apiReferenceUrl,
      "sandbox-link": devLinks.sandboxUrl,
      "changelog-link": devLinks.changelogUrl,
      "integration-support-link": devLinks.integrationSupportUrl
    };
    Object.keys(roleMap).forEach(function (role) {
      $all("[data-role='" + role + "']").forEach(function (a) {
        if (roleMap[role]) a.setAttribute("href", resolveHref(roleMap[role]));
      });
    });

    // Footer: KabuK Exchange site links (always text)
    renderFooterLinks("[data-footer='site']", cfg.footerLinks);
    // Footer: KabuK Style Inc. company links — text or icon variant (A/B)
    renderFooterLinks("[data-footer='company']", cfg.companyLinks, cfg.footerCompanyStyle === "icons");
    applyFeatureFlags(cfg);
  }

  // Surface obvious config mistakes in the console for whoever is editing
  // site-config.json — missing keys, empty link lists, unreplaced placeholders.
  function validateConfig(cfg) {
    var problems = [];
    if (!cfg.adminConsoleUrl || cfg.adminConsoleUrl === "#") {
      problems.push("adminConsoleUrl is missing");
    } else if (/example\.com/.test(cfg.adminConsoleUrl)) {
      problems.push("adminConsoleUrl still points at a PLACEHOLDER (example.com)");
    }
    var routing = cfg.leadRouting || {};
    ["partnerEmail", "hotelEmail", "generalEmail"].forEach(function (k) {
      if (!routing[k]) problems.push("leadRouting." + k + " is missing");
      else if (/example\.com/.test(routing[k])) problems.push("leadRouting." + k + " is a PLACEHOLDER (example.com)");
    });
    if (!Array.isArray(cfg.footerLinks) || !cfg.footerLinks.length) problems.push("footerLinks is empty");
    if (!Array.isArray(cfg.companyLinks) || !cfg.companyLinks.length) problems.push("companyLinks is empty");
    if (!cfg.kabukPlatformUrl || /example\./i.test(cfg.kabukPlatformUrl)) problems.push("kabukPlatformUrl is a PLACEHOLDER (links show 'Learn more soon')");
    if (cfg.formMode === "api" && !cfg.apiEndpoint) problems.push('formMode is "api" but apiEndpoint is missing');

    if (problems.length) {
      console.warn("[KabuK Exchange] site-config.json review needed:\n - " + problems.join("\n - "));
    }
  }

  function renderFooterLinks(sel, links, asIcons) {
    var ul = $(sel);
    if (!ul || !Array.isArray(links)) return;
    ul.innerHTML = "";
    ul.classList.toggle("footer-icons", !!asIcons);
    links.forEach(function (link) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = resolveHref(link.href);   // "/hotels/" resolves against the site root
      var external = /^https?:/i.test(link.href || "");
      if (external) { a.target = "_blank"; a.rel = "noopener"; }

      if (asIcons) {
        // Icon variant (A/B): show the service icon; label lives in aria-label/title.
        a.className = "footer-icon";
        a.setAttribute("aria-label", link.label || "");
        a.setAttribute("title", link.label || "");
        var paths = ICON_PATHS[link.icon] || ICON_PATHS.link;
        a.innerHTML = "<svg " + ICON_ATTRS + ">" + paths + "</svg>";
      } else {
        a.textContent = link.label || "";
      }
      li.appendChild(a);
      ul.appendChild(li);
    });
  }



  /* ---------------------------------------------------------------------
     Future modules / feature flags
     --------------------------------------------------------------------- */
  function applyFeatureFlags(cfg) {
    var flags = (cfg && cfg.features) || {};
    $all("[data-feature]").forEach(function (el) {
      var key = el.getAttribute("data-feature");
      var enabled = flags[key] === true;
      el.classList.toggle("is-enabled", enabled);
      el.setAttribute("aria-hidden", enabled ? "false" : "true");
    });
    $all("[data-role='status-link']").forEach(function (a) {
      a.setAttribute("href", cfg.statusPageUrl || "#");
    });
  }

  function initCarousels() {
    $all("[data-carousel]").forEach(function (carousel) {
      var track = $(".carousel-track", carousel);
      var prev = $(".carousel-control.prev", carousel);
      var next = $(".carousel-control.next", carousel);
      if (!track) return;
      function move(direction) {
        var amount = Math.max(260, Math.round(track.clientWidth * 0.8));
        track.scrollBy({ left: direction * amount, behavior: "smooth" });
      }
      if (prev) prev.addEventListener("click", function () { move(-1); });
      if (next) next.addEventListener("click", function () { move(1); });
    });
  }

  /* ---------------------------------------------------------------------
     2. Localization
     --------------------------------------------------------------------
     Copy lives in per-language JSON files under i18n/ (see i18n/README.md):
       i18n/languages.json  -> the list of languages + labels + direction
       i18n/<code>.json     -> the strings for one language (e.g. i18n/ja.json)
     Files are fetched at runtime and cached. Missing keys fall back to English,
     so a partial translation never breaks the page. */
  var I18N_DIR = BASE + "i18n/";
  var bundledI18n = window.KBKX_I18N || null;
  var LANGUAGES = bundledI18n && Array.isArray(bundledI18n.languages)
    ? bundledI18n.languages
    : [{ code: "en", label: "English", dir: "ltr" }];
  var TRANSLATIONS =
    bundledI18n && bundledI18n.translations
      ? bundledI18n.translations
      : {};

  var currentLang = null;
  var afterLangHooks = [];   // e.g. ecosystem visual re-measures after text changes

  // Accept nested ({"nav":{"home":"…"}}) or flat ({"nav.home":"…"}) JSON.
  function flattenDict(obj, prefix, out) {
    out = out || {};
    Object.keys(obj || {}).forEach(function (k) {
      var key = prefix ? prefix + "." + k : k;
      var v = obj[k];
      if (v && typeof v === "object" && !Array.isArray(v)) flattenDict(v, key, out);
      else if (typeof v === "string") out[key] = v;
    });
    return out;
  }

  function getLang() {
    var stored = null;
    try { stored = localStorage.getItem(LANG_KEY); } catch (e) {}
    if (stored && LANGUAGES.some(function (l) { return l.code === stored; })) return stored;
    // Try to match the browser language against what we support.
    var nav = (navigator.language || "").toLowerCase();
    var match = LANGUAGES.filter(function (l) {
      return nav === l.code.toLowerCase() || nav.split("-")[0] === l.code.split("-")[0].toLowerCase();
    })[0];
    return match ? match.code : DEFAULT_LANG;
  }

  // Fetch (and cache) one language's strings.
  function loadLang(code) {
    if (TRANSLATIONS[code]) return Promise.resolve(TRANSLATIONS[code]);
    return fetchJSON(I18N_DIR + code + ".json")
      .then(function (d) { TRANSLATIONS[code] = flattenDict(d); return TRANSLATIONS[code]; })
      .catch(function (err) {
        console.warn("[KabuK Exchange] Missing translation file: " + code + ".json", err.message);
        TRANSLATIONS[code] = {};
        return TRANSLATIONS[code];
      });
  }

  // Apply an already-loaded language to the DOM (English used as fallback).
  function applyLang(code) {
    var dict = TRANSLATIONS[code] || {};
    var en = TRANSLATIONS[DEFAULT_LANG] || {};
    function T(key) { return dict[key] ? dict[key] : en[key]; }
    currentLang = code;

    var langMeta = LANGUAGES.filter(function (l) { return l.code === code; })[0] || {};
    document.documentElement.setAttribute("lang", code);
    document.documentElement.setAttribute("dir", langMeta.dir || "ltr");

    $all("[data-i18n]").forEach(function (el) {
      var v = T(el.getAttribute("data-i18n"));
      if (v != null) el.textContent = v;
    });
    $all("[data-i18n-placeholder]").forEach(function (el) {
      var v = T(el.getAttribute("data-i18n-placeholder"));
      if (v != null) el.setAttribute("placeholder", v);
    });
    $all("[data-i18n-aria-label]").forEach(function (el) {
      var v = T(el.getAttribute("data-i18n-aria-label"));
      if (v != null) el.setAttribute("aria-label", v);
    });

    var sel = $("#lang-select");
    if (sel) sel.value = code;
    afterLangHooks.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  // Public: switch language. Ensures English (fallback) + target are loaded.
  function setLang(code) {
    if (!LANGUAGES.some(function (l) { return l.code === code; })) code = DEFAULT_LANG;
    try { localStorage.setItem(LANG_KEY, code); } catch (e) {}
    Promise.all([loadLang(DEFAULT_LANG), loadLang(code)]).then(function () { applyLang(code); });
  }

  function buildLangSelector() {
    var sel = $("#lang-select");
    if (!sel) return;
    sel.innerHTML = "";
    LANGUAGES.forEach(function (l) {
      var opt = document.createElement("option");
      opt.value = l.code;
      opt.textContent = l.label;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function () { setLang(sel.value); });
  }

  // Load the language manifest, build the selector, apply the active language.
  function initI18n() {
    return fetchJSON(I18N_DIR + "languages.json")
      .then(function (list) {
        if (Array.isArray(list) && list.length) LANGUAGES = list;
      })
      .catch(function (err) {
        console.warn("[KabuK Exchange] Could not load i18n/languages.json — defaulting to English.", err.message);
      })
      .then(function () {
        buildLangSelector();
        setLang(getLang());
      });
  }

  /* ---------------------------------------------------------------------
     3. Mobile nav toggle
     --------------------------------------------------------------------- */
  // Mark the nav link for the current page. Done in JS so the header markup
  // is identical on every page (see partials/header.html + build.py).
  // Clean-URL aware: normalizes "/hotels/", "/hotels/index.html" and "/hotels"
  // to the same path so the match works regardless of how the host serves it.
  function normPath(p) {
    p = (p || "/").toLowerCase().replace(/index\.html$/, "");
    if (p.length > 1 && p.charAt(p.length - 1) === "/") p = p.slice(0, -1);
    return p || "/";
  }
  function markActiveNav() {
    var here = normPath(location.pathname);
    $all(".main-nav a").forEach(function (a) {
      // Hash links (/#why-kbkx) are in-page sections, not the current page.
      if (!a.hash && normPath(a.pathname) === here) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function initNav() {
    markActiveNav();
    var header = $(".site-header");
    var toggle = $(".nav-toggle");
    if (!header || !toggle) return;
    function setOpen(open) {
      header.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
    toggle.addEventListener("click", function () { setOpen(!header.classList.contains("open")); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && header.classList.contains("open") && !$(".has-dropdown.open")) { setOpen(false); toggle.focus(); }
    });
    // Subtle border/shadow once the page scrolls under the light header.
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    // Close the menu after tapping any link inside it (nav or CTA) on mobile.
    $all(".header-menu a").forEach(function (a) {
      a.addEventListener("click", function () {
        header.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // Accessible disclosure menus (Solutions, Network). Click/tap/Enter toggles;
  // on desktop CSS also opens on hover, and we keep aria-expanded in sync.
  function initDropdowns() {
    var items = $all(".has-dropdown");
    if (!items.length) return;
    var desktop = window.matchMedia("(min-width: 1101px) and (hover: hover)");

    function closeAll(except) {
      items.forEach(function (li) {
        if (li === except) return;
        li.classList.remove("open");
        var b = li.querySelector(".dropdown-toggle");
        if (b) b.setAttribute("aria-expanded", "false");
      });
    }

    items.forEach(function (li) {
      var btn = li.querySelector(".dropdown-toggle");
      if (!btn) return;

      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var willOpen = !li.classList.contains("open");
        closeAll(li);
        li.classList.toggle("open", willOpen);
        btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      });

      // Desktop: reflect hover/focus (which CSS uses to open) in aria-expanded.
      li.addEventListener("mouseenter", function () { if (desktop.matches) btn.setAttribute("aria-expanded", "true"); });
      li.addEventListener("mouseleave", function () {
        if (desktop.matches && !li.classList.contains("open")) btn.setAttribute("aria-expanded", "false");
      });
      // Keyboard: Enter/Space on the toggle opens (click handler); tabbing out closes.
      li.addEventListener("focusout", function (e) {
        if (e.relatedTarget && !li.contains(e.relatedTarget)) {
          li.classList.remove("open");
          btn.setAttribute("aria-expanded", "false");
        }
      });
    });

    // Click outside closes any open dropdown.
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".has-dropdown")) closeAll(null);
    });
    // Escape closes and returns focus to the toggle.
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var open = $(".has-dropdown.open");
      if (!open) return;
      var b = open.querySelector(".dropdown-toggle");
      open.classList.remove("open");
      if (b) { b.setAttribute("aria-expanded", "false"); b.focus(); }
    });
    // Selecting an item closes the dropdown (mobile menu close is handled in initNav).
    $all(".dropdown-item").forEach(function (a) {
      a.addEventListener("click", function () { closeAll(null); });
    });
  }

  /* ---------------------------------------------------------------------
     4. Scroll-in reveal
     --------------------------------------------------------------------- */
  function initReveal() {
    var els = $all(".reveal");
    if (!els.length) return;

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------------------------------------------------------------------
     5. Ecosystem directory (homepage only)
     --------------------------------------------------------------------- */
  function initEcosystem() {
    var grid = $("#eco-grid");
    var filterBar = $("#eco-filter");
    if (!grid) return;

    fetchJSON(BASE + "partners.json").then(function (data) {
      var categories = data.categories || [];
      var entries = data.entries || [];

      // Build filter buttons
      if (filterBar) {
        filterBar.innerHTML = "";
        categories.forEach(function (cat, i) {
          var btn = document.createElement("button");
          btn.className = "filter-btn" + (i === 0 ? " active" : "");
          btn.type = "button";
          btn.textContent = cat.label;
          btn.setAttribute("data-cat", cat.id);
          btn.addEventListener("click", function () {
            $all(".filter-btn", filterBar).forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
            render(cat.id);
          });
          filterBar.appendChild(btn);
        });
      }

      function render(catId) {
        grid.innerHTML = "";
        entries
          .filter(function (e) { return catId === "all" || e.category === catId; })
          .forEach(function (e) {
            var card = document.createElement("article");
            card.className = "card eco-card reveal in";
            var catLabel = (categories.filter(function (c) { return c.id === e.category; })[0] || {}).label || e.category;
            card.innerHTML =
              '<span class="eco-tag"></span>' +
              '<h3></h3>' +
              '<span class="eco-meta"></span>' +
              '<p></p>';
            card.querySelector(".eco-tag").textContent = e.tag || catLabel;
            card.querySelector("h3").textContent = e.name || "";
            card.querySelector(".eco-meta").textContent = [catLabel, e.region].filter(Boolean).join(" · ");
            card.querySelector("p").textContent = e.description || "";
            grid.appendChild(card);
          });

        if (!grid.children.length) {
          grid.innerHTML = '<p class="lead">No entries in this category yet.</p>';
        }
      }

      render("all");
    }).catch(function (err) {
      grid.innerHTML = '<p class="lead">Ecosystem data could not be loaded.</p>';
      console.warn("[KabuK Exchange]", err.message);
    });
  }

  /* ---------------------------------------------------------------------
     6. Lead forms
     --------------------------------------------------------------------- */
  function initForms() {
    var forms = $all("form[data-lead-form]");
    if (!forms.length) return;

    forms.forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var status = form.querySelector(".form-status");

        // Honeypot: real users never see or fill this field. If it has a
        // value, it's almost certainly a bot — silently drop the submission.
        var hp = form.querySelector('input[name="_hp"]');
        if (hp && hp.value) return;

        // Native validation first (covers required fields + consent checkbox).
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }

        var mode = (siteConfig && siteConfig.formMode) || "mailto";
        var routing = (siteConfig && siteConfig.leadRouting) || {};
        // Which mailbox? Driven by the form's data attribute -> config key.
        var routeKey = form.getAttribute("data-route") || "generalEmail";
        var target = routing[routeKey] || routing.generalEmail || "hello@example.com";

        var payload = serializeForm(form);

        if (mode === "api" && siteConfig && siteConfig.apiEndpoint) {
          submitToApi(form, status, payload);
        } else {
          submitViaMailto(form, target, payload);
          setStatus(status, "success", t("form.statusMailto", "Opening your email application… If nothing happens, email us at {email}.").replace("{email}", target));
        }
      });
    });
  }

  // Collect readable label/value pairs; checkboxes grouped by name.
  function serializeForm(form) {
    var fields = [];
    var checkboxGroups = {};

    $all("input, select, textarea", form).forEach(function (el) {
      if (!el.name || el.type === "submit") return;
      // Skip internal fields (honeypot, etc.) — names prefixed with "_".
      if (el.name.charAt(0) === "_") return;
      var label = labelFor(el, form);

      if (el.type === "radio") {
        if (el.checked) fields.push({ label: label, value: el.value });
        return;
      }
      if (el.type === "checkbox") {
        if (el.checked) {
          checkboxGroups[el.name] = checkboxGroups[el.name] || { label: label, values: [] };
          checkboxGroups[el.name].values.push(el.value);
        }
        return;
      }
      if (el.value) fields.push({ label: label, value: el.value });
    });

    Object.keys(checkboxGroups).forEach(function (name) {
      var g = checkboxGroups[name];
      fields.push({ label: g.label, value: g.values.join(", ") });
    });

    return fields;
  }

  function labelFor(el, form) {
    // Prefer an associated <label>, then a group heading, then the field name.
    if (el.id) {
      var lbl = form.querySelector('label[for="' + el.id + '"]');
      if (lbl) return lbl.textContent.replace(/\*|\(.*?\)/g, "").trim();
    }
    var group = el.closest("[data-group-label]");
    if (group) return group.getAttribute("data-group-label");
    return el.name;
  }

  function submitViaMailto(form, target, fields) {
    var subject = form.getAttribute("data-subject") || "KabuK Exchange enquiry";
    var body = fields.map(function (f) { return f.label + ": " + f.value; }).join("\n");
    var href = "mailto:" + encodeURIComponent(target) +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
    window.location.href = href;
  }

  function submitToApi(form, status, fields) {
    setStatus(status, "", "Sending…");
    var obj = {};
    fields.forEach(function (f) { obj[f.label] = f.value; });
    fetch(siteConfig.apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ form: form.getAttribute("data-route"), fields: obj })
    }).then(function (r) {
      if (!r.ok) throw new Error("Request failed (" + r.status + ")");
      setStatus(status, "success", "Thank you — we have received your details and will be in touch.");
      form.reset();
    }).catch(function (err) {
      setStatus(status, "error", "Something went wrong. Please email us directly. (" + err.message + ")");
    });
  }

  function t(key, fallback) {
    var d = TRANSLATIONS[currentLang] || {}, en = TRANSLATIONS[DEFAULT_LANG] || {};
    return d[key] || en[key] || fallback;
  }

  function setStatus(el, kind, msg) {
    if (!el) return;
    el.className = "form-status" + (kind ? " " + kind : "");
    el.textContent = msg;
  }

  /* ---------------------------------------------------------------------
     7. Inline SVG icons
     --------------------------------------------------------------------- */
  // Stroke-based line icons (24x24, currentColor). Add an element with
  // data-icon="key" and its glyph is injected here. Purely decorative.
  var ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
    'width="24" height="24" aria-hidden="true" focusable="false"';

  var ICON_PATHS = {
    hotel: '<path d="M3 21h18"/><path d="M5 21V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v16"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>',
    box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M4 7.5l8 4.5 8-4.5"/><path d="M12 12v9"/>',
    plug: '<path d="M9 2v6M15 2v6"/><path d="M7 8h10v3a5 5 0 0 1-10 0V8z"/><path d="M12 16v6"/>',
    handshake: '<path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1"/><circle cx="9.5" cy="8" r="3"/><path d="M21 19v-1a4 4 0 0 0-3-3.87"/><path d="M15.5 5.13A3 3 0 0 1 15.5 11"/>',
    japan: '<path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
    lifebuoy: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M5.6 5.6l3.3 3.3M15.1 15.1l3.3 3.3M18.4 5.6l-3.3 3.3M8.9 15.1l-3.3 3.3"/>',
    sliders: '<path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    rocket: '<path d="M12 3c3 1 5 4 5 8l-2 4H9l-2-4c0-4 2-7 5-8z"/><circle cx="12" cy="9" r="1.6"/><path d="M9 15l-2 4M15 15l2 4"/>',
    chart: '<path d="M3 21h18"/><path d="M6 18v-6M11 18V7M16 18v-3"/>',
    sparkle: '<path d="M12 3l1.7 4.6L18.3 9l-4.6 1.7L12 15l-1.7-4.3L5.7 9l4.6-1.4L12 3z"/><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    link: '<path d="M9 15l6-6"/><path d="M10.5 6.5L12 5a4 4 0 0 1 5.7 5.7L15 13"/><path d="M13.5 17.5L12 19a4 4 0 0 1-5.7-5.7L9 11"/>',
    building: '<path d="M3 21h18"/><path d="M5 21V8l6-4v17"/><path d="M11 21V10l8 3v8"/><path d="M7.5 9h1M7.5 13h1M7.5 17h1M14.5 14h1M14.5 17h1"/>',
    growth: '<path d="M3 17l6-6 4 4 8-8"/><path d="M21 7h-5M21 7v5"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
    antenna: '<path d="M12 12v9M8 21h8"/><path d="M5 8a7 7 0 0 1 14 0M8 10a4 4 0 0 1 8 0"/><circle cx="12" cy="12" r="1.5"/>',
    puzzle: '<path d="M9 5a1.6 1.6 0 0 1 3.2 0c0 .9.6 1.1 1.1 1.1H15a1 1 0 0 1 1 1v1.7c0 .5.2 1.1 1.1 1.1a1.6 1.6 0 0 1 0 3.2c-.9 0-1.1.6-1.1 1.1V17a1 1 0 0 1-1 1h-1.7c-.5 0-1.1.2-1.1 1.1a1.6 1.6 0 0 1-3.2 0c0-.9-.6-1.1-1.1-1.1H5a1 1 0 0 1-1-1v-1.7c0-.5-.2-1.1-1.1-1.1a1.6 1.6 0 0 1 0-3.2c.9 0 1.1-.6 1.1-1.1V7a1 1 0 0 1 1-1h1.9c.5 0 1.1-.2 1.1-1z"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
    // footer service icons
    bed: '<path d="M3 8v11M3 13h16a2 2 0 0 1 2 2v4M3 19h18"/><path d="M7 13v-2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/>',
    newspaper: '<rect x="3" y="5" width="15" height="15" rx="1.5"/><path d="M18 8h1.5a1.5 1.5 0 0 1 1.5 1.5V18a2 2 0 0 1-2 2H5"/><path d="M6 9h6M6 13h9M6 17h7"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M4 7l8 6 8-6"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    member: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10h3.5M14.5 13.5h2.5"/>'
  };

  function initIcons() {
    $all("[data-icon]").forEach(function (el) {
      var key = el.getAttribute("data-icon");
      var paths = ICON_PATHS[key];
      if (paths) el.innerHTML = "<svg " + ICON_ATTRS + ">" + paths + "</svg>";
    });
  }

  /* ---------------------------------------------------------------------
     8. Cookie / analytics consent
     --------------------------------------------------------------------- */
  var CONSENT_KEY = "kbkx-cookie-consent";

  // Placeholder analytics loader. It only runs AFTER the user opts in.
  // Drop your real analytics snippet inside this function.
  function loadAnalytics() {
    if (window.__kbkxAnalyticsLoaded) return;
    window.__kbkxAnalyticsLoaded = true;
    // e.g. inject a <script> tag for your analytics provider here.
    console.info("[KabuK Exchange] Analytics consent granted — load analytics here.");
  }

  function initCookieBanner() {
    var choice = null;
    try { choice = localStorage.getItem(CONSENT_KEY); } catch (e) {}
    if (choice === "accepted") { loadAnalytics(); return; }
    if (choice === "declined") { return; }

    // Build the banner. Text uses data-i18n so the later setLang() pass fills it.
    var bar = document.createElement("div");
    bar.className = "cookie-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Cookie consent");
    bar.innerHTML =
      '<p class="cookie-text" data-i18n="cookie.text">We use optional analytics cookies to understand how the site is used. You can accept or decline.</p>' +
      '<div class="cookie-actions">' +
      '<button type="button" class="btn btn-secondary" data-cookie="decline" data-i18n="cookie.decline">Decline</button>' +
      '<button type="button" class="btn btn-primary" data-cookie="accept" data-i18n="cookie.accept">Accept</button>' +
      "</div>";

    function close(value) {
      try { localStorage.setItem(CONSENT_KEY, value); } catch (e) {}
      if (value === "accepted") loadAnalytics();
      bar.parentNode && bar.parentNode.removeChild(bar);
    }
    bar.querySelector('[data-cookie="accept"]').addEventListener("click", function () { close("accepted"); });
    bar.querySelector('[data-cookie="decline"]').addEventListener("click", function () { close("declined"); });

    document.body.appendChild(bar);
  }

  /* ---------------------------------------------------------------------
     9. Ecosystem visual — SUPPLY → KABUK EXCHANGE → DISTRIBUTION
     ---------------------------------------------------------------------
     Markup: partials/ecosystem.html (synced by build.py) inside any
     <div class="eco" data-eco>. Everything is readable as plain HTML lists;
     this enhancer only measures the DOM and draws connectors + pulses into
     an aria-hidden SVG on wide screens. Mobile uses a CSS stacked layout,
     and prefers-reduced-motion gets static connectors with no pulses. */
  var SVG_NS = "http://www.w3.org/2000/svg";
  var ecoCount = 0;

  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function initEcoVisuals() {
    $all("[data-eco]").forEach(setupEco);
  }

  function setupEco(root) {
    var grid = $(".eco__grid, .eco__stack", root);
    var hub = $("[data-eco-hub]", root);
    if (!grid || !hub) return;
    var uid = "eco" + (++ecoCount);
    // Every connected element declares its flow relative to its target (the hub
    // unless data-eco-to names another element id):
    //   data-eco-node="in"   element -> target     "out"  target -> element
    //                 "both" two-way pulses        "none" static line, no pulse
    //   data-eco-style="rail" (dashed) | "found" (foundation) | "tree" (ownership)
    var links = $all("[data-eco-node]", root);
    var nodes = links.filter(function (n) { return n.classList.contains("eco-node"); });
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    var wide = window.matchMedia("(min-width: " + (root.getAttribute("data-eco-min") || "901") + "px)");
    var visible = false, drawnOnce = false, pending = false;

    var svg = svgEl("svg", { "class": "eco__wires", "aria-hidden": "true", focusable: "false" });
    grid.insertBefore(svg, grid.firstChild);

    function defs() {
      return '<defs><radialGradient id="' + uid + '-glow"><stop offset="0" stop-color="#38C3E2" stop-opacity=".55"/><stop offset="1" stop-color="#38C3E2" stop-opacity="0"/></radialGradient></defs>';
    }

    function rel(el, gr) {
      var r = el.getBoundingClientRect();
      return { l: r.left - gr.left, r: r.right - gr.left, t: r.top - gr.top, b: r.bottom - gr.top,
               cx: (r.left + r.right) / 2 - gr.left, cy: (r.top + r.bottom) / 2 - gr.top };
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function f(n) { return n.toFixed(1); }
    function hCurve(x1, y1, x2, y2) { var m = (x1 + x2) / 2; return "M" + f(x1) + " " + f(y1) + " C" + f(m) + " " + f(y1) + " " + f(m) + " " + f(y2) + " " + f(x2) + " " + f(y2); }
    function vCurve(x1, y1, x2, y2) { var m = (y1 + y2) / 2; return "M" + f(x1) + " " + f(y1) + " C" + f(x1) + " " + f(m) + " " + f(x2) + " " + f(m) + " " + f(x2) + " " + f(y2); }

    function addPulse(group, pathId, opts) {
      var dur = opts.dur + "s";
      var begin = (svg.getCurrentTime ? svg.getCurrentTime() : 0) + opts.begin;
      var g = svgEl("g", { opacity: "0" });
      g.appendChild(svgEl("circle", { r: opts.glow || 8, "class": "eco-pulse-glow", fill: "url(#" + uid + "-glow)" }));
      g.appendChild(svgEl("circle", { r: opts.r || 2.8, "class": opts.cls || "eco-pulse" }));
      var motion = svgEl("animateMotion", {
        dur: dur, begin: begin.toFixed(2) + "s", repeatCount: "indefinite",
        calcMode: "spline", keyTimes: opts.keyTimes || "0;1", keyPoints: opts.keyPoints || "0;1",
        keySplines: opts.keySplines || ".45 0 .4 1"
      });
      var mp = svgEl("mpath", {});
      mp.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + pathId);
      mp.setAttribute("href", "#" + pathId);
      motion.appendChild(mp);
      g.appendChild(motion);
      g.appendChild(svgEl("animate", {
        attributeName: "opacity", dur: dur, begin: begin.toFixed(2) + "s", repeatCount: "indefinite",
        values: opts.fade || "0;1;1;0", keyTimes: opts.fadeTimes || "0;.12;.85;1"
      }));
      group.appendChild(g);
    }

    function draw() {
      pending = false;
      svg.innerHTML = defs();
      if (!wide.matches) { root.classList.remove("is-wired"); return; }
      var gr = grid.getBoundingClientRect();
      if (!gr.width) return;
      svg.setAttribute("viewBox", "0 0 " + gr.width.toFixed(0) + " " + gr.height.toFixed(0));
      var animateIn = visible && !drawnOnce && !reduce.matches;
      var wires = svgEl("g", {});
      var pulses = svgEl("g", { "class": "eco-pulses" });
      svg.appendChild(wires);

      // 1) Measure every link and decide orientation + side relative to its target.
      var items = links.map(function (el) {
        var toId = el.getAttribute("data-eco-to");
        var target = (toId && document.getElementById(toId)) || hub;
        var r = rel(el, gr), t = rel(target, gr);
        var horizontal = r.r <= t.l || r.l >= t.r;   // no horizontal overlap
        var side = horizontal ? (r.cx < t.cx ? "left" : "right") : (r.cy < t.cy ? "top" : "bottom");
        return { el: el, target: target, r: r, t: t, horizontal: horizontal, side: side,
                 mode: el.getAttribute("data-eco-node") || "in", style: el.getAttribute("data-eco-style") || "" };
      });
      // 2) Fan multiple wires evenly along the same edge of the same target.
      var groups = {};
      items.forEach(function (it) {
        if (!it.horizontal) return;
        var k = (it.target.id || "hub") + ":" + it.side;
        (groups[k] = groups[k] || []).push(it);
      });
      Object.keys(groups).forEach(function (k) {
        var g = groups[k];
        g.sort(function (a, b) { return a.r.cy - b.r.cy; });
        g.forEach(function (it, i) {
          it.spread = g.length > 1 ? (i / (g.length - 1)) : null;
        });
      });

      // 3) Draw.
      items.forEach(function (it, i) {
        var d, a, b;
        if (it.horizontal) {
          var nx = it.side === "left" ? it.r.r : it.r.l;
          var tx = it.side === "left" ? it.t.l : it.t.r;
          var ty = it.spread == null
            ? clamp(it.r.cy, it.t.t + 18, it.t.b - 18)
            : it.t.t + (it.t.b - it.t.t) * (0.22 + 0.56 * it.spread);
          a = [nx, it.r.cy]; b = [tx, ty];
          d = it.mode === "out" ? hCurve(b[0], b[1], a[0], a[1]) : hCurve(a[0], a[1], b[0], b[1]);
        } else {
          // Vertical link: drop straight down/up where the two boxes overlap.
          var x = clamp(it.t.cx, it.r.l + 18, it.r.r - 18);
          a = [x, it.side === "top" ? it.r.b : it.r.t];
          b = [clamp(x, it.t.l + 18, it.t.r - 18), it.side === "top" ? it.t.t : it.t.b];
          d = it.mode === "out" ? vCurve(b[0], b[1], a[0], a[1]) : vCurve(a[0], a[1], b[0], b[1]);
        }
        var id = uid + "-w" + i;
        var cls = "eco-wire" + (it.style ? " eco-wire--" + it.style : "");
        var drawable = it.style !== "rail";
        var path = svgEl("path", { id: id, d: d, "class": cls + (animateIn && drawable ? " draw" : "") });
        if (drawable) path.setAttribute("pathLength", "1");
        if (animateIn && drawable) path.style.transitionDelay = (0.35 + i * 0.06).toFixed(2) + "s";
        wires.appendChild(path);
        it.el._ecoWire = path;
        if (reduce.matches || it.mode === "none") return;
        var base = animateIn ? 1.4 : 0.2;
        if (it.mode === "both") {
          addPulse(pulses, id, { dur: it.style === "rail" ? 4.8 : 4.2, begin: base + 0.8 + (i % 4) * 0.6,
            r: it.style === "rail" ? 2.2 : 2.6, glow: it.style === "rail" ? 6 : 8,
            cls: "eco-pulse" + (it.style === "rail" ? " eco-pulse--rail" : ""),
            keyTimes: "0;.5;1", keyPoints: "0;1;0", keySplines: ".45 0 .4 1;.45 0 .4 1",
            fade: "0;1;1;1;0", fadeTimes: "0;.08;.5;.92;1" });
        } else if (it.style === "found") {
          addPulse(pulses, id, { dur: 2.8, begin: base + 0.4, r: 2.4, glow: 7 });
        } else {
          addPulse(pulses, id, { dur: 3.4 + (i % 3) * 0.35, begin: base + (it.mode === "out" ? 1.6 : 0) + (i % 5) * 0.55 });
        }
      });
      svg.appendChild(pulses);
      root.classList.add("is-wired");
      if (animateIn) {
        drawnOnce = true;
        svg.getBoundingClientRect();
        requestAnimationFrame(function () { root.classList.add("is-drawn"); });
      }
    }

    function schedule() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(draw);
    }

    // Hover / focus emphasis: highlight a node's connector.
    nodes.forEach(function (n) {
      n.addEventListener("mouseenter", function () { n.classList.add("is-active"); if (n._ecoWire) n._ecoWire.classList.add("is-active"); });
      n.addEventListener("mouseleave", function () { n.classList.remove("is-active"); if (n._ecoWire) n._ecoWire.classList.remove("is-active"); });
    });

    function reveal() {
      if (visible) return;
      visible = true;
      root.classList.add("is-visible");
      // Let the nodes settle (CSS stagger) before measuring and drawing.
      setTimeout(schedule, reduce.matches ? 0 : 60);
    }

    if (reduce.matches || !("IntersectionObserver" in window)) {
      reveal();
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) reveal();
          // Pause SMIL pulses while off-screen to save CPU/battery.
          if (svg.pauseAnimations) { if (e.isIntersecting) svg.unpauseAnimations(); else svg.pauseAnimations(); }
        });
      }, { threshold: 0.01, rootMargin: "0px 0px -80px 0px" });
      io.observe(root);
    }

    if ("ResizeObserver" in window) new ResizeObserver(schedule).observe(grid);
    else window.addEventListener("resize", schedule);
    if (wide.addEventListener) wide.addEventListener("change", schedule);
    if (reduce.addEventListener) reduce.addEventListener("change", schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    afterLangHooks.push(schedule);
    schedule();
  }

  /* ---------------------------------------------------------------------
     Boot
     --------------------------------------------------------------------- */
  function boot() {
    initCookieBanner();      // build banner first so the i18n pass can translate it
    $all("[data-current-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
    initNav();
    initDropdowns();
    initReveal();
    initIcons();
    initEcoVisuals();
    initEcosystem();
    initForms();
    initI18n();              // load i18n/ manifest + language files, then apply
    loadConfig().then(applyConfig);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
