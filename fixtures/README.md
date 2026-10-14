# fixtures — SYNTHETIC TEST DATA (preview builds only)

Everything in this folder is invented for testing layouts and publication rules.
No name, number, logo or relationship here is real. `build.py --preview` copies
these files over `data/` in `dist-preview/`; `build.py --production` never reads
this folder and fails if any fixture marker leaks into `dist/`.

The records deliberately include cases that must NOT render (unapproved,
prospective, unverified "live", future publishedAt, missing logo file) so the
preview doubles as a visual test of the rules.
