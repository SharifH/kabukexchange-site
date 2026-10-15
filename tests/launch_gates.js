/* Launch-gate tests (Node + Playwright). Build both targets, serve them, run:

     python3 build.py --production && python3 build.py --preview
     python3 -m http.server 8091 &                       # source tree (flags off)
     python3 -m http.server 8093 -d dist &               # production export
     python3 -m http.server 8092 -d dist-preview &       # preview export
     NODE_PATH=$(npm root -g) node tests/launch_gates.js \
         http://localhost:8093 http://localhost:8092 http://localhost:8091

   PRODUCTION: gated routes + data are 404, homepage has no showcases, no gated
   links, no fabricated numbers, and query strings cannot switch anything on.
   PREVIEW: every component renders from SYNTHETIC fixtures; ineligible fixture
   records never render; search / filter / sort / empty state / clear-all / URL
   state / keyboard / reduced motion / missing logos / RTL overflow.
   SOURCE: gated pages fall back to "not found"; with flags + fixtures injected
   (route interception) the browser applies the same publication rules as
   publish.py to the raw, unsanitized data (expected ids from the python rules). */
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const path = require("path");
const [PROD, PREV, SRC] = [process.argv[2] || "http://localhost:8093", process.argv[3] || "http://localhost:8092", process.argv[4] || "http://localhost:8091"];
const ROOT = path.resolve(__dirname, "..");
const IGNORE = /fonts\.(googleapis|gstatic)|TUNNEL_CONNECTION|Showing statuses pending|review needed/;
const GATED = ["/network/connectivity/", "/partners/ecosystem/"];   // /network/ is public; its stats/map are gated in-page
const fails = []; let passes = 0;
function ok(cond, msg) { if (cond) passes++; else fails.push(msg); }

// Expected visible ids according to publish.py's python rules (single source of truth).
const expected = JSON.parse(execFileSync("python3", ["-I", "-c", `
import json, sys, datetime
sys.path.insert(0, ${JSON.stringify(ROOT)})
import publish as P
statuses = P.status_keys(); today = datetime.date.today().isoformat()
integ = json.load(open(${JSON.stringify(ROOT + "/fixtures/data/integrations.json")}))["records"]
ok = [r for r in integ if P.integration_ok(r, today, statuses)]
partners = json.load(open(${JSON.stringify(ROOT + "/fixtures/data/partners-ecosystem.json")}))["records"]
props = json.load(open(${JSON.stringify(ROOT + "/fixtures/data/featured-properties.json")}))["items"]
fc = json.load(open(${JSON.stringify(ROOT + "/fixtures/data/featured-connections.json")}))["items"]
okids = {r["id"]: r for r in ok}
print(json.dumps({
  "integrations": sorted(r["id"] for r in ok),
  "partners": sorted(r["id"] for r in partners if P.partner_ok(r)),
  "properties": sorted(r["id"] for r in props if P.property_ok(r)),
  "featured": sorted(i["id"] for i in fc if i.get("featured") and i.get("verifiedLive") and i["id"] in okids and okids[i["id"]]["status"] in P.OPERATIONAL)
}))`], { encoding: "utf8" }));

async function page(b, url, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: opts.w || 1280, height: 900 }, reducedMotion: opts.reduce ? "reduce" : "no-preference" });
  await ctx.addInitScript(l => { localStorage.setItem("kbkx-lang", l); localStorage.setItem("kbkx-cookie-consent", "declined"); }, opts.lang || "en");
  const pg = await ctx.newPage();
  pg._errors = [];
  pg.on("pageerror", e => pg._errors.push(e.message));
  pg.on("console", m => { if (m.type() === "error" && !IGNORE.test(m.text()) && !/404/.test(m.text())) pg._errors.push(m.text()); });
  if (opts.setup) await opts.setup(pg);
  const res = await pg.goto(url, { waitUntil: "networkidle" });
  pg._status = res.status();
  if (opts.ready !== false) await pg.waitForSelector("html[data-launch-ready]", { timeout: 4000 }).catch(() => {});
  await pg.waitForTimeout(opts.wait || 300);
  return pg;
}
const ids = (pg, sel) => pg.$$eval(sel, els => els.map(e => e.getAttribute("data-id")).filter(Boolean).sort());
const text = (pg, sel) => pg.$eval(sel, e => e.textContent.trim()).catch(() => null);

(async () => {
  const b = await chromium.launch();

  /* ---------------- PRODUCTION ---------------- */
  for (const r of GATED) {
    const pg = await page(b, PROD + r, { ready: false });
    ok(pg._status === 404, `prod ${r} should be 404, got ${pg._status}`);
    await pg.context().close();
  }
  for (const f of ["integrations", "partners-ecosystem", "network-stats", "featured-connections", "featured-properties"]) {
    const pg = await page(b, `${PROD}/data/${f}.json`, { ready: false });
    ok(pg._status === 404, `prod data/${f}.json should not be deployed (got ${pg._status})`);
    await pg.context().close();
  }
  for (const q of ["", "?preview=1&networkStats=true&featureFlags=all", "?interest=integration_request"]) {
    const pg = await page(b, PROD + "/" + q, { ready: false, wait: 700 });
    const r = await pg.evaluate(() => ({
      showcase: !!document.querySelector("#featured-hotels, #featured-connections, [data-proof]"),
      gateAttrs: document.querySelectorAll("[data-gate]").length,
      gatedLinks: [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href")).filter(h => /(^|\/)(network\/connectivity\/|partners\/ecosystem\/)$/.test(h.split("#")[0]) && !/^#/.test(h)),
      heroCta: [...document.querySelectorAll(".hero-cta a, .home-hero a")].map(a => a.getAttribute("href")),
      metrics: document.querySelectorAll("[data-metric], .metric__value").length,
      banner: !!document.querySelector(".preview-banner")
    }));
    ok(!r.showcase, `prod home${q}: showcase present`);
    ok(r.gateAttrs === 0, `prod home${q}: ${r.gateAttrs} un-stripped data-gate elements`);
    ok(r.gatedLinks.length === 0, `prod home${q}: links to gated routes ${r.gatedLinks}`);
    ok(r.metrics === 0, `prod home${q}: metric elements present`);
    ok(!r.banner, `prod home${q}: preview banner leaked`);
    ok(r.heroCta.includes("#solutions"), `prod home${q}: hero should lead to #solutions (${r.heroCta})`);
    ok(pg._errors.length === 0, `prod home${q}: errors ${pg._errors}`);
    await pg.context().close();
  }
  {
    const pg = await page(b, PROD + "/sitemap.xml", { ready: false });
    const xml = await pg.content();
    ok(!/network\/connectivity\/|partners\/ecosystem/.test(xml), "prod sitemap lists a gated route");
    ok(/\/network\/<\/loc>/.test(xml) && /\/connectivity\/<\/loc>/.test(xml), "prod sitemap should list /network/ and /connectivity/");
    await pg.context().close();
  }
  {
    const pg = await page(b, PROD + "/partners/", { ready: false });
    const nav = await pg.$$eval(".dropdown-item, .site-footer a", as => as.map(a => a.getAttribute("href")));
    ok(nav.some(h => /#ecosystem$/.test(h)), "prod nav keeps the homepage Partner Ecosystem link");
    ok(!nav.some(h => /network\/connectivity\/$|ecosystem\/$/.test(h)), "prod nav links a gated route");
    await pg.context().close();
  }

  {
    const pg = await page(b, PROD + "/network/", { ready: false, wait: 600 });
    ok(pg._status === 200, `prod /network/ should be public (got ${pg._status})`);
    const r = await pg.evaluate(() => ({ metrics: !!document.querySelector("[data-net-metrics], [data-metric]"), map: !!document.querySelector("[data-net-map]"),
      h1: document.querySelector("h1").textContent,
      num: (() => { const m = document.querySelector("main").cloneNode(true); m.querySelectorAll("[aria-hidden=true]").forEach(n => n.remove()); return /\b\d{2,}\b/.test(m.textContent); })() }));
    ok(!r.metrics && !r.map, "prod /network/ must not ship statistics or map while flags are off");
    ok(/Asia-First Supply/.test(r.h1), "prod /network/ hero missing");
    ok(!r.num, "prod /network/ shows a number although statistics are off");
    await pg.context().close();
    const c = await page(b, PROD + "/connectivity/", { ready: false, wait: 400 });
    ok(c._status === 200 && (await text(c, "h1")) === "One Integration. Multiple Supply Sources.", "prod /connectivity/ missing");
    await c.context().close();
  }

  /* ---------------- PREVIEW (synthetic fixtures) ---------------- */
  {
    const pg = await page(b, PREV + "/");
    ok(!!(await pg.$(".preview-banner")), "preview banner missing");
    ok(await pg.$eval('meta[name="robots"]', m => m.content).catch(() => "") === "noindex,nofollow", "preview pages must be noindex");
    const fc = await pg.$$eval("#featured-connections .proof-card h3", e => e.map(x => x.textContent));
    ok(fc.length === expected.featured.length, `preview featured connections ${fc.length} != ${expected.featured.length}`);
    const fh = await pg.$$eval("#featured-hotels .proof-card h3", e => e.map(x => x.textContent));
    ok(fh.length === expected.properties.length, `preview featured hotels ${fh.length} != ${expected.properties.length}`);
    const body = await pg.evaluate(() => document.body.innerText);
    ok(!/MUST NOT RENDER/.test(body), "preview home rendered an ineligible fixture");
    ok(/Via Technology Partner/.test(body) && /Via Bakuun/.test(body), "preview: method badge fallback/approval not shown");
    const fallbacks = await pg.$$eval('[data-logo="fallback"]', e => e.length);
    ok(fallbacks >= 2, "preview: missing/unapproved logos should fall back to monograms");
    const broken = await pg.$$eval("img", is => is.filter(i => i.complete && i.naturalWidth === 0 && i.closest(".logo-tile")).length);
    ok(broken === 0, "preview: broken logo image left on page");
    const hotelsHidden = await pg.$eval("#featured-hotels", s => s.innerText.includes("Busan"));
    ok(!hotelsHidden, "preview: unverified location rendered");
    ok(pg._errors.length === 0, `preview home errors ${pg._errors}`);
    await pg.context().close();
  }
  for (const reduce of [false, true]) {
    const pg = await page(b, PREV + "/network/", { reduce, wait: reduce ? 300 : 2200 });
    await pg.evaluate(async () => { for (let y = 0; y < 3000; y += 300) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } });
    await pg.waitForTimeout(reduce ? 100 : 1800);
    const vals = await pg.$$eval("[data-metric]", rows => rows.map(r => [r.getAttribute("data-metric"), r.querySelector(".visually-hidden").textContent, r.querySelector("[aria-hidden]").textContent]));
    const m = Object.fromEntries(vals.map(v => [v[0], v[1]]));
    ok(m.directProperties === "48" && m.directCountries === "5" && m.availableProperties === "188" && m.countriesCovered === "17" && m.connectedSupplySources === "6" && m.connectedChannelManagers === "4",
      `preview metrics (dedup) wrong: ${JSON.stringify(m)}`);
    ok(vals.every(v => v[1] === v[2]), `preview count-up did not settle on final values (reduce=${reduce}): ${JSON.stringify(vals)}`);
    const cov = await pg.evaluate(() => ({ d: document.querySelectorAll('[data-cov-list="direct"] li').length, c: document.querySelectorAll('[data-cov-list="connected"] li').length,
      tilesD: document.querySelectorAll('.cov-tile[data-cov="direct"]').length, note: document.querySelector("[data-metric-note]").textContent }));
    ok(cov.d === 5 && cov.c === 12 && cov.tilesD === 5, `preview coverage lists wrong ${JSON.stringify(cov)}`);
    ok(/January 31, 2026/.test(cov.note), "preview metric note missing verified date");
    await pg.context().close();
  }
  // Interactive coverage map: filter, hover/focus tooltip, select, lists in sync, keyboard.
  for (const lang of ["en", "ar"]) {
    const pg = await page(b, PREV + "/network/", { lang });
    await pg.locator("#coverage").scrollIntoViewIfNeeded(); await pg.waitForTimeout(900);
    const n = await pg.$$eval("button.cov-tile", e => e.length);
    ok(n === 17, `${lang} map: ${n} interactive tiles (expected 17 approved markets)`);
    ok(await pg.$$eval("span.cov-tile:not([aria-hidden=true])", e => e.length) === 0, `${lang} map: decorative tiles exposed to assistive tech`);
    ok(await pg.$$eval('button.cov-tile[tabindex="0"]', e => e.length) === 1, `${lang} map: roving tabindex should expose exactly one tile`);
    await pg.hover('button.cov-tile[data-cc="JP"]'); await pg.waitForTimeout(150);
    ok(await pg.$eval("[data-cov-tip]", t => !t.hidden), `${lang} map: hover tooltip not shown`);
    await pg.click('button.cov-tile[data-cc="TH"]'); await pg.waitForTimeout(150);
    ok(await pg.$eval("[data-cov-body]", d => !d.hidden), `${lang} map: click did not open details`);
    ok(await pg.$eval('.cov-chip[data-cc="TH"]', c => c.getAttribute("aria-pressed")) === "true", `${lang} map: list chip not synced with tile`);
    await pg.focus('button.cov-tile[data-cc="TH"]'); await pg.keyboard.press("ArrowRight");
    ok(await pg.evaluate(() => document.activeElement.dataset.cc) === "VN", `${lang} map: ArrowRight should move east (geographic, also in RTL)`);
    await pg.keyboard.press("Enter");
    ok(await pg.$eval('button.cov-tile[data-cc="VN"]', t => t.getAttribute("aria-pressed")) === "true", `${lang} map: Enter did not select`);
    await pg.keyboard.press("Escape");
    ok(await pg.$eval("[data-cov-body]", d => d.hidden), `${lang} map: Escape did not clear`);
    await pg.click('[data-cov-filter="connected"]'); await pg.waitForTimeout(150);
    ok(await pg.$$eval("button.cov-tile:not(:disabled)", e => e.length) === 12, `${lang} map: connected filter`);
    ok(await pg.$eval('[data-cov-listwrap="direct"]', w => w.hidden), `${lang} map: direct list should hide under connected filter`);
    await pg.click('.cov-chip[data-cc="SG"]');
    ok(await pg.$eval('button.cov-tile[data-cc="SG"]', t => t.getAttribute("aria-pressed")) === "true", `${lang} map: chip did not select tile`);
    await pg.click('[data-cov-filter="direct"]'); await pg.waitForTimeout(100);
    ok(await pg.$eval("[data-cov-body]", d => d.hidden), `${lang} map: selection should clear when filtered out`);
    ok(pg._errors.length === 0, `${lang} map errors ${pg._errors}`);
    await pg.context().close();
  }
  // Unknown metrics: nulls hide metrics, never "0" or a dash.
  {
    const pg = await page(b, PREV + "/network/", { setup: p => p.route("**/data/network-stats.json", async route => {
      const res = await route.fetch(); const j = await res.json();
      j.metrics[0].value = null; j.metrics[1].value = 0; j.metrics[2].approvedForPublication = false; j.metrics[3].value = 9; j.metrics[4].value = null; j.metrics[5].approvedForPublication = false; j.coverage.direct = []; j.coverage.connected = [];
      await route.fulfill({ response: res, body: JSON.stringify(j) });
    }) });
    const r = await pg.evaluate(() => ({ metrics: [...document.querySelectorAll("[data-metric]")].map(e => e.getAttribute("data-metric")), dash: /—/.test((document.querySelector("#metrics") || {}).innerText || ""), map: !!document.querySelector("#coverage") }));
    ok(r.metrics.join() === "countriesCovered", `unknown metrics not hidden: ${r.metrics}`);
    ok(!r.dash, "placeholder dash rendered for unknown metric");
    ok(!r.map, "empty coverage should remove the map section");
    await pg.context().close();
  }
  // Inconsistent figures are withheld.
  {
    const pg = await page(b, PREV + "/network/", { setup: p => p.route("**/data/network-stats.json", async route => {
      const res = await route.fetch(); const j = await res.json(); j.metrics[0].value = 9999;
      await route.fulfill({ response: res, body: JSON.stringify(j) });
    }) });
    ok(!(await pg.$('[data-metric="directProperties"]')), "direct > available should be withheld");
    await pg.context().close();
  }

  // Connectivity directory interactions.
  {
    const pg = await page(b, PREV + "/network/connectivity/");
    const count = () => text(pg, "[data-dir-count]");
    const all = await ids(pg, ".dir-item");
    ok(JSON.stringify(all) === JSON.stringify(expected.integrations), `directory ids ${all} != python rules ${expected.integrations}`);
    ok(await count() === `${expected.integrations.length} connections found`, `initial count ${await count()}`);
    ok(await pg.$eval("[data-dir-clear]", e => e.hidden), "clear-all visible with no filters");
    ok(!(await pg.$("[data-dir-recent]")), "Recently Added offered without trustworthy dates");
    ok(!!(await pg.$("[data-dir-region-field]:not([hidden])")), "region filter missing although data has regions");
    const op = await ids(pg, '[data-dir-group="operational"] .dir-item');
    ok(op[0] && ["fx-cm-alpha", "fx-cm-bravo", "fx-cm-charlie", "fx-crs-foxtrot"].join() === op.join(), `operational group wrong ${op}`);
    const firstRec = await pg.$eval('[data-dir-group="operational"] .dir-item', e => e.getAttribute("data-id"));
    ok(firstRec === "fx-cm-alpha", `recommended sort should start with live + Asia (${firstRec})`);
    // keyboard: focus search, type
    await pg.focus("#cx-q"); await pg.keyboard.type("bravo"); await pg.waitForTimeout(300);
    ok(await count() === "1 connection found", `search 'bravo' -> ${await count()}`);
    ok(/q=bravo/.test(pg.url()), "search not reflected in URL");
    ok(await pg.$eval("[data-dir-clear]", e => !e.hidden), "clear-all hidden while filtering");
    await pg.fill("#cx-q", "zzzz"); await pg.waitForTimeout(300);
    ok(await pg.$eval("[data-dir-empty]", e => !e.hidden), "empty state not shown");
    await pg.click("[data-dir-empty] [data-dir-clear]"); await pg.waitForTimeout(150);
    ok(await count() === `${expected.integrations.length} connections found`, "clear-all did not reset");
    ok(await pg.evaluate(() => document.activeElement.id) === "cx-q", "focus not returned to search after clear");
    await pg.selectOption('[data-dir-filter="category"]', "pms");
    ok(await count() === "2 connections found", `category pms -> ${await count()}`);
    await pg.selectOption('[data-dir-filter="method"]', "direct");
    ok(await count() === "1 connection found", `pms + direct -> ${await count()}`);
    await pg.selectOption('[data-dir-filter="category"]', ""); await pg.selectOption('[data-dir-filter="method"]', "other_partner");
    ok(await count() === "3 connections found", `method other_partner -> ${await count()}`);
    await pg.selectOption('[data-dir-filter="method"]', ""); await pg.selectOption('[data-dir-filter="status"]', "live");
    ok(await count() === "2 connections found", `status live -> ${await count()}`);
    await pg.selectOption('[data-dir-filter="status"]', ""); await pg.selectOption('[data-dir-filter="region"]', "europe");
    ok(await count() === "2 connections found", `region europe -> ${await count()}`);
    await pg.selectOption('[data-dir-filter="region"]', ""); await pg.selectOption("[data-dir-sort]", "za");
    const za = await ids(pg, '[data-dir-group="progress"] .dir-item');
    const zaOrder = await pg.$$eval('[data-dir-group="progress"] .dir-item h4', e => e.map(x => x.textContent));
    ok(JSON.stringify(zaOrder) === JSON.stringify([...zaOrder].sort().reverse()), `Z–A order wrong ${zaOrder}`);
    // keyboard select change
    await pg.focus('[data-dir-filter="category"]'); await pg.keyboard.press("ArrowDown"); await pg.waitForTimeout(150);
    ok(await count() !== `${expected.integrations.length} connections found`, "keyboard change on category select had no effect");
    await pg.context().close();
    // URL state restore + invalid values ignored
    const pg2 = await page(b, PREV + "/network/connectivity/?category=crs&status=bogus&sort=za");
    ok(await text(pg2, "[data-dir-count]") === "1 connection found", "URL state not restored");
    ok(await pg2.$eval('[data-dir-filter="status"]', s => s.value) === "", "invalid status param applied");
    await pg2.context().close();
    // Request-an-integration CTA preselects the topic and keeps routing.
    const pg3 = await page(b, PREV + "/become-a-partner/?interest=integration_request#inquiry-topic", { ready: false, wait: 700 });
    const f = await pg3.evaluate(() => ({ topic: document.querySelector("#p-topic").value, sys: !document.querySelector("#requested-system-field").hidden, route: document.querySelector("form[data-lead-form]").getAttribute("data-route") }));
    ok(f.topic === "integration_request" && f.sys && f.route === "partnerEmail", `integration request preselect ${JSON.stringify(f)}`);
    await pg3.context().close();
  }

  // Partner ecosystem.
  {
    const pg = await page(b, PREV + "/partners/ecosystem/");
    const all = await ids(pg, ".partner-grid li");
    ok(JSON.stringify(all) === JSON.stringify(expected.partners), `partners ${all} != ${expected.partners}`);
    const body = await pg.evaluate(() => document.body.innerText);
    ok(!/MUST NOT RENDER|prospect/i.test(body), "prospect/unapproved partner rendered");
    await pg.click('[data-dir-chips] button[data-cat="distribution"]');
    ok((await ids(pg, ".partner-grid li")).length === 2, "distribution chip filter");
    ok(await pg.$eval('[data-dir-chips] button[data-cat="distribution"]', b => b.getAttribute("aria-pressed")) === "true", "chip aria-pressed not set");
    await pg.click('[data-dir-chips] button[data-cat=""]');
    await pg.fill("#pe-q", "ryokan"); await pg.waitForTimeout(250);
    ok((await ids(pg, ".partner-grid li")).length === 1, "partner search");
    await pg.fill("#pe-q", "nothing-here"); await pg.waitForTimeout(250);
    ok(await text(pg, "[data-dir-empty-text]") === "No partners match that search.", "partner filtered empty text");
    await pg.fill("#pe-q", ""); await pg.selectOption("[data-dir-sort]", "az"); await pg.waitForTimeout(150);
    const names = await pg.$$eval(".partner-card h3", e => e.map(x => x.textContent));
    ok(JSON.stringify(names) === JSON.stringify([...names].sort((a, c) => a.localeCompare(c))), "A–Z sort");
    const logoTwo = await pg.$eval('[data-id="fx-p-2"] .logo-tile', t => t.getAttribute("data-logo"));
    ok(logoTwo === "fallback", "logo shown without logoUseApproved");
    await pg.context().close();
    // Empty catalogue → approved-listing empty state, toolbar hidden.
    const pg2 = await page(b, PREV + "/partners/ecosystem/", { setup: p => p.route("**/data/partners-ecosystem.json", r => r.fulfill({ contentType: "application/json", body: '{"records":[]}' })) });
    ok(await text(pg2, "[data-dir-empty-text]") === "Partner profiles will appear here as public listings are approved.", "empty catalogue text");
    ok(await pg2.$eval("[data-dir-form]", f => f.hidden), "toolbar should hide with no records");
    await pg2.context().close();
  }

  // Responsive + RTL + localization on the gated pages.
  for (const lang of ["en", "ja", "ar"]) for (const w of [375, 768, 1440]) for (const r of ["/", ...GATED]) {
    const pg = await page(b, PREV + r, { w, lang });
    const m = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, dir: document.documentElement.dir }));
    ok(m.sw <= w, `${lang} ${r}@${w} horizontal overflow ${m.sw}`);
    if (lang === "ar") ok(m.dir === "rtl", `${r} not RTL`);
    ok(pg._errors.length === 0, `${lang} ${r}@${w} errors ${pg._errors}`);
    if (lang === "ja" && r === "/network/connectivity/" && w === 1440) ok(/件の接続先/.test(await text(pg, "[data-dir-count]")), "ja count not localized");
    await pg.context().close();
  }

  /* ---------------- SOURCE TREE ---------------- */
  {
    const pg = await page(b, SRC + "/network/", { ready: false, wait: 700 });
    ok((await pg.$$("[data-gate], [data-net-metrics], [data-net-map]")).length === 0, "source /network/: gated blocks not removed with flags off");
    ok((await text(pg, "h1")) === "Asia-First Supply. Global Reach.", "source /network/ should be public");
    await pg.context().close();
  }
  for (const r of GATED) {
    const pg = await page(b, SRC + r, { ready: false, wait: 700 });
    const s = await pg.evaluate(() => ({ h1: document.querySelector("h1").textContent, robots: (document.querySelector('meta[name="robots"]') || {}).content }));
    ok(s.h1 === "Page not found" && s.robots === "noindex,nofollow", `source ${r} with flags off should fall back (${JSON.stringify(s)})`);
    await pg.context().close();
  }
  {
    const pg = await page(b, SRC + "/", { ready: false, wait: 700 });
    ok((await pg.$$("[data-gate], [data-proof]")).length === 0, "source home: gated elements not removed with flags off");
    await pg.context().close();
  }
  // Raw (unsanitized) fixtures + flags on in the source tree: JS rules == python rules.
  const injectAll = async p => {
    await p.route("**/site-config.json", async route => { const res = await route.fetch(); const j = await res.json(); Object.keys(j.featureFlags).forEach(k => j.featureFlags[k] = true); await route.fulfill({ response: res, body: JSON.stringify(j) }); });
    for (const f of ["integrations", "partners-ecosystem", "network-stats", "featured-connections", "featured-properties"])
      await p.route(`**/data/${f}.json`, r => r.fulfill({ path: `${ROOT}/fixtures/data/${f}.json` }));
    await p.route("**/fixtures/assets/logos/*", r => r.fulfill({ path: `${ROOT}/fixtures/assets/logos/${r.request().url().split("/").pop()}` }).catch(() => r.fulfill({ status: 404 })));
  };
  {
    const pg = await page(b, SRC + "/network/connectivity/", { setup: injectAll });
    const got = await ids(pg, ".dir-item");
    ok(JSON.stringify(got) === JSON.stringify(expected.integrations), `JS rules (raw) ${got} != python ${expected.integrations}`);
    const charlie = await pg.$eval('[data-id="fx-cm-charlie"] .method', e => e.getAttribute("data-method"));
    ok(charlie === "other_partner", "raw data: Bakuun named without disclosure approval");
    await pg.context().close();
    const pg2 = await page(b, SRC + "/", { setup: injectAll });
    ok((await pg2.$$("#featured-connections .proof-card")).length === expected.featured.length, "raw: featured connection rules differ from python");
    ok((await pg2.$$("#featured-hotels .proof-card")).length === expected.properties.length, "raw: featured property rules differ from python");
    await pg2.context().close();
    const pg3 = await page(b, SRC + "/partners/ecosystem/", { setup: injectAll });
    ok(JSON.stringify(await ids(pg3, ".partner-grid li")) === JSON.stringify(expected.partners), "raw: partner rules differ from python");
    await pg3.context().close();
  }

  console.log(`launch gates: ${passes} checks passed, ${fails.length} failed`);
  if (fails.length) console.log(fails.join("\n"));
  await b.close(); process.exit(fails.length ? 1 : 0);
})();
