#!/usr/bin/env python3
"""
Indexable language URLs for the KabuK Exchange static site (publish step).

Called by publish.export() when site-config.json -> languageUrls.enabled is
true. Off by default: the non-English copy is machine-assisted draft (see
TRANSLATION_REVIEW.md) and must be approved before it is published.

For every route listed in languageUrls.pages that exists in the export, and
every language in languageUrls.languages, this writes a static copy of the
(already gate-stripped) English page at /<lang>/<route>:

  * <html lang dir> for that language;
  * every data-i18n / data-i18n-placeholder / data-i18n-aria-label rendered
    into the HTML from i18n/<lang>.json (English fallback, exactly like
    script.js);
  * <title> = "<translated h1> | KabuK Exchange", description = the first
    translated paragraph after the h1 (og:/twitter: tags follow);
  * a self-referencing canonical and og:url;
  * links to other language pages stay inside the language, everything else
    (assets, English-only pages) points back to the shared English files.

Every page in a language cluster (the English page included) gets the same
full hreflang set plus x-default (= English), and sitemap.xml lists each
language URL with xhtml:link alternates. The default English URLs, files and
canonicals are unchanged. Standard library only.
"""
import html
import json
import os
import posixpath
import re

DEFAULT_LANG = "en"
BRAND = "KabuK Exchange"
MIN_DESCRIPTION = 60          # skip short kickers when picking the description

START_TAG_RE = re.compile(r"<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>")
URL_ATTR_RE = re.compile(r'(\s(?:href|src))="([^"]*)"')
SRCSET_RE = re.compile(r'(\ssrcset)="([^"]*)"')
CANONICAL_RE = re.compile(r'<link\b[^>]*\brel="canonical"[^>]*>')
EXTERNAL_RE = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//|#)", re.I)


def flatten(obj, prefix=""):
    out = {}
    for k, v in obj.items():
        key = prefix + "." + k if prefix else k
        if isinstance(v, dict):
            out.update(flatten(v, key))
        elif isinstance(v, str) and not key.startswith("_"):
            out[key] = v
    return out


def route_file(route):
    """'/' -> 'index.html', '/hotels/' -> 'hotels/index.html'."""
    return (route.strip("/") + "/index.html").lstrip("/")


def norm_route(path):
    """Site-root path of a page link -> its route ('/hotels/'), or None."""
    path = path.split("#", 1)[0].split("?", 1)[0]
    if path.endswith("index.html"):
        path = path[: -len("index.html")]
    if not path.endswith("/"):
        return None
    return path


def set_attr(tag, name, value):
    """Set (or add) attribute `name` on the start tag string `tag`."""
    value = html.escape(value, quote=True)
    pat = re.compile(r'(\s%s=")[^"]*(")' % re.escape(name))
    if pat.search(tag):
        return pat.sub(lambda m: m.group(1) + value + m.group(2), tag, count=1)
    return re.sub(r"\s*(/?)>$", lambda m: ' %s="%s"%s>' % (name, value, m.group(1)), tag, count=1)


def get_attr(tag, name):
    m = re.search(r'\s%s="([^"]*)"' % re.escape(name), tag)
    return html.unescape(m.group(1)) if m else None


def element_end(s, name, pos):
    """Index of the '</name>' closing the element whose start tag ends at pos."""
    depth = 1
    tag_re = re.compile(r"<(/?)%s\b[^>]*>" % re.escape(name), re.I)
    for m in tag_re.finditer(s, pos):
        if m.group(0).endswith("/>"):
            continue
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return m.start()
    return -1


def render_strings(s, T):
    """Static equivalent of script.js applyLang(): fill data-i18n text and the
    data-i18n-placeholder / data-i18n-aria-label attributes."""
    out, pos = [], 0
    for m in START_TAG_RE.finditer(s):
        if m.start() < pos:
            continue                      # inside an element we already replaced
        tag = m.group(0)
        if "data-i18n" not in tag:
            continue
        new_tag = tag
        for attr, target in (("data-i18n-placeholder", "placeholder"), ("data-i18n-aria-label", "aria-label")):
            key = get_attr(tag, attr)
            if key and T(key) is not None:
                new_tag = set_attr(new_tag, target, T(key))
        key = get_attr(tag, "data-i18n")
        if key and T(key) is not None and not tag.endswith("/>"):
            end = element_end(s, m.group(1), m.end())
            if end != -1:
                out.append(s[pos:m.start()] + new_tag + html.escape(T(key), quote=False))
                pos = end
                continue
        out.append(s[pos:m.start()] + new_tag)
        pos = m.end()
    out.append(s[pos:])
    return "".join(out)


def text_of(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", fragment))).strip()


def seo_keys(s, en):
    """(title key, description key) for a page: the h1's data-i18n key and the
    first data-i18n paragraph after it whose English text is a real sentence."""
    h1 = re.search(r"<h1\b[^>]*>", s)
    if not h1:
        return None, None
    title_key = get_attr(h1.group(0), "data-i18n")
    desc_key = None
    for m in re.finditer(r"<p\b[^>]*\sdata-i18n=\"([^\"]+)\"[^>]*>", s[h1.end():]):
        if len(en.get(m.group(1), "")) >= MIN_DESCRIPTION:
            desc_key = m.group(1)
            break
    return title_key, desc_key


def set_meta(s, attr, name, value):
    pat = re.compile(r'<meta\b[^>]*\s%s="%s"[^>]*>' % (attr, re.escape(name)))
    return pat.sub(lambda m: set_attr(m.group(0), "content", value), s, count=1)


def rewrite_links(s, page_dir, localized_routes):
    """Pages move one folder deeper (/hotels/ -> /ja/hotels/). Relative links to
    another localized page keep resolving inside the language folder; every
    other relative URL (assets, English-only pages) gets one more '../'."""
    def fix(url):
        if not url or EXTERNAL_RE.match(url) or url.startswith("/"):
            return url
        path = url.split("#", 1)[0].split("?", 1)[0]
        target = posixpath.normpath(posixpath.join("/" + page_dir, path))
        if path in ("", ".") or path.endswith("/"):
            target = target.rstrip("/") + "/"
        if norm_route(target) in localized_routes:
            return url
        return "../" + url

    s = URL_ATTR_RE.sub(lambda m: '%s="%s"' % (m.group(1), fix(m.group(2))), s)
    s = SRCSET_RE.sub(lambda m: '%s="%s"' % (m.group(1), ", ".join(
        " ".join([fix(c.strip().split(" ")[0])] + c.strip().split(" ")[1:]) for c in m.group(2).split(","))), s)
    return s


def alternates_block(origin, route, codes):
    links = ['<link href="%s/%s" hreflang="%s" rel="alternate"/>' % (origin, lang_path(c, route), c) for c in codes]
    links.append('<link href="%s/%s" hreflang="x-default" rel="alternate"/>' % (origin, lang_path(DEFAULT_LANG, route)))
    return "\n".join(links)


def lang_path(code, route):
    """Path below the site origin, without a leading slash ('' for the English home)."""
    route = route.lstrip("/")
    return route if code == DEFAULT_LANG else code + "/" + route


def config(cfg):
    lu = cfg.get("languageUrls") or {}
    return lu if lu.get("enabled") is True else None


def generate(root, out_dir, cfg, gated_out, problems):
    """Write /<lang>/… pages + hreflang + sitemap entries into out_dir.
    Returns (localized routes, languages); both empty when disabled."""
    lu = config(cfg)
    if not lu:
        return [], []
    manifest = json.load(open(os.path.join(root, "i18n", "languages.json"), encoding="utf-8"))
    meta = {l["code"]: l for l in manifest}
    langs = []
    for code in lu.get("languages") or []:
        if code == DEFAULT_LANG or code not in meta:
            problems.append("languageUrls.languages: %r is not a non-English language in i18n/languages.json" % code)
        elif not os.path.exists(os.path.join(root, "i18n", code + ".json")):
            problems.append("languageUrls.languages: i18n/%s.json is missing" % code)
        elif code not in langs:
            langs.append(code)
    if not langs:
        problems.append("languageUrls is enabled but lists no usable languages")
        return [], []
    dicts = {c: flatten(json.load(open(os.path.join(root, "i18n", c + ".json"), encoding="utf-8")))
             for c in [DEFAULT_LANG] + langs}
    en = dicts[DEFAULT_LANG]

    routes = []
    for route in lu.get("pages") or []:
        if not isinstance(route, str) or not route.startswith("/") or not route.endswith("/"):
            problems.append("languageUrls.pages: %r must look like \"/hotels/\"" % route); continue
        rel = route_file(route)
        if rel in gated_out:
            continue                                   # launch-gated route that is switched off
        p = os.path.join(out_dir, rel)
        if not os.path.exists(p):
            problems.append("languageUrls.pages: %s is not a page of the site" % route); continue
        if re.search(r'<meta[^>]*name="robots"[^>]*noindex|<meta[^>]*noindex[^>]*name="robots"', open(p, encoding="utf-8").read()):
            problems.append("languageUrls.pages: %s is noindex and cannot have language URLs" % route); continue
        if route not in routes:
            routes.append(route)
    route_set = set(routes)
    codes = [DEFAULT_LANG] + langs

    for route in routes:
        rel = route_file(route)
        src_path = os.path.join(out_dir, rel)
        s = open(src_path, encoding="utf-8").read()
        canon = CANONICAL_RE.search(s)
        href = get_attr(canon.group(0), "href") if canon else None
        m = re.match(r"^(https://[^/]+)", href or "")
        if not m:
            problems.append("%s: needs an absolute https canonical to build language URLs" % rel); continue
        origin = m.group(1)
        if href != "%s/%s" % (origin, lang_path(DEFAULT_LANG, route)):
            problems.append("%s: canonical %s is not the page's own URL" % (rel, href)); continue
        alt = alternates_block(origin, route, codes)

        def with_cluster(doc, code):
            doc = re.sub(r"<html\b[^>]*>", lambda h: set_attr(set_attr(set_attr(h.group(0), "lang", code),
                         "dir", meta[code].get("dir", "ltr")), "data-lang-urls", ""), doc, count=1)
            url = "%s/%s" % (origin, lang_path(code, route))
            doc = CANONICAL_RE.sub(lambda c: set_attr(c.group(0), "href", url) + "\n" + alt, doc, count=1)
            return set_meta(doc, "property", "og:url", url)

        page_dir = posixpath.dirname(rel)
        page_dir = page_dir + "/" if page_dir else ""
        for code in langs:
            d = dicts[code]
            T = lambda k, d=d: d.get(k) or en.get(k)
            doc = render_strings(s, T)
            tk, dk = seo_keys(s, en)
            if tk and T(tk):
                title = "%s | %s" % (T(tk), BRAND)
                doc = re.sub(r"<title>.*?</title>", lambda _: "<title>%s</title>" % html.escape(title, quote=False), doc, count=1, flags=re.S)
                doc = set_meta(set_meta(doc, "property", "og:title", title), "name", "twitter:title", title)
            if dk and T(dk):
                for a, n in (("name", "description"), ("property", "og:description"), ("name", "twitter:description")):
                    doc = set_meta(doc, a, n, T(dk))
            doc = rewrite_links(doc, page_dir, route_set)
            doc = with_cluster(doc, code)
            dst = os.path.join(out_dir, code, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            open(dst, "w", encoding="utf-8").write(doc)
        open(src_path, "w", encoding="utf-8").write(with_cluster(s, DEFAULT_LANG))

    sitemap(out_dir, routes, codes)
    return routes, (langs if routes else [])


def sitemap(out_dir, routes, codes):
    p = os.path.join(out_dir, "sitemap.xml")
    if not os.path.exists(p) or not routes:
        return
    s = open(p, encoding="utf-8").read()
    loc_re = re.compile(r"<url><loc>(https://[^/<]+)(/[^<]*)</loc></url>")

    def repl(m):
        origin, route = m.group(1), m.group(2)
        if route not in routes:
            return m.group(0)
        alts = "".join('<xhtml:link rel="alternate" hreflang="%s" href="%s/%s"/>' % (c, origin, lang_path(c, route)) for c in codes)
        alts += '<xhtml:link rel="alternate" hreflang="x-default" href="%s/%s"/>' % (origin, lang_path(DEFAULT_LANG, route))
        return "\n  ".join("<url><loc>%s/%s</loc>%s</url>" % (origin, lang_path(c, route), alts) for c in codes)
    s = loc_re.sub(repl, s)
    if "xmlns:xhtml" not in s:
        s = s.replace('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
                      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"', 1)
    open(p, "w", encoding="utf-8").write(s)
