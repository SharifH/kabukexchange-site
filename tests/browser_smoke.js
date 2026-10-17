/* Browser smoke test (optional; needs Node + Playwright with a Chromium build).
     cd <site root> && python3 -m http.server 8080
     NODE_PATH=$(npm root -g) node tests/browser_smoke.js http://localhost:8080
   Loads every page in all five languages at 375/768/1440px and checks console
   errors, failed requests, horizontal overflow, broken images, RTL, status
   badge rendering, the review gate and the approval guard. */
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://localhost:8080";
const PAGES = ["/", "/hotels/", "/partners/", "/about/", "/whats-next/", "/become-a-partner/", "/link-your-property/",
  "/platform/", "/platform/how-it-works/", "/platform/architecture/", "/platform/security/", "/platform/intelligence/",
  "/developers/", "/developers/api/", "/developers/guides/", "/resources/", "/privacy/", "/terms/", "/404.html",
  "/internal/status-badges/", "/network/", "/connectivity/"];
const IGNORE = /site-config\.json review needed|fonts\.(googleapis|gstatic)|TUNNEL_CONNECTION|Showing statuses pending owner approval/;
(async () => {
  const b = await chromium.launch(); const issues = []; let loads = 0;
  for (const lang of ["en", "ja", "ko", "zh-TW", "ar"]) for (const w of [375, 768, 1440]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    await ctx.addInitScript(l => { localStorage.setItem("kbkx-lang", l); localStorage.setItem("kbkx-cookie-consent", "declined"); }, lang);
    for (const p of PAGES) {
      const pg = await ctx.newPage(); loads++;
      pg.on("console", m => { if ((m.type() === "error" || m.type() === "warning") && !IGNORE.test(m.text())) issues.push(`${lang} ${p}@${w} ${m.type()}: ${m.text().slice(0, 140)}`); });
      pg.on("pageerror", e => issues.push(`${lang} ${p}@${w} PAGEERR ${e.message}`));
      pg.on("requestfailed", r => { if (!IGNORE.test(r.url())) issues.push(`${lang} ${p} REQFAIL ${r.url()}`); });
      pg.on("response", r => { if (r.status() >= 400) issues.push(`${lang} ${p} HTTP ${r.status()} ${r.url()}`); });
      await pg.goto(BASE + p, { waitUntil: "load" }); await pg.waitForTimeout(250);
      const r = await pg.evaluate(() => ({
        sw: document.documentElement.scrollWidth, dir: document.documentElement.dir, lang: document.documentElement.lang,
        broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src),
        statuses: [...document.querySelectorAll("[data-product-status],[data-status]")].map(e => ({ tone: e.getAttribute("data-tone"), hidden: e.hidden, text: e.textContent.trim() }))
      }));
      if (r.sw > w) issues.push(`${lang} ${p}@${w} OVERFLOW ${r.sw}`);
      if (r.broken.length) issues.push(`${lang} ${p} BROKEN IMG ${r.broken}`);
      if (r.lang !== lang) issues.push(`${lang} ${p} lang=${r.lang}`);
      if (lang === "ar" && r.dir !== "rtl") issues.push(`${p} not RTL`);
      r.statuses.forEach(s => { if (!s.hidden && (!s.tone || !s.text)) issues.push(`${lang} ${p} status not rendered (${s.text})`); });
      await pg.close();
    }
    await ctx.close();
  }
  // Review gate + approval guard (intercept the roadmap JSON).
  async function roadmapVariant(mutate) {
    const ctx = await b.newContext(); const pg = await ctx.newPage();
    await pg.route("**/data/product-roadmap.json", async route => {
      const res = await route.fetch(); const j = await res.json(); mutate(j);
      await route.fulfill({ response: res, body: JSON.stringify(j) });
    });
    await pg.goto(BASE + "/", { waitUntil: "networkidle" }); await pg.waitForTimeout(300);
    const out = await pg.evaluate(() => [...document.querySelectorAll("[data-product-status]")].map(e => [e.getAttribute("data-product-status"), e.hidden, e.textContent.trim()]));
    await ctx.close(); return out;
  }
  const gated = await roadmapVariant(j => {
    j.reviewGate.showUnapprovedStatuses = false;
    for (const p of Object.values(j.products)) p.approved = false;
  });
  if (gated.some(x => !x[1])) issues.push("review gate: unapproved badges still visible with showUnapprovedStatuses=false");
  const approvedOnly = await roadmapVariant(j => {
    j.reviewGate.showUnapprovedStatuses = false;
    j.products["white-label"].approved = true; j.products["agency-portal"].approved = false;
  });
  if (approvedOnly.filter(x => x[0] === "white-label").some(x => x[1])) issues.push("review gate: approved badge hidden with showUnapprovedStatuses=false");
  if (approvedOnly.filter(x => x[0] === "agency-portal").some(x => !x[1])) issues.push("review gate: unapproved badge shown next to approved ones");
  const guarded = await roadmapVariant(j => { j.products["white-label"].status = "live"; j.products["white-label"].approved = false; });
  if (guarded.filter(x => x[0] === "white-label").some(x => !x[1])) issues.push("approval guard: unapproved 'live' badge was rendered");
  console.log(`checked ${loads} page loads + gate/guard tests; issues: ${issues.length}`);
  console.log([...new Set(issues)].slice(0, 60).join("\n"));
  await b.close(); process.exit(issues.length ? 1 : 0);
})();
