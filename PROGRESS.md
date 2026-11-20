# Provider debugging and maintenance

## Manifest version 0.1.2

The working AlooyTV provider resolves its current host from the landing page, looks up English and Arabic TMDB titles, searches until one title yields results, follows the matching episode when applicable, and only returns `<source src>` URLs exposed by the media page. Returned streams carry a provider name, title, URL, quality, language, and request headers with a browser user agent and referer.

## Changes in this pass

- `topcinema.js` — searches with English and Arabic TMDB names, ranks results against the searched title, and now emits only direct MP4/M3U8 URLs. Unresolved embed pages are dropped instead of being returned as playable streams; Vidtube extraction remains.
- `5tv.js` — searches both TMDB title localizations, ranks the matching result, no longer relies on `AbortSignal.timeout`, merges browser headers into all returned links, derives quality from the media URL, and rejects links that are not direct video files.
- `3isk.js` — retains its two-language TMDB search, ranks title candidates before choosing the requested media type, and keeps only direct video URLs obtained from its embed probing flow.
- `aia2tv.js` — ranks search cards against the English/Arabic query before following a series episode; keeps the existing direct media extraction, validation, and per-host referer headers.
- `aflaam.js` — now searches English and Arabic TMDB names and ranks the matching movie/series card; keeps `<source>` extraction and page referers.
- `anime4up.js` — ranks search results against either TMDB title and no longer returns VTT subtitle files as if they were playable video streams; keeps its HLS/source parsing and request headers.

The six providers keep their site-specific URLs and page structures. Their returned video streams use Nuvio's `{ name, title, url, quality, language, headers }` shape. All active manifest paths remain relative (`providers/<id>.js`).

## Other active providers

- `akwam.js`, `alooytv.js`, `anim3rb.js`, and `anime-phoenix.js` were not otherwise changed in this pass.
- `animerift.js` remains excluded from the manifest because its source credentials were placeholders and its API returned `403 ACCESS_DENIED`.

## Known limitations

- Nuvio providers do not include CloudStream's `loadExtractor` registry. Top Cinema now omits embeds it cannot resolve to a direct MP4/M3U8.
- Cloudflare solvers tied to Android WebView in the Kotlin plugins are not portable to the standalone providers.
- Source-site layouts and stream hosts can change independently of the provider code.
