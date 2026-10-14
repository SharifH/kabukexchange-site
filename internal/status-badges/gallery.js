/* Status badge gallery — renders tables from the central catalog.
   Internal reference only; English UI by design (labels table shows all locales). */
(function () {
  "use strict";
  function luminance(rgb) {
    var c = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function parse(col) { var m = col.match(/[\d.]+/g) || [0, 0, 0, 1]; return { rgb: m.slice(0, 3).map(Number), a: m[3] == null ? 1 : Number(m[3]) }; }
  function blend(fg, bg) { return fg.rgb.map(function (v, i) { return Math.round(v * fg.a + bg[i] * (1 - fg.a)); }); }
  function ratio(a, b) { var l1 = luminance(a), l2 = luminance(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
  function chipContrast(chip, groundRgb) {
    var cs = getComputedStyle(chip);
    var bg = blend(parse(cs.backgroundColor), groundRgb);
    var fg = blend(parse(cs.color), bg);
    return ratio(fg, bg);
  }
  function cell(tr, html, cls) { var td = document.createElement("td"); if (cls) td.className = cls; td.innerHTML = html; tr.appendChild(td); return td; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function build(data) {
    if (!data || !data.catalog) return;
    var cat = data.catalog, map = data.roadmap || {};
    var tbody = document.querySelector("#g-table tbody");
    tbody.innerHTML = "";
    cat.order.forEach(function (key) {
      var st = cat.statuses[key];
      var tr = document.createElement("tr");
      cell(tr, "<code>" + esc(key) + "</code><br><small>tone: " + esc(st.tone) + "</small>");
      var light = cell(tr, '<span class="status"></span>', "g-light");
      var dark = cell(tr, '<span class="status"></span>', "g-dark status-dark");
      cell(tr, esc(st.definition));
      cell(tr, esc(st.use));
      cell(tr, esc(st.avoid));
      var c = cell(tr, "", "g-contrast");
      tbody.appendChild(tr);
      window.KBKX.paintStatus(light.firstChild, key);
      window.KBKX.paintStatus(dark.firstChild, key);
      requestAnimationFrame(function () {
        var l = chipContrast(light.firstChild, [255, 255, 255]);
        var d = chipContrast(dark.firstChild, [17, 31, 76]);
        c.innerHTML = fmt(l) + " / " + fmt(d);
      });
    });
    function fmt(r) { var ok = r >= 4.5; return '<span class="g-ratio ' + (ok ? "ok" : "bad") + '">' + r.toFixed(1) + ":1 " + (ok ? "AA" : "below AA") + "</span>"; }

    var lt = document.querySelector("#g-label-table tbody");
    lt.innerHTML = "";
    cat.order.forEach(function (key) {
      var L = cat.statuses[key].label, tr = document.createElement("tr");
      cell(tr, "<code>" + esc(key) + "</code>");
      ["en", "ja", "ko", "zh-TW", "ar"].forEach(function (lc) { var td = cell(tr, esc(L[lc] || "—")); if (lc === "ar") td.dir = "rtl"; });
      lt.appendChild(tr);
    });

    var mt = document.querySelector("#g-map-table tbody");
    mt.innerHTML = "";
    var products = map.products || {};
    Object.keys(products).forEach(function (id) {
      var p = products[id], tr = document.createElement("tr");
      cell(tr, "<code>" + esc(id) + "</code>");
      var s = cell(tr, '<span class="status"></span>');
      window.KBKX.paintStatus(s.firstChild, p.status);
      cell(tr, p.approved ? "Approved — " + esc(p.approvedBy) + ", " + esc(p.approvedOn) : '<span class="g-ratio bad">Pending</span>');
      cell(tr, esc(p.source) + (p.note ? "<br><small>" + esc(p.note) + "</small>" : ""));
      mt.appendChild(tr);
    });
    var gate = (map.reviewGate || {}).showUnapprovedStatuses;
    document.getElementById("g-gate").textContent = "Review gate: showUnapprovedStatuses = " + gate +
      (gate ? " — unapproved suggested statuses are currently visible on the public site." : " — unapproved statuses are hidden on the public site.");
  }
  function buildMethods(m) {
    var tb = document.querySelector("#g-method-table tbody");
    if (!m || !tb) return;
    tb.innerHTML = "";
    m.order.forEach(function (key) {
      var d = m.methods[key], tr = document.createElement("tr");
      cell(tr, "<code>" + esc(key) + "</code><br><small>badge: " + esc(d.badge) + "</small>");
      var light = cell(tr, "<span></span>", "g-light");
      var dark = cell(tr, "<span></span>", "g-dark status-dark");
      cell(tr, esc(d.definition)); cell(tr, esc(d.use)); cell(tr, esc(d.avoid));
      var c = cell(tr, "", "g-contrast");
      tb.appendChild(tr);
      window.KBKX.paintMethod(light.firstChild, key);
      window.KBKX.paintMethod(dark.firstChild, key);
      requestAnimationFrame(function () {
        var l = chipContrast(light.firstChild, [255, 255, 255]), dd = chipContrast(dark.firstChild, [17, 31, 76]);
        c.innerHTML = ['<span class="g-ratio ' + (l >= 4.5 ? "ok" : "bad") + '">' + l.toFixed(1) + ":1</span>", '<span class="g-ratio ' + (dd >= 4.5 ? "ok" : "bad") + '">' + dd.toFixed(1) + ":1</span>"].join(" / ");
      });
    });
    var lt = document.querySelector("#g-label-table tbody");
    m.order.forEach(function (key) {
      var L = m.methods[key].label, tr = document.createElement("tr");
      cell(tr, "<code>method:" + esc(key) + "</code>");
      ["en", "ja", "ko", "zh-TW", "ar"].forEach(function (lc) { var td = cell(tr, esc(L[lc] || "—")); if (lc === "ar") td.dir = "rtl"; });
      lt.appendChild(tr);
    });
  }
  function start() {
    if (!window.KBKX || !window.KBKX.statuses || !window.KBKX.methods) { setTimeout(start, 50); return; }
    Promise.all([window.KBKX.statuses, window.KBKX.methods]).then(function (r) { build(r[0]); buildMethods(r[1]); });
  }
  start();
})();
