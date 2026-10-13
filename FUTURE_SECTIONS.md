# Future Website Sections

All future modules are present in the HTML but hidden by default. Toggle them in `site-config.json` under `features`.

```json
"features": {
  "partnerLogos": false,
  "featuredProperties": false,
  "successStories": false,
  "networkMetrics": false,
  "hotelPhotography": false,
  "publicApiDocs": false,
  "knowledgeCenter": false,
  "events": false,
  "statusPage": false,
  "certifications": false
}
```

Set a flag to `true` only after the content, approvals, permissions, and linked destinations are ready. Hidden sections use `data-feature` and are enabled by `script.js`.
