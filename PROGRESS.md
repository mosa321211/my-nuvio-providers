# Provider porting progress

## Ported providers (11)

- `topcinema.js` — custom Vidtube packed-JS decoding is included. External player hosts that CloudStream resolved through its extractor registry may remain embed links.
- `3isk.js` — multi-stage watch form and packed player decoding are included; external embed hosts can still require the CloudStream extractor registry.
- `5tv.js` — search, episode lookup, server discovery, unpacking, and media candidate logic are included; host changes or anti-bot blocks can prevent resolving links.
- `aflaam.js` — search, episode lookup, and direct source extraction are included; only page-exposed source URLs are handled.
- `aia2tv.js` — server traversal, player unpacking, and direct/HLS URL parsing are included; generic CloudStream extractor hosts are not bundled.
- `akwam.js` — search, season/episode discovery, download/watch source parsing are included; generic CloudStream extractor hosts are not bundled.
- `alooytv.js` — changing-domain lookup and video source parsing are included; the source's URL fallback may become stale.
- `anim3rb.js` — Livewire search and Vid3rb source JSON parsing are included; the Android cookie/WebView challenge solver is not portable, so Cloudflare or other browser challenges can block requests.
- `anime-phoenix.js` — signed search API, episode discovery, Base64 server decoding, direct links, and Drive URL handling are included; Cloudflare cookies from the Android WebView helper cannot be generated in the standalone provider.
- `anime4up.js` — episode/server parsing and VnxPlayer HLS parsing are included; Android WebView Cloudflare challenge solving is not portable. Share4max dynamic Inertia source responses may need adjustment if server markup changes.
- `animerift.js` — the app API/search/episode/source request sequence is represented; the Kotlin source contains literal placeholder JWT, Firebase API key, and Firebase app ID values (`RIFT_*_PLACEHOLDER`), so API calls are not expected to authenticate until real values are supplied.

## Remaining source plugins (33)

`Animerco`, `Animewitcher`, `Bristege`, `Carateen`, `Cee`, `CimaClub`, `Cimalight`, `Cimatn`, `Egy`, `Egydead`, `Elif`, `Faselhd`, `Krmzy`, `Lodynet`, `MyCimaProvider`, `OscarTv`, `Rate`, `Replaymatch`, `Shahid4u`, `Shahidwbas`, `Syria-live`, `TVgarden`, `TukTukcima`, `TuniflexBlog`, `Tuniflix`, `Viu`, `Wecima`, `Witanime`, `Yacintv`, `Youtube`, `cinemana`, `dima-toon`, and `eseek`.

## Cross-provider limitations

- Nuvio providers return stream descriptors; they do not have CloudStream's `loadExtractor` registry. Embedded hosts are extracted when their pages expose media URLs, otherwise the embed URL may be returned as a stream.
- The source plugins' Android WebView Cloudflare solvers cannot be run in the standalone JavaScript provider environment.
- Provider behavior depends on third-party site layouts, host availability, and anti-bot rules and may need maintenance as those sites change.
- This progress inventory is based on the source repository folder listing; only the eleven listed providers have been ported so far.
