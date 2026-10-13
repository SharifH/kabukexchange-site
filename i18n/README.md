# Translations (`i18n/`)

All site copy that changes per language lives here as **plain JSON** — one file per
language. No code. Non-engineers can edit these safely.

## Files

| File | What it is |
|------|-----------|
| `languages.json` | The list of languages shown in the site's language selector. **Edit this to add/remove a language.** |
| `en.json` | English — the **source of truth**. Every key that exists anywhere should exist here. |
| `ja.json`, `ko.json`, `zh-TW.json`, `ar.json` | The other languages. Same keys as `en.json`, translated values. |
| `_template.json` | A copy of the English keys, ready to duplicate when starting a new language. |

Each file is a flat map of `"key": "value"`. **Only translate the values** (the text on
the right). Never change the keys (the text on the left) — the site looks copy up by key.

```json
{
  "nav.home": "Home",
  "cta.becomePartner": "Become a Partner"
}
```

## How copy updates reach the site

Every page loads `i18n-bundle.js`, which `python3 build.py` generates from these JSON
files (flat or nested JSON are both accepted). Edit a value, run `python3 build.py`,
refresh. If the bundle is missing, `script.js` falls back to fetching these files directly. (Because the site fetches these files, view it through a local server,
not by double-clicking the HTML — see the main README.)

If a key is **missing or blank** in a language, the site automatically falls back to the
English value, so a half-finished translation never breaks the page.

## Adding a new language (e.g. French, `fr`)

1. **Copy** `_template.json` to a new file named with the language code: `fr.json`.
   (Use a standard code: `fr`, `es`, `de`, `pt-BR`, `zh-CN`, …)
2. **Translate** the values in `fr.json`. Leave the keys unchanged. You can translate
   incrementally — untranslated keys fall back to English.
3. **Add one entry** to `languages.json`:
   ```json
   { "code": "fr", "label": "Français", "dir": "ltr" }
   ```
   - `code` must match the filename (`fr` → `fr.json`).
   - `label` is what appears in the language selector (write it in that language).
   - `dir` is `"ltr"` for most languages, or `"rtl"` for right-to-left languages
     (Arabic, Hebrew, Persian, Urdu). RTL automatically mirrors the whole layout.
4. Refresh the site — the new language appears in the selector.

## Keeping languages in sync

`en.json` is the master key list. When new copy is added to the site, the new keys are
added to `en.json` first. To find keys still needing translation in another file, compare
its keys against `en.json` (any key only in `en.json` still needs translating).

Non-English text currently in these files is **draft quality** and should be reviewed by
a native speaker.
