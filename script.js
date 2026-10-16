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
    if (applyGates(cfg)) initLaunchFeatures(cfg);
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
      var active = "all";
      function L(key, fallback) { return key ? t(key, fallback) : fallback; }
      function catLabelOf(id) { var c = categories.filter(function (x) { return x.id === id; })[0] || {}; return L(c.i18n, c.label || id); }

      function drawFilters() {
        if (!filterBar) return;
        filterBar.innerHTML = "";
        categories.forEach(function (cat) {
          var btn = document.createElement("button");
          btn.className = "filter-btn" + (cat.id === active ? " active" : "");
          btn.type = "button";
          btn.textContent = L(cat.i18n, cat.label);
          btn.setAttribute("data-cat", cat.id);
          btn.setAttribute("aria-pressed", String(cat.id === active));
          btn.addEventListener("click", function () { active = cat.id; drawFilters(); render(); });
          filterBar.appendChild(btn);
        });
      }

      function render() {
        grid.innerHTML = "";
        entries
          .filter(function (e) { return active === "all" || e.category === active; })
          .forEach(function (e) {
            var card = document.createElement("article");
            card.className = "card eco-card reveal in";
            card.innerHTML = '<span class="eco-tag"></span><h3></h3><p></p>';
            card.querySelector(".eco-tag").textContent = L(e.tagI18n, e.tag || catLabelOf(e.category));
            card.querySelector("h3").textContent = L(e.i18n && e.i18n + ".t", e.name || "");
            card.querySelector("p").textContent = L(e.i18n && e.i18n + ".d", e.description || "");
            grid.appendChild(card);
          });
        if (!grid.children.length) {
          grid.innerHTML = '<p class="lead"></p>';
          grid.firstChild.textContent = t("hp.eco.none", "No entries in this category yet.");
        }
      }

      drawFilters(); render();
      afterLangHooks.push(function () { drawFilters(); render(); });
    }).catch(function (err) {
      grid.innerHTML = "";
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
        var target = routing[routeKey] || routing.generalEmail || "hello@kabukexchange.com";

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
      // Conditional fields that are currently hidden are not sent.
      if (el.closest("[hidden]")) return;
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
    route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8"/>',
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
        var drawable = it.style !== "rail" && it.style !== "connected";
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
          var slow = it.style === "connected";
          addPulse(pulses, id, { dur: (slow ? 4.2 : 3.4) + (i % 3) * 0.35, begin: base + (it.mode === "out" ? 1.6 : 0) + (i % 5) * 0.55,
            r: slow ? 2.3 : 2.8, glow: slow ? 6 : 8, cls: "eco-pulse" + (slow ? " eco-pulse--connected" : "") });
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
     10. Status badges — one catalog, consistent rendering
     ---------------------------------------------------------------------
     data/statuses.json        stable keys → tone, icon, localized labels
     data/product-roadmap.json product id → status + owner approval
     Markup:  <span class="status" data-product-status="agency-portal">Planned</span>
              <span class="status" data-status="beta">Beta</span>
     The element's text is the no-JS fallback. Guards:
       • unapproved items are hidden when reviewGate.showUnapprovedStatuses=false
       • unapproved items can never render live / available-to-partners /
         coming-soon (the badge is withheld and a console warning names it). */
  var STATUS_ICONS = {
    check: '<circle cx="6" cy="6" r="6"/><path d="M3.4 6.2l1.7 1.7 3.5-3.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    key: '<circle cx="6" cy="6" r="6"/><circle cx="6" cy="6" r="2.2" fill="#fff"/>',
    half: '<circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 1a5 5 0 0 1 0 10z"/>',
    progress: '<circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 1a5 5 0 0 1 5 5H6z"/>',
    link: '<path d="M4.5 7.5l3-3M5 3.4l.8-.8a2.2 2.2 0 0 1 3.1 3.1l-.8.8M7 8.6l-.8.8a2.2 2.2 0 0 1-3.1-3.1l.8-.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    clock: '<circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 3.4V6l1.8 1.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    ring: '<circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    dashed: '<circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.2 1.8"/>',
    alert: '<path d="M6 1.2l5 9.3H1z"/><path d="M6 4.6v2.6M6 8.7v.1" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>',
    minus: '<circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.6 6h4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    x: '<path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
  };
  var STATUS_NEEDS_APPROVAL = { "live": 1, "available-to-partners": 1, "coming-soon": 1 };
  var statusData = { catalog: null, roadmap: null };

  function statusLabel(key, lang) {
    var st = statusData.catalog && statusData.catalog.statuses[key];
    if (!st) return null;
    return (st.label && (st.label[lang] || st.label.en)) || key;
  }

  // Fill one element as a chip for a status key. Exposed for the gallery.
  function paintStatus(el, key, lang) {
    var st = statusData.catalog && statusData.catalog.statuses[key];
    if (!st) { el.hidden = true; return; }
    el.classList.add("status");
    el.setAttribute("data-status", key);
    el.setAttribute("data-tone", st.tone);
    el.innerHTML = '<svg class="status__icon" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" focusable="false">' +
      (STATUS_ICONS[st.icon] || STATUS_ICONS.ring) + '</svg><span class="status__text"></span>';
    el.querySelector(".status__text").textContent = statusLabel(key, lang);
    el.hidden = false;
  }

  function renderStatuses() {
    if (!statusData.catalog) return;
    var lang = currentLang || DEFAULT_LANG;
    var gate = (statusData.roadmap && statusData.roadmap.reviewGate) || {};
    var products = (statusData.roadmap && statusData.roadmap.products) || {};
    var shownUnapproved = [];
    $all("[data-status]:not([data-product-status])").forEach(function (el) {
      paintStatus(el, el.getAttribute("data-status"), lang);
    });
    $all("[data-product-status]").forEach(function (el) {
      var id = el.getAttribute("data-product-status");
      var p = products[id];
      if (!p) { el.hidden = true; console.warn("[KabuK Exchange] No roadmap entry for", id); return; }
      if (!p.approved && STATUS_NEEDS_APPROVAL[p.status]) {
        el.hidden = true;
        console.warn("[KabuK Exchange] Withheld unapproved '" + p.status + "' status for " + id + " — approve it in data/product-roadmap.json first.");
        return;
      }
      if (!p.approved && gate.showUnapprovedStatuses === false) { el.hidden = true; return; }
      paintStatus(el, p.status, lang);
      el.toggleAttribute("data-unapproved", !p.approved);
      if (!p.approved) shownUnapproved.push(id);
    });
    // Elements that only exist when a status is publicly shown.
    $all("[data-requires-status]").forEach(function (el) {
      var p = products[el.getAttribute("data-requires-status")];
      el.hidden = !p || (!p.approved && gate.showUnapprovedStatuses === false);
    });
    if (shownUnapproved.length && !renderStatuses._logged) {
      renderStatuses._logged = true;
      console.info("[KabuK Exchange] Showing statuses pending owner approval:", shownUnapproved.join(", "));
    }
  }

  function initStatuses() {
    var ready = Promise.all([
      fetchJSON(BASE + "data/statuses.json"),
      fetchJSON(BASE + "data/product-roadmap.json")
    ]).then(function (r) {
      statusData.catalog = r[0];
      statusData.roadmap = r[1];
      renderStatuses();
      afterLangHooks.push(renderStatuses);
      return statusData;
    }).catch(function (err) {
      console.warn("[KabuK Exchange] Status catalog unavailable; showing fallback text.", err.message);
    });
    window.KBKX = window.KBKX || {};
    window.KBKX.statuses = ready;
    window.KBKX.paintStatus = function (el, key) { paintStatus(el, key, currentLang || DEFAULT_LANG); };
    window.KBKX.onLang = function (fn) { afterLangHooks.push(fn); };
    window.KBKX.lang = function () { return currentLang || DEFAULT_LANG; };
    // Connection-method badges: a separate family (data/connection-methods.json).
    window.KBKX.methods = fetchJSON(BASE + "data/connection-methods.json")
      .then(function (d) { launchData.methods = d; return d; })
      .catch(function (err) { console.warn("[KabuK Exchange] Connection-method catalog unavailable.", err.message); return null; });
    window.KBKX.paintMethod = function (node, key) { paintMethod(node, key); };
  }

  // Deep links such as /become-a-partner/?interest=future#future-interest
  // pre-select the optional future-capability field (values stay English
  // so the email payload is consistent; labels are localized).
  function initInterestParam() {
    var interest = null;
    try { interest = new URLSearchParams(location.search).get("interest"); } catch (e) {}
    if (!interest) return;
    // ?interest=… preselects the optional Inquiry topic (routing is unchanged:
    // the form still sends to its configured leadRouting mailbox).
    var TOPICS = { "integration_request": "integration_request", "technical-integration": "technical_integration",
      "technical_integration": "technical_integration", "sandbox": "sandbox", "future": "future_capability" };
    var topic = $("#p-topic");
    if (topic && TOPICS[interest]) {
      topic.value = TOPICS[interest];
      topic.dispatchEvent(new Event("change"));
    }
    var focusMap = { "#future-interest": "#p-future", "#inquiry-topic": interest === "integration_request" ? "#p-system" : "#p-topic" };
    var target = focusMap[location.hash] && $(focusMap[location.hash]);
    if (target) setTimeout(function () { target.focus({ preventScroll: true }); }, 300);
  }

  /* ---------------------------------------------------------------------
     11. Launch gates — site-config.json -> featureFlags
     ---------------------------------------------------------------------
     Markup:  <section data-gate="homepageFeaturedHotels">…</section>
              data-gate="a|b"  → shown when ANY flag is on
              data-gate="!a|b" → shown only when ALL are off (the fallback)
              <body data-gate-page="connectivityDirectory"> on gated routes
     Off → element removed from the DOM (no empty sections, no dead links).
     On  → element revealed, then filled from data/*.json.
     This is presentation only. The real gate is the publish step:
     `python3 build.py --production` leaves disabled pages, links and data
     out of dist/. There is deliberately NO query-string override. */
  var GATE_FLAGS = ["networkStats", "networkCoverageMap", "connectivityDirectory",
    "partnerEcosystem", "homepageFeaturedConnections", "homepageFeaturedHotels"];
  var launchFlags = {};

  function gateOn(expr) {
    expr = String(expr || "");
    if (expr.charAt(0) === "!") return !gateOn(expr.slice(1));
    return expr.split("|").some(function (k) { return launchFlags[k] === true; });
  }

  function applyGates(cfg) {
    var f = (cfg && cfg.featureFlags) || {};
    launchFlags = {};
    GATE_FLAGS.forEach(function (k) { launchFlags[k] = f[k] === true; });
    launchFlags.bakuunNameApproved = !!(cfg && cfg.disclosure && cfg.disclosure.bakuunNameApproved === true);

    var page = document.body.getAttribute("data-gate-page");
    if (page && !gateOn(page)) { closeGatedPage(); return false; }

    $all("[data-gate]").forEach(function (el) {
      var expr = el.getAttribute("data-gate");
      if (gateOn(expr)) { el.removeAttribute("data-gate"); el.setAttribute("data-gated", expr); }
      else if (el.parentNode) el.parentNode.removeChild(el);
    });
    return true;
  }

  // A gated route opened while its flag is off (e.g. the un-built source tree
  // served directly). Production never ships these files; this is a fallback.
  function closeGatedPage() {
    var robots = document.createElement("meta");
    robots.name = "robots"; robots.content = "noindex,nofollow";
    document.head.appendChild(robots);
    var main = $("#main");
    if (main) {
      main.innerHTML = '<section class="hero hero--compact"><div class="container"><div class="section-head">' +
        '<span class="eyebrow">404</span><h1 data-i18n="gate.off.t">Page not found</h1>' +
        '<p class="lead" data-i18n="gate.off.d">This page is not available.</p>' +
        '<p><a class="btn btn-primary" data-gate-home href="#"><span data-i18n="gate.off.home">Back to the homepage</span></a></p></div></div></section>';
      var home = $("[data-gate-home]", main);
      if (home) home.setAttribute("href", BASE);
      if (currentLang) applyLang(currentLang);
    }
    document.title = "Page not found | KabuK Exchange";
  }

  /* PUBLICATION RULES — keep in sync with publish.py (tests compare them). */
  var OPERATIONAL = { "live": 1, "available-to-partners": 1, "pilot": 1, "beta": 1 };
  var INTEGRATION_CATEGORIES = ["channel_manager", "pms", "crs", "global_supplier", "technology"];
  var CONNECTION_METHODS = ["direct", "bakuun", "other_partner"];
  var PARTNER_CATEGORIES = ["accommodation", "supply", "distribution", "connectivity", "technology"];
  var PARTNER_RELATIONSHIPS = { signed: 1, integrated: 1 };            // never 'prospective'
  var PROPERTY_RELATIONSHIPS = { direct_contract: 1, connected_supplier: 1, other_verified: 1 };
  var ASIA_REGIONS = { "japan": 1, "asia-pacific": 1 };

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  // Data in dist/ was already filtered by publish.py (approval fields are
  // stripped there), so built sites only re-check structure; the source tree
  // applies every rule.
  function integrationOk(r, statuses) {
    if (!r || !r.id || !r.displayName) return false;
    if (!statuses[r.status]) return false;
    if (INTEGRATION_CATEGORIES.indexOf(r.category) < 0) return false;
    if (CONNECTION_METHODS.indexOf(r.connectionMethod) < 0) return false;
    if (!r.lastVerified) return false;
    if (r.publishedAt && String(r.publishedAt) > todayISO()) return false;
    if (launchData.sanitized) return true;
    if (r.publicDisclosureApproved !== true) return false;
    if (OPERATIONAL[r.status] && !(r.verifiedEndToEnd === true && r.commerciallyEnabled === true)) return false;
    return true;
  }
  // The method badge a record may show: a named route needs both the site-wide
  // disclosure approval and the per-record approval; otherwise it is generic.
  function displayMethod(r) {
    if (r.connectionMethod === "bakuun" && (!launchFlags.bakuunNameApproved ||
        (!launchData.sanitized && r.connectionProviderDisclosureApproved !== true))) return "other_partner";
    return r.connectionMethod;
  }
  function logoAllowed(r) { return !!r.logo && (r.logoUseApproved === true || launchData.sanitized); }
  function partnerOk(r) {
    return !!r && !!r.name && !!r.id && !!PARTNER_RELATIONSHIPS[r.relationship] &&
      PARTNER_CATEGORIES.indexOf(r.category) >= 0 && (launchData.sanitized || r.publicDisclosureApproved === true);
  }
  function propertyOk(r) {
    if (!r || !r.name || !PROPERTY_RELATIONSHIPS[r.relationship]) return false;
    if (launchData.sanitized) return true;
    return r.featured === true && r.publicDisclosureApproved === true && r.relationshipVerified === true;
  }
  function metricOk(doc, m) {
    var v = m && m.value;
    return doc.approvedForPublication === true && m.approvedForPublication === true &&
      typeof v === "number" && isFinite(v) && v > 0 && Math.floor(v) === v && !!m.verifiedAt && !!m.source;
  }

  // Shared state for the launch features.
  var launchData = { sanitized: false, methods: null, statuses: {} };

  function fmtNumber(n) {
    try { return new Intl.NumberFormat(currentLang || DEFAULT_LANG).format(n); } catch (e) { return String(n); }
  }
  function fmtDate(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso + "T00:00:00Z");
      return new Intl.DateTimeFormat(currentLang || DEFAULT_LANG, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(d);
    } catch (e) { return iso; }
  }
  function regionName(cc) {
    try { return new Intl.DisplayNames([currentLang || DEFAULT_LANG], { type: "region" }).of(cc) || cc; } catch (e) { return cc; }
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fillTemplate(node, key, fallback, vars) {
    var s = t(key, fallback);
    Object.keys(vars).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    node.textContent = s;
  }

  // Logo when approved and loadable; otherwise a typographic monogram.
  function logoTile(name, src) {
    var tile = el("div", "logo-tile");
    function mono() {
      tile.innerHTML = "";
      var words = String(name || "?").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/);
      var m = el("span", "logo-tile__mono", ((words[0] || "?").charAt(0) + (words[1] ? words[1].charAt(0) : "")).toUpperCase());
      m.setAttribute("aria-hidden", "true");
      tile.appendChild(m);
      tile.setAttribute("data-logo", "fallback");
    }
    if (src && !/^([a-z]+:|\/\/)/i.test(src) && src.indexOf("..") < 0) {
      var img = new Image();
      img.alt = ""; img.loading = "lazy"; img.decoding = "async";
      img.onerror = mono;
      img.src = BASE + src.replace(/^\//, "");
      tile.appendChild(img);
      tile.setAttribute("data-logo", "image");
    } else mono();
    return tile;
  }

  var METHOD_ICON = '<path d="M2 6h3.2M6.8 6H10M5.2 3.6v4.8M6.8 3.6v4.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>';
  var ROUTE_ICON = '<circle cx="2.4" cy="6" r="1.6" fill="currentColor"/><circle cx="9.6" cy="6" r="1.6" fill="currentColor"/><path d="M4 6h4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="1.4 1.2"/>';
  function methodLabel(key) {
    var m = launchData.methods && launchData.methods.methods[key];
    if (!m) return key;
    return m.label[currentLang] || m.label.en;
  }
  function paintMethod(node, key) {
    var m = launchData.methods && launchData.methods.methods[key];
    if (!m) { node.hidden = true; return; }
    node.className = "method";
    node.setAttribute("data-method", key);
    node.setAttribute("data-badge", m.badge);
    node.innerHTML = '<svg class="method__icon" viewBox="0 0 12 12" aria-hidden="true" focusable="false">' +
      (key === "direct" ? METHOD_ICON : ROUTE_ICON) + '</svg><span class="method__text"></span>';
    node.querySelector(".method__text").textContent = methodLabel(key);
    node.hidden = false;
  }
  function badgeRow(statusKey, methodKey) {
    var row = el("div", "badge-row");
    if (statusKey) { var s = el("span"); paintStatus(s, statusKey, currentLang || DEFAULT_LANG); row.appendChild(s); }
    if (methodKey) { var m = el("span"); paintMethod(m, methodKey); row.appendChild(m); }
    return row;
  }
  function renderStaticMethods() {
    $all(".method[data-method]").forEach(function (n) { paintMethod(n, n.getAttribute("data-method")); });
  }

  function catLabel(cat) { return t("cx.cat." + cat, cat); }
  function regionLabel(r) { return t("cx.region." + r, r); }

  /* ---- Homepage proof components ------------------------------------- */
  function renderFeaturedConnections(section, integrations, featured) {
    var list = $("[data-proof-list]", section);
    var byId = {};
    integrations.forEach(function (r) { byId[r.id] = r; });
    var items = (featured.items || []).filter(function (i) {
      var r = byId[i.id];
      return r && (launchData.sanitized || (i.featured === true && i.verifiedLive === true)) && OPERATIONAL[r.status];
    }).sort(function (a, b) { return (a.order || 9999) - (b.order || 9999); });
    if (items.length < (featured.minItems || 1)) { section.parentNode.removeChild(section); return null; }
    function draw() {
      list.innerHTML = "";
      items.forEach(function (i) {
        var r = byId[i.id];
        var li = el("li"); var card = el("article", "proof-card");
        card.appendChild(logoTile(r.displayName, logoAllowed(r) ? r.logo : ""));
        card.appendChild(el("h3", null, r.displayName));
        card.appendChild(el("p", "proof-card__meta", catLabel(r.category)));
        card.appendChild(badgeRow(r.status, displayMethod(r)));
        li.appendChild(card); list.appendChild(li);
      });
    }
    draw(); section.hidden = false;
    return draw;
  }

  function renderFeaturedProperties(section, doc) {
    var list = $("[data-proof-list]", section);
    var items = (doc.items || []).filter(propertyOk).sort(function (a, b) {
      return (a.order || 9999) - (b.order || 9999) || String(a.name).localeCompare(String(b.name));
    });
    if (items.length < (doc.minItems || 1)) { section.parentNode.removeChild(section); return null; }
    function draw() {
      list.innerHTML = "";
      items.forEach(function (p) {
        var li = el("li"); var card = el("article", "proof-card");
        card.appendChild(logoTile(p.name, logoAllowed(p) ? p.logo : ""));
        card.appendChild(el("h3", null, p.name));
        var meta = [t("fh.type." + p.type, "")];
        if (p.location && (launchData.sanitized || p.locationVerified === true)) meta.push(p.location);
        card.appendChild(el("p", "proof-card__meta", meta.filter(Boolean).join(" · ")));
        var rel = el("span", "rel-badge", t("fh.rel." + p.relationship, p.relationship));
        rel.setAttribute("data-rel", p.relationship);
        card.appendChild(rel);
        li.appendChild(card); list.appendChild(li);
      });
    }
    draw(); section.hidden = false;
    return draw;
  }

  /* ---- /network/ metrics + coverage ---------------------------------- */
  function countUp(node, value) {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var final = fmtNumber(value);
    // Screen readers get the final figure once; the animated digits are hidden.
    node.innerHTML = '<span class="visually-hidden"></span><span aria-hidden="true"></span>';
    node.firstChild.textContent = final;
    var vis = node.lastChild;
    if (reduce || !("IntersectionObserver" in window) || !window.requestAnimationFrame) { vis.textContent = final; return; }
    vis.textContent = fmtNumber(0);
    var io = new IntersectionObserver(function (es) {
      if (!es.some(function (e) { return e.isIntersecting; })) return;
      io.disconnect();
      var t0 = null, dur = 1400;
      function step(ts) {
        if (t0 == null) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur), eased = 1 - Math.pow(1 - p, 3);
        vis.textContent = p < 1 ? fmtNumber(Math.round(value * eased)) : final;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }, { threshold: 0.3 });
    io.observe(node);
  }

  function renderMetrics(section, doc) {
    var shown = 0, vals = {};
    (doc.metrics || []).forEach(function (m) { if (metricOk(doc, m)) vals[m.id] = m.value; });
    // Consistency guards: never show a subset larger than its superset.
    if (vals.directProperties && vals.availableProperties && vals.directProperties > vals.availableProperties) { delete vals.directProperties; console.warn("[KabuK Exchange] directProperties > availableProperties — hidden"); }
    if (vals.directCountries && vals.countriesCovered && vals.directCountries > vals.countriesCovered) { delete vals.directCountries; console.warn("[KabuK Exchange] directCountries > countriesCovered — hidden"); }
    $all("[data-metric]", section).forEach(function (row) {
      var id = row.getAttribute("data-metric");
      if (vals[id]) { countUp($("[data-count]", row), vals[id]); row.hidden = false; shown++; }
      else row.parentNode.removeChild(row);
    });
    $all("[data-metric-group]", section).forEach(function (g) {
      if (!$("[data-metric]", g)) g.parentNode.removeChild(g);
    });
    if (!shown) { section.parentNode.removeChild(section); return null; }
    var note = $("[data-metric-note]", section);
    function dates() { if (note && doc.verifiedAt) { fillTemplate(note.firstElementChild, "net.metrics.note", note.firstElementChild.textContent, { date: fmtDate(doc.verifiedAt) }); note.hidden = false; } }
    dates(); section.hidden = false;
    return function () {
      dates();
      $all("[data-metric]", section).forEach(function (row) {
        var v = vals[row.getAttribute("data-metric")], c = $("[data-count]", row);
        if (v && c && c.firstChild) { c.firstChild.textContent = fmtNumber(v); c.lastChild.textContent = fmtNumber(v); }
      });
    };
  }

  // Tile cartogram of Asia-Pacific (col,row on an 11×8 grid); everything
  // else is grouped by world region beneath it. Positions are schematic.
  var APAC_TILES = {
    MN: [8, 1], CN: [8, 2], KR: [10, 2], JP: [11, 2],
    PK: [3, 3], NP: [5, 3], BT: [6, 3], BD: [7, 3], HK: [9, 3], TW: [10, 3],
    IN: [4, 4], MM: [7, 4], LA: [8, 4], MO: [9, 4],
    MV: [3, 5], LK: [5, 5], TH: [7, 5], KH: [8, 5], VN: [9, 5], PH: [11, 5],
    MY: [7, 6], BN: [9, 6],
    SG: [7, 7], ID: [8, 7], TL: [10, 7], PG: [11, 7],
    AU: [9, 8], NZ: [11, 8], FJ: [12, 8]
  };
  var WORLD_REGIONS = {
    europe: "AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM TR UA VA XK",
    americas: "AR BB BO BR BS BZ CA CL CO CR CU DM DO EC GT HN HT JM MX NI PA PE PR PY SV TT US UY VE",
    "middle-east-africa": "AE BH BW CI CM DZ EG ET GH IL IQ IR JO KE KW LB LY MA MG MU NA NG OM QA RW SA SC SN SY TN TZ UG YE ZA ZM ZW",
    "central-asia": "KZ KG TJ TM UZ AF AZ AM GE"
  };

  // Interactive coverage map. Only markets in the approved coverage data are
  // interactive (buttons); every other tile is decorative. Geography stays
  // left-to-right in RTL locales, and the arrow keys move geographically.
  //   • Filter: all / direct / connected (also acts as the legend)
  //   • Hover or focus a market → tooltip; click, tap, Enter or Space → details
  //   • Arrow keys move between markets (roving tabindex); Home/End; Esc clears
  //   • Map tiles and the country lists stay in sync both ways
  function renderCoverage(section, doc) {
    var cov = doc.coverage || {};
    var ok = cov.approvedForPublication === true && !!cov.verifiedAt;
    var iso = /^[A-Z]{2}$/;
    var direct = ok ? (cov.direct || []).filter(function (c) { return iso.test(c); }) : [];
    var connected = ok ? (cov.connected || []).filter(function (c) { return iso.test(c) && direct.indexOf(c) < 0; }) : [];
    if (!direct.length && !connected.length) { section.parentNode.removeChild(section); return null; }
    var kind = {};
    direct.forEach(function (c) { kind[c] = "direct"; });
    connected.forEach(function (c) { kind[c] = "connected"; });

    var wrap = $(".cov", section), stage = $("[data-cov-stage]", section);
    var grid = $("[data-cov-grid]", section), world = $("[data-cov-world]", section), tip = $("[data-cov-tip]", section);
    var state = { filter: "all", selected: null, focus: null };
    var pos = {};          // cc -> [col,row] for geographic arrow-key movement
    var REGION_ORDER = ["europe", "middle-east-africa", "americas", "central-asia", "other"];
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function kindLabel(k) { return k === "direct" ? t("net.map.legendDirect", "Direct supply market") : t("net.map.legendConnected", "Connected inventory market"); }
    function visible(cc) { return !!kind[cc] && (state.filter === "all" || state.filter === kind[cc]); }
    function tiles() { return $all("button.cov-tile", stage); }
    function tileFor(cc) { return $('button.cov-tile[data-cc="' + cc + '"]', stage); }

    function makeTile(cc, i) {
      var n;
      if (kind[cc]) {
        n = el("button", "cov-tile", cc);
        n.type = "button";
        n.setAttribute("data-cc", cc);
        n.setAttribute("data-cov", kind[cc]);
        n.setAttribute("aria-label", regionName(cc) + ", " + kindLabel(kind[cc]));
        n.setAttribute("aria-pressed", "false");
        n.tabIndex = -1;
      } else {
        n = el("span", "cov-tile", cc);
        n.setAttribute("aria-hidden", "true");
      }
      n.style.setProperty("--d", i);
      return n;
    }

    function draw() {
      grid.innerHTML = ""; world.innerHTML = ""; pos = {};
      Object.keys(APAC_TILES).forEach(function (cc, i) {
        var n = makeTile(cc, i);
        n.style.gridColumn = String(APAC_TILES[cc][0] - 1 || 1);
        n.style.gridRow = String(APAC_TILES[cc][1]);
        pos[cc] = [APAC_TILES[cc][0], APAC_TILES[cc][1]];
        grid.appendChild(n);
      });
      var groups = {};
      Object.keys(kind).filter(function (c) { return !APAC_TILES[c]; }).forEach(function (c) {
        var g = "other";
        Object.keys(WORLD_REGIONS).forEach(function (k) { if ((" " + WORLD_REGIONS[k] + " ").indexOf(" " + c + " ") >= 0) g = k; });
        (groups[g] = groups[g] || []).push(c);
      });
      var row = 10;
      REGION_ORDER.forEach(function (g) {
        if (!groups[g]) return;
        var line = el("div", "cov-region");
        line.setAttribute("role", "group");
        line.setAttribute("aria-label", t("net.map.region." + g, g));
        var lab = el("span", "cov-region__label", t("net.map.region." + g, g));
        lab.setAttribute("aria-hidden", "true");
        line.appendChild(lab);
        groups[g].sort().forEach(function (c, i) { line.appendChild(makeTile(c, i)); pos[c] = [i + 1, row]; });
        world.appendChild(line);
        row++;
      });

      [["direct", direct], ["connected", connected]].forEach(function (pair) {
        var ul = $('[data-cov-list="' + pair[0] + '"]', section);
        ul.innerHTML = "";
        pair[1].slice().sort(function (a, b) { return regionName(a).localeCompare(regionName(b), currentLang || DEFAULT_LANG); })
          .forEach(function (cc) {
            var li = el("li"), b = el("button", "cov-chip", regionName(cc));
            b.type = "button"; b.setAttribute("data-cc", cc); b.setAttribute("aria-pressed", "false");
            b.addEventListener("click", function () { select(state.selected === cc ? null : cc); });
            b.addEventListener("mouseenter", function () { hot(cc, true); });
            b.addEventListener("mouseleave", function () { hot(cc, false); });
            li.appendChild(b); ul.appendChild(li);
          });
      });

      fillTemplate($("[data-cov-summary]", section), "net.map.summary",
        "Direct supply in {direct} markets; connected inventory in {connected} further markets.",
        { direct: fmtNumber(direct.length), connected: fmtNumber(connected.length) });
      var asof = $("[data-cov-asof]", section);
      fillTemplate(asof.firstElementChild, "net.map.asof", "Coverage verified {date}.", { date: fmtDate(cov.verifiedAt) });
      asof.hidden = false;
      bindTiles();
      sync();
    }

    // Visual link between a list chip and its tile while hovering either.
    function hot(cc, on) {
      var tl = tileFor(cc);
      if (tl) tl.classList.toggle("is-hot", on && visible(cc));
      $all('.cov-chip[data-cc="' + cc + '"]', section).forEach(function (c) { c.classList.toggle("is-hot", on); });
    }

    function showTip(btn) {
      var cc = btn.getAttribute("data-cc");
      tip.innerHTML = "";
      tip.appendChild(el("strong", null, regionName(cc)));
      var k = el("span", "cov-tip__kind", kindLabel(kind[cc]));
      k.setAttribute("data-cov", kind[cc]);
      tip.appendChild(k);
      tip.hidden = false;
      var s = stage.getBoundingClientRect(), b = btn.getBoundingClientRect();
      var x = b.left - s.left + b.width / 2, y = b.top - s.top;
      tip.style.left = "0px"; tip.style.top = "0px";
      var w = tip.offsetWidth, h = tip.offsetHeight;
      x = Math.max(8, Math.min(s.width - w - 8, x - w / 2));
      var below = y - h - 10 < 0;
      tip.style.left = x + "px";
      tip.style.top = (below ? y + b.height + 10 : y - h - 10) + "px";
      tip.classList.toggle("is-below", below);
    }
    function hideTip() { tip.hidden = true; }

    function bindTiles() {
      tiles().forEach(function (b) {
        var cc = b.getAttribute("data-cc");
        b.addEventListener("click", function () { select(state.selected === cc ? null : cc); state.focus = cc; rove(); });
        b.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse" && !b.disabled) { showTip(b); hot(cc, true); } });
        b.addEventListener("pointerleave", function () { hideTip(); hot(cc, false); });
        b.addEventListener("focus", function () { state.focus = cc; rove(); showTip(b); hot(cc, true); });
        b.addEventListener("blur", function () { hideTip(); hot(cc, false); });
        b.addEventListener("keydown", onKey);
      });
    }

    // One tabbable market at a time (roving tabindex).
    function rove() {
      var list = tiles().filter(function (b) { return !b.disabled; });
      var cur = state.focus && visible(state.focus) ? state.focus : (state.selected && visible(state.selected) ? state.selected : null);
      if (!cur && list.length) cur = order()[0];
      list.forEach(function (b) { b.tabIndex = b.getAttribute("data-cc") === cur ? 0 : -1; });
      tiles().filter(function (b) { return b.disabled; }).forEach(function (b) { b.tabIndex = -1; });
    }
    function order() {
      return Object.keys(pos).filter(visible).sort(function (a, b) { return pos[a][1] - pos[b][1] || pos[a][0] - pos[b][0]; });
    }
    function move(from, dx, dy) {
      var p = pos[from], best = null, bestScore = Infinity;
      order().forEach(function (cc) {
        if (cc === from) return;
        var q = pos[cc], ax = q[0] - p[0], ay = q[1] - p[1];
        var along = dx ? ax * dx : ay * dy, across = dx ? Math.abs(ay) : Math.abs(ax);
        if (along <= 0) return;
        var score = along + across * 2.5;
        if (score < bestScore) { bestScore = score; best = cc; }
      });
      return best;
    }
    function onKey(e) {
      var cc = e.currentTarget.getAttribute("data-cc"), next = null, o = order();
      switch (e.key) {
        case "ArrowRight": next = move(cc, 1, 0); break;
        case "ArrowLeft": next = move(cc, -1, 0); break;
        case "ArrowDown": next = move(cc, 0, 1); break;
        case "ArrowUp": next = move(cc, 0, -1); break;
        case "Home": next = o[0]; break;
        case "End": next = o[o.length - 1]; break;
        case "Escape": if (state.selected) { select(null); e.preventDefault(); } return;
        default: return;
      }
      e.preventDefault();
      if (next) { state.focus = next; rove(); tileFor(next).focus(); }
    }

    function select(cc) {
      state.selected = cc && visible(cc) ? cc : null;
      sync();
      var body = $("[data-cov-body]", section), prompt = $("[data-cov-prompt]", section);
      if (!state.selected) { body.hidden = true; prompt.hidden = false; return; }
      var k = kind[state.selected];
      var kindEl = $("[data-cov-kind]", section);
      kindEl.innerHTML = "";
      var sw = el("span", "legend-swatch legend-swatch--" + k); sw.setAttribute("aria-hidden", "true");
      kindEl.appendChild(sw); kindEl.appendChild(el("span", null, kindLabel(k)));
      $("[data-cov-name]", section).textContent = regionName(state.selected);
      $("[data-cov-text]", section).textContent = k === "direct"
        ? t("net.map.detail.direct", "KabuK Exchange has at least one directly contracted property in this market.")
        : t("net.map.detail.connected", "Bookable inventory in this market is available through connected suppliers. This does not indicate a direct commercial relationship with properties here.");
      fillTemplate($("[data-cov-date]", section), "net.map.asof", "Coverage verified {date}.", { date: fmtDate(cov.verifiedAt) });
      prompt.hidden = true; body.hidden = false;
    }

    function sync() {
      tiles().forEach(function (b) {
        var cc = b.getAttribute("data-cc"), on = visible(cc);
        b.disabled = !on;
        b.classList.toggle("is-dimmed", !on);
        b.setAttribute("aria-pressed", String(state.selected === cc));
      });
      $all(".cov-chip", section).forEach(function (c) { c.setAttribute("aria-pressed", String(state.selected === c.getAttribute("data-cc"))); });
      $all("[data-cov-filter]", section).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-cov-filter") === state.filter)); });
      ["direct", "connected"].forEach(function (k) {
        var w = $('[data-cov-listwrap="' + k + '"]', section);
        w.hidden = !(k === "direct" ? direct : connected).length || (state.filter !== "all" && state.filter !== k);
      });
      wrap.setAttribute("data-filter", state.filter);
      rove();
    }

    $all("[data-cov-filter]", section).forEach(function (b) {
      b.addEventListener("click", function () {
        state.filter = b.getAttribute("data-cov-filter");
        if (state.selected && !visible(state.selected)) select(null); else sync();
      });
    });
    $("[data-cov-clear]", section).addEventListener("click", function () {
      var was = state.selected; select(null);
      var tl = was && tileFor(was); if (tl) tl.focus();
    });

    draw();
    section.hidden = false;
    if (reduce || !("IntersectionObserver" in window)) wrap.classList.add("is-visible");
    else {
      var io = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { wrap.classList.add("is-visible"); io.disconnect(); }
      }, { threshold: 0.15 });
      io.observe(wrap);
    }
    return function () { var sel = state.selected; draw(); select(sel); };
  }

  /* ---- URL state for directories (filters only — never feature access) */
  function readParams(allowed) {
    var out = {};
    try {
      var p = new URLSearchParams(location.search);
      Object.keys(allowed).forEach(function (k) {
        var v = p.get(k);
        if (v != null && v !== "" && (allowed[k] === true || allowed[k].indexOf(v) >= 0)) out[k] = v.slice(0, 80);
      });
    } catch (e) {}
    return out;
  }
  function writeParams(state, defaults) {
    try {
      var p = new URLSearchParams();
      Object.keys(state).forEach(function (k) { if (state[k] && state[k] !== defaults[k]) p.set(k, state[k]); });
      var qs = p.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    } catch (e) {}
  }
  function norm(s) { return String(s || "").normalize("NFKC").toLowerCase(); }

  /* ---- /network/connectivity/ ---------------------------------------- */
  function initConnectivityDirectory(root, records) {
    var form = $("[data-dir-form]", root);
    var q = $("input[type=search]", form);
    var selects = {};
    $all("[data-dir-filter]", form).forEach(function (s) { selects[s.getAttribute("data-dir-filter")] = s; });
    var sortSel = $("[data-dir-sort]", form);
    var statusOrder = (statusData.catalog && statusData.catalog.order) || Object.keys(statusData.catalog.statuses);

    records = records.map(function (r) { var c = {}; for (var k in r) c[k] = r[k]; c._method = displayMethod(r); return c; });
    function uniq(fn) { var s = {}; records.forEach(function (r) { [].concat(fn(r)).forEach(function (v) { if (v) s[v] = 1; }); }); return Object.keys(s); }
    var opts = {
      category: INTEGRATION_CATEGORIES.filter(function (c) { return uniq(function (r) { return r.category; }).indexOf(c) >= 0; }),
      status: statusOrder.filter(function (s) { return uniq(function (r) { return r.status; }).indexOf(s) >= 0; }),
      method: CONNECTION_METHODS.filter(function (m) { return uniq(function (r) { return r._method; }).indexOf(m) >= 0; }),
      region: uniq(function (r) { return r.regions || []; }).sort()
    };
    var regionField = $("[data-dir-region-field]", form);
    if (opts.region.length >= 2) regionField.hidden = false; else { regionField.parentNode.removeChild(regionField); delete selects.region; }
    var recentOpt = $("[data-dir-recent]", form);
    var datesTrusted = records.length > 0 && records.every(function (r) { return /^\d{4}-\d{2}-\d{2}$/.test(r.publishedAt || ""); });
    if (datesTrusted) recentOpt.hidden = false; else recentOpt.parentNode.removeChild(recentOpt);
    var sorts = ["recommended", "az", "za"].concat(datesTrusted ? ["recent"] : []);

    var defaults = { q: "", category: "", status: "", method: "", region: "", sort: "recommended" };
    var state = Object.assign({}, defaults, readParams({ q: true, category: opts.category, status: opts.status, method: opts.method, region: opts.region, sort: sorts }));

    function fillOptions() {
      Object.keys(selects).forEach(function (k) {
        var s = selects[k], first = s.options[0];
        s.innerHTML = ""; s.appendChild(first);
        opts[k].forEach(function (v) {
          var o = el("option", null, k === "category" ? catLabel(v) : k === "status" ? statusLabel(v, currentLang || DEFAULT_LANG) : k === "method" ? methodLabel(v) : regionLabel(v));
          o.value = v; s.appendChild(o);
        });
        s.value = state[k] || "";
      });
      q.value = state.q; sortSel.value = state.sort;
    }

    var groups = { operational: $('[data-dir-group="operational"]', root), progress: $('[data-dir-group="progress"]', root) };
    var countEl = $("[data-dir-count]", root), empty = $("[data-dir-empty]", root);
    function rank(r) { var i = statusOrder.indexOf(r.status); return i < 0 ? 99 : i; }
    function asia(r) { return (r.regions || []).some(function (x) { return ASIA_REGIONS[x]; }) ? 0 : 1; }
    function cmpName(a, b) { return a.displayName.localeCompare(b.displayName, currentLang || DEFAULT_LANG, { sensitivity: "base" }); }

    function render() {
      var needle = norm(state.q).trim();
      var list = records.filter(function (r) {
        if (state.category && r.category !== state.category) return false;
        if (state.status && r.status !== state.status) return false;
        if (state.method && r._method !== state.method) return false;
        if (state.region && (r.regions || []).indexOf(state.region) < 0) return false;
        if (!needle) return true;
        var hay = norm([r.displayName, catLabel(r.category), r.category.replace(/_/g, " "), t("cx.cat." + r.category, ""), r._method === "bakuun" ? "bakuun" : ""].join(" "));
        return needle.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
      });
      list.sort(function (a, b) {
        if (state.sort === "az") return cmpName(a, b);
        if (state.sort === "za") return cmpName(b, a);
        if (state.sort === "recent") return String(b.publishedAt).localeCompare(String(a.publishedAt)) || cmpName(a, b);
        return rank(a) - rank(b) || asia(a) - asia(b) || cmpName(a, b);
      });
      Object.keys(groups).forEach(function (g) {
        var ul = $("ul", groups[g]); ul.innerHTML = "";
        var rows = list.filter(function (r) { return (g === "operational") === !!OPERATIONAL[r.status]; });
        rows.forEach(function (r) {
          var li = el("li", "dir-item");
          li.setAttribute("data-id", r.id);
          li.appendChild(logoTile(r.displayName, logoAllowed(r) ? r.logo : ""));
          var body = el("div");
          body.appendChild(el("h4", null, r.displayName));
          var meta = [catLabel(r.category)];
          if (r.regions && r.regions.length) meta.push(r.regions.map(regionLabel).join(", "));
          body.appendChild(el("p", "dir-item__meta", meta.join(" · ")));
          li.appendChild(body);
          li.appendChild(badgeRow(r.status, r._method));
          ul.appendChild(li);
        });
        groups[g].hidden = !rows.length;
      });
      fillTemplate(countEl, list.length === 1 ? "cx.count1" : "cx.count", "{count} connections found", { count: fmtNumber(list.length) });
      empty.hidden = list.length > 0;
      var filtered = Object.keys(defaults).some(function (k) { return k !== "sort" && state[k]; });
      $all("[data-dir-clear]", root).forEach(function (b) { b.hidden = !filtered; });
      writeParams(state, defaults);
    }

    var tmr;
    q.addEventListener("input", function () { clearTimeout(tmr); tmr = setTimeout(function () { state.q = q.value; render(); }, 120); });
    Object.keys(selects).forEach(function (k) { selects[k].addEventListener("change", function () { state[k] = selects[k].value; render(); }); });
    sortSel.addEventListener("change", function () { state.sort = sortSel.value; render(); });
    $all("[data-dir-clear]", root).forEach(function (b) {
      b.addEventListener("click", function () { state = Object.assign({}, defaults, { sort: state.sort }); fillOptions(); render(); q.focus(); });
    });

    var lr = (launchData.integrationsDoc || {}).lastReviewed;
    var ver = $("[data-dir-verified]", root);
    function verified() { if (lr && ver) { fillTemplate(ver.firstElementChild, "cx.verified", ver.firstElementChild.textContent, { date: fmtDate(lr) }); ver.hidden = false; } }

    fillOptions(); render(); verified();
    if (!records.length) form.hidden = true;
    return function () { fillOptions(); render(); verified(); };
  }

  /* ---- /partners/ecosystem/ ------------------------------------------ */
  function initPartnerDirectory(root, records) {
    var form = $("[data-dir-form]", root), q = $("input[type=search]", form), sortSel = $("[data-dir-sort]", form);
    var chips = $("[data-dir-chips]", root), grid = $("[data-dir-list]", root);
    var countEl = $("[data-dir-count]", root), empty = $("[data-dir-empty]", root), emptyText = $("[data-dir-empty-text]", root);
    var cats = PARTNER_CATEGORIES.filter(function (c) { return records.some(function (r) { return r.category === c; }); });
    var defaults = { q: "", category: "", sort: "category" };
    var state = Object.assign({}, defaults, readParams({ q: true, category: cats, sort: ["category", "az"] }));

    function drawChips() {
      chips.innerHTML = "";
      [""].concat(cats).forEach(function (c) {
        var b = el("button", null, c ? t("pe.cat." + c, c) : t("pe.cat.all", "All Partners"));
        b.type = "button"; b.setAttribute("data-cat", c);
        b.setAttribute("aria-pressed", String(state.category === c));
        b.addEventListener("click", function () { state.category = c; drawChips(); render(); });
        chips.appendChild(b);
      });
    }
    function render() {
      var needle = norm(state.q).trim();
      var list = records.filter(function (r) {
        return (!state.category || r.category === state.category) && (!needle || norm(r.name).indexOf(needle) >= 0);
      });
      list.sort(function (a, b) {
        var n = a.name.localeCompare(b.name, currentLang || DEFAULT_LANG, { sensitivity: "base" });
        return state.sort === "az" ? n : (PARTNER_CATEGORIES.indexOf(a.category) - PARTNER_CATEGORIES.indexOf(b.category)) || n;
      });
      grid.innerHTML = "";
      list.forEach(function (r) {
        var li = el("li"); var card = el("article", "partner-card");
        li.setAttribute("data-id", r.id);
        card.appendChild(logoTile(r.name, logoAllowed(r) ? r.logo : ""));
        card.appendChild(el("h3", null, r.name));
        card.appendChild(el("p", "proof-card__meta", [t("pe.cat." + r.category, r.category), r.region].filter(Boolean).join(" · ")));
        var rel = el("span", "rel-badge", t("pe.rel." + r.relationship, r.relationship));
        rel.setAttribute("data-rel", r.relationship);
        card.appendChild(rel);
        li.appendChild(card); grid.appendChild(li);
      });
      fillTemplate(countEl, list.length === 1 ? "pe.count1" : "pe.count", "{count} partners", { count: fmtNumber(list.length) });
      empty.hidden = list.length > 0;
      if (emptyText) emptyText.textContent = records.length ? t("pe.emptyFilter", "No partners match that search.") : t("pe.empty", "Partner profiles will appear here as public listings are approved.");
      var filtered = !!(state.q || state.category);
      $all("[data-dir-clear]", root).forEach(function (b) { b.hidden = !filtered; });
      writeParams(state, defaults);
    }
    var tmr;
    q.value = state.q; sortSel.value = state.sort;
    q.addEventListener("input", function () { clearTimeout(tmr); tmr = setTimeout(function () { state.q = q.value; render(); }, 120); });
    sortSel.addEventListener("change", function () { state.sort = sortSel.value; render(); });
    $all("[data-dir-clear]", root).forEach(function (b) {
      b.addEventListener("click", function () { state = Object.assign({}, defaults, { sort: state.sort }); q.value = ""; drawChips(); render(); q.focus(); });
    });
    drawChips(); render();
    if (!records.length) form.hidden = true;
    return function () { drawChips(); render(); };
  }

  /* ---- Orchestration -------------------------------------------------- */
  // Directory toolbars are search UIs, not real forms: Enter must not reload.
  // (Done here instead of an inline onsubmit so the Content-Security-Policy
  // can forbid inline handlers.)
  document.addEventListener("submit", function (e) {
    if (e.target && e.target.matches && e.target.matches("[data-dir-form]")) e.preventDefault();
  });

  function initLaunchFeatures(cfg) {
    launchData.sanitized = cfg && (cfg.buildTarget === "production" || cfg.buildTarget === "preview");
    var need = {
      fc: $('[data-proof="connections"]'), fh: $('[data-proof="properties"]'),
      metrics: $("[data-net-metrics]"), map: $("[data-net-map]"),
      cx: $('[data-directory="integrations"]'), pe: $('[data-directory="partners"]')
    };
    var staticMethods = $all(".method[data-method]").length > 0;
    if (!Object.keys(need).some(function (k) { return need[k]; }) && !staticMethods) return;

    function get(path) { return fetchJSON(BASE + path).catch(function (e) { console.warn("[KabuK Exchange]", e.message); return null; }); }
    var needsIntegrations = need.fc || need.cx;
    Promise.all([
      window.KBKX && window.KBKX.statuses, window.KBKX && window.KBKX.methods,
      needsIntegrations ? get("data/integrations.json") : null,
      need.fc ? get("data/featured-connections.json") : null,
      need.fh ? get("data/featured-properties.json") : null,
      (need.metrics || need.map) ? get("data/network-stats.json") : null,
      need.pe ? get("data/partners-ecosystem.json") : null
    ]).then(function (r) {
      launchData.methods = r[1];
      var statuses = (statusData.catalog && statusData.catalog.statuses) || {};
      if (!r[1] || !statusData.catalog) {
        // Without both badge catalogs nothing can be labelled honestly.
        ["fc", "fh", "metrics", "map"].forEach(function (k) { if (need[k] && need[k].parentNode) need[k].parentNode.removeChild(need[k]); });
      }
      var redraw = [];
      renderStaticMethods(); redraw.push(renderStaticMethods);
      launchData.integrationsDoc = r[2];
      var integrations = ((r[2] && r[2].records) || []).filter(function (x) { return integrationOk(x, statuses); });
      function remove(n) { if (n && n.parentNode) n.parentNode.removeChild(n); }
      if (need.fc && need.fc.parentNode) { if (r[3]) redraw.push(renderFeaturedConnections(need.fc, integrations, r[3])); else remove(need.fc); }
      if (need.fh && need.fh.parentNode) { if (r[4]) redraw.push(renderFeaturedProperties(need.fh, r[4])); else remove(need.fh); }
      if (need.metrics && need.metrics.parentNode) { if (r[5]) redraw.push(renderMetrics(need.metrics, r[5])); else remove(need.metrics); }
      if (need.map && need.map.parentNode) { if (r[5]) redraw.push(renderCoverage(need.map, r[5])); else remove(need.map); }
      if (need.cx) redraw.push(initConnectivityDirectory(need.cx, integrations));
      if (need.pe) redraw.push(initPartnerDirectory(need.pe, ((r[6] && r[6].records) || []).filter(partnerOk)));
      redraw = redraw.filter(Boolean);
      afterLangHooks.push(function () { redraw.forEach(function (fn) { fn(); }); });
      document.documentElement.setAttribute("data-launch-ready", "");
    });
  }

  // Become-a-Partner: optional "Requested system" appears for integration requests.
  function initTopicField() {
    var topic = $("#p-topic");
    if (!topic) return;
    function sync() {
      $all("[data-show-for-topic]").forEach(function (f) { f.hidden = f.getAttribute("data-show-for-topic") !== topic.value; });
    }
    topic.addEventListener("change", sync);
    sync();
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
    initStatuses();
    initEcosystem();
    initForms();
    initTopicField();
    initInterestParam();
    initI18n();              // load i18n/ manifest + language files, then apply
    loadConfig().then(applyConfig);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
