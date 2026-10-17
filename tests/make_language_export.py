#!/usr/bin/env python3
"""
Build a production export with site-config.json -> languageUrls switched ON,
without touching the working tree (for tests/language_urls.js and for review).

    python3 tests/make_language_export.py /tmp/kbkx-lang
    python3 -m http.server 8094 -d /tmp/kbkx-lang
    NODE_PATH=$(npm root -g) node tests/language_urls.js http://localhost:8094

The site is copied to a temporary folder, the flag is turned on there, the
normal production export runs, and its dist/ is moved to the given folder.
Do not deploy this folder: publishing the language URLs needs owner approval
(set languageUrls.enabled in site-config.json instead).
"""
import contextlib, io, json, os, shutil, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = shutil.ignore_patterns(".git", "dist", "dist-preview", "node_modules", "__pycache__")


def main(out):
    tmp = tempfile.mkdtemp()
    try:
        site = os.path.join(tmp, "site")
        shutil.copytree(ROOT, site, ignore=SKIP)
        p = os.path.join(site, "site-config.json")
        with open(p, encoding="utf-8") as f:
            cfg = json.load(f)
        cfg["languageUrls"]["enabled"] = True
        with open(p, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        sys.path.insert(0, site)
        import publish
        publish.ROOT = site
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = publish.export("production")
        print(buf.getvalue().rstrip())
        if code:
            return code
        if os.path.isdir(out):
            shutil.rmtree(out)
        shutil.move(os.path.join(site, "dist"), out)
        print("  language export -> %s" % out)
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(os.path.abspath(sys.argv[1])))
