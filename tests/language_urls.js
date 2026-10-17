/* Language URL browser test (Node + Playwright), against an export built with
   site-config.json -> languageUrls on (see tests/make_language_export.py):
     python3 tests/make_language_export.py /tmp/kbkx-lang
     python3 -m http.server 8094 -d /tmp/kbkx-lang &
     NODE_PATH=$(npm root -g) node tests/language_urls.js http://localhost:8094
   Checks that the copy is in the HTML without JavaScript, that the URL (not a
   stored preference) decides the language, that the selector moves between
   language URLs, that config-driven links stay in the language, and that every
   language page loads without errors, failed requests or overflow. */
const { chromium } = require("playwright");
const BASE = (process.argv[2] || "http://localhost:8094").replace(/\/$/, "");
const LANGS = ["en", "ja", "ko", "zh-TW", "ar"];
const IGNORE = /site-config\.json review needed|fonts\.(googleapis|gstatic)|TUNNEL_CONNECTION|Showing statuses pending owner approval/;
const issues = [];
const ok = (cond, msg) => { if (!cond) issues.push(msg); };
const url = (code, route) => BASE + (code === "en" ? "" : "/" + code) + route;

async function page(ctx) {
  const pg = await ctx.newPage(); pg._errors = [];
  pg.on("console", m => { if ((m.type() === "error" || m.type() === "warning") && !IGNORE.test(m.text())) pg._errors.push(m.text().slice(0, 140)); });
  pg.on("pageerror", e => pg._errors.push("PAGEERR " + e.message));
  pg.on("requestfailed", r => { if (!IGNORE.test(r.url())) pg._errors.push("REQFAIL " + r.url()); });
  pg.on("response", r => { if (r.status() >= 400) pg._errors.push("HTTP " + r.status() + " " + r.url()); });
  return pg;
}

(async () => {
  const b = await chromium.launch();
  const cfg = await (await fetch(BASE + "/site-config.json")).json();
  const routes = cfg.languageUrls && cfg.languageUrls.pages || [];
  ok(cfg.languageUrls && cfg.languageUrls.enabled === true && routes.length > 0, "export was not built with languageUrls on");
  const ja = await (await fetch(BASE + "/i18n/ja.json")).json();

  // 1. No JavaScript: crawlers get the translated copy, lang/dir and hreflang.
  {
    const ctx = await b.newContext({ javaScriptEnabled: false }); const pg = await ctx.newPage();
    await pg.goto(url("ja", "/hotels/"));
    const r = await pg.evaluate(() => ({ lang: document.documentElement.lang, h1: document.querySelector("h1").textContent.trim(),
      alts: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map(l => l.hreflang) }));
    ok(r.lang === "ja", `no-JS /ja/hotels/ lang=${r.lang}`);
    ok(r.h1 === ja["hl.hero.title"] || r.h1 === (ja.hl && ja.hl.hero && ja.hl.hero.title), `no-JS /ja/hotels/ h1 not Japanese: ${r.h1}`);
    ok(["en", "ja", "ko", "zh-TW", "ar", "x-default"].every(h => r.alts.includes(h)), `no-JS hreflang set incomplete: ${r.alts}`);
    await pg.goto(url("ar", "/"));
    ok(await pg.evaluate(() => document.documentElement.dir) === "rtl", "no-JS /ar/ not RTL");
    await ctx.close();
  }

  // 2. Every language page: lang/dir, no errors, no overflow (a stored choice must not override the URL).
  for (const w of [375, 1440]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    await ctx.addInitScript(() => { localStorage.setItem("kbkx-lang", "ko"); localStorage.setItem("kbkx-cookie-consent", "declined"); });
    for (const code of LANGS) for (const route of routes) {
      const pg = await page(ctx);
      await pg.goto(url(code, route), { waitUntil: "load" }); await pg.waitForTimeout(200);
      const r = await pg.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir,
        sel: (document.getElementById("lang-select") || {}).value, sw: document.documentElement.scrollWidth,
        broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src) }));
      ok(r.lang === code && r.sel === code, `${code} ${route}@${w}: lang=${r.lang} selector=${r.sel} (URL must win over stored ko)`);
      ok(r.dir === (code === "ar" ? "rtl" : "ltr"), `${code} ${route}: dir=${r.dir}`);
      ok(r.sw <= w, `${code} ${route}@${w} OVERFLOW ${r.sw}`);
      ok(!r.broken.length, `${code} ${route} BROKEN IMG ${r.broken}`);
      ok(!pg._errors.length, `${code} ${route}@${w} ${pg._errors.join(" | ")}`);
      await pg.close();
    }
    await ctx.close();
  }

  // 3. Selector navigates between language URLs; config links stay in-language.
  {
    const ctx = await b.newContext(); const pg = await page(ctx);
    await pg.goto(url("en", "/hotels/"), { waitUntil: "load" });
    await Promise.all([pg.waitForURL(url("ja", "/hotels/")), pg.selectOption("#lang-select", "ja")]);
    ok(await pg.evaluate(() => document.documentElement.lang) === "ja", "en → ja via selector did not land on /ja/hotels/");
    await Promise.all([pg.waitForURL(url("ar", "/hotels/")), pg.selectOption("#lang-select", "ar")]);
    await Promise.all([pg.waitForURL(url("en", "/hotels/")), pg.selectOption("#lang-select", "en")]);
    ok(pg.url() === url("en", "/hotels/"), `back to English landed on ${pg.url()}`);
    await pg.goto(url("ja", "/"), { waitUntil: "load" }); await pg.waitForTimeout(300);
    const links = await pg.evaluate(() => [...document.querySelectorAll(".site-footer a")].map(a => a.href));
    ok(links.includes(url("ja", "/hotels/")), "footer config link /hotels/ should resolve to /ja/hotels/");
    ok(links.includes(url("en", "/privacy/")) && !links.some(h => h.includes("/ja/privacy/")), "English-only /privacy/ must stay English");
    ok(!pg._errors.length, `selector/footer ${pg._errors.join(" | ")}`);
    // English-only pages keep the client-side switch (no language URL exists).
    await pg.goto(url("en", "/developers/"), { waitUntil: "load" });
    await pg.selectOption("#lang-select", "ja"); await pg.waitForTimeout(300);
    ok(pg.url() === url("en", "/developers/") && await pg.evaluate(() => document.documentElement.lang) === "ja", "/developers/ should switch in place");
    await ctx.close();
  }

  console.log(`language URL test: ${routes.length} routes × ${LANGS.length} languages; issues: ${issues.length}`);
  console.log([...new Set(issues)].slice(0, 60).join("\n"));
  await b.close(); process.exit(issues.length ? 1 : 0);
})();
