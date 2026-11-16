# Provider debugging and maintenance

## Active manifest providers (10)

- `topcinema.js` — direct `.mp4`/`.m3u8` links are now sorted before embed/player pages. Some site servers still expose only embeds or are blocked by anti-bot pages.
- `3isk.js` — TMDB title lookup now queries both English and Arabic titles before searching; supports the source site's multistep player flow.
- `5tv.js` — returns direct media URLs only, so direct links naturally take priority; some third-party servers remain unavailable or challenge requests.
- `aflaam.js` — search, episode lookup, and direct source extraction; reachability is intermittent in the current runtime.
- `aia2tv.js` — TMDB lookup now tries English and Arabic titles; server traversal and direct/HLS parsing included.
- `akwam.js` — switched to `akwam.net`, identified by Akwam's official link hub. The hub warns against lookalike domains; runtime reachability remains environment-dependent.
- `alooytv.js` — TMDB lookup now tries English and Arabic title variants; changing-domain lookup and video source parsing included.
- `anim3rb.js` — official/current hostname remains `anime3rb.com`; domain lookup was confirmed from current web results, though this Node runtime reports DNS `ENOTFOUND`.
- `anime-phoenix.js` — current site is `anime-phoenix.com`; its web interface is active, but its legacy signed API implementation may not match the current site API.
- `anime4up.js` — TMDB lookup now tries English and Arabic title variants; provider is anime-only, so general Arabic/Turkish series and non-anime movie titles are out of catalog by design.

## Removed from manifest

- `animerift.js` — omitted because source credentials are literal placeholders and its API returned `403 ACCESS_DENIED`.

## Known limitations

- Search sites may index titles in Arabic, English, or transliteration; trying two TMDB language variants improves matching but cannot guarantee an exact catalog match.
- Nuvio providers do not include CloudStream's `loadExtractor` registry. Top Cinema falls back to embed pages only when no direct media URL is exposed; 5TV extracts direct media URLs from its server pages.
- Android WebView Cloudflare solvers in the original Kotlin plugins are not portable to these standalone providers.
- Live Node fetch tests in this environment currently fail DNS resolution (`ENOTFOUND`) for anime3rb.com and anime-phoenix.com and reset (`ECONNRESET`) on akwam.net. Public web search confirms current public pages/domains, but those runtime failures prevent validating provider stream output here.
