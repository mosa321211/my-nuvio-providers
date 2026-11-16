const MAIN_URL = "https://aflaam.com";
const HEADERS = { "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36", Referer: `${MAIN_URL}/` };
function dec(s = "") { return String(s).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
function attr(tag, key) { const m = String(tag || "").match(new RegExp(`\\b${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")); return dec(m ? m[1] || m[2] || m[3] || "" : ""); }
function textOf(html = "") { return dec(String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim(); }
function abs(url, base = MAIN_URL) { try { return new URL(dec(String(url || "").trim()), base).href; } catch (_) { return ""; } }
async function request(url) { const r = await fetch(url, { headers: HEADERS, redirect: "follow" }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return { text: await r.text(), url: r.url || url }; }
async function names(id, type) {
  try { const kind = type === "movie" ? "movie" : "tv", r = await fetch(`https://www.themoviedb.org/${kind}/${encodeURIComponent(String(id))}?language=en-US`,{redirect:"follow"}); if (!r.ok) return []; const html = await r.text(), tag = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => m[0]).find(x => /property=["']og:title["']/i.test(x)), raw = attr(tag, "content") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "", title = dec(raw).replace(/\s*\([^)]*\)\s*(?:—|-).*$/i, "").replace(/\s*[—-]\s*The Movie Database.*$/i, "").trim(); return title ? [title] : []; } catch (_) { return []; }
}
function itemBlocks(html) { return [...String(html).matchAll(/<div\b[^>]*class=["'][^"']*\bitem\b[^"']*["'][^>]*>[\s\S]*?<\/div>\s*<\/div>?/gi)].map(m => m[0]); }
function cards(html, base) {
  const results = [];
  const re = /<div\b[^>]*class=["'][^"']*\bitem\b[^"']*["'][^>]*>[\s\S]*?(?=<div\b[^>]*class=["'][^"']*\bitem\b|$)/gi;
  for (const m of html.matchAll(re)) {
    const a = m[0].match(/<a\b[^>]*class=["'][^"']*\bbox\b[^"']*["'][^>]*>/i)?.[0];
    const titleTag = m[0].match(/<h3\b[^>]*class=["'][^"']*\bentry-title\b[^"']*["'][^>]*>[\s\S]*?<\/h3>/i)?.[0];
    const href = abs(attr(a, "href"), base), title = textOf(titleTag);
    if (href && title && (/\/movie\//.test(href) || /\/series\//.test(href))) results.push({ href, title, movie: /\/movie\//.test(href) });
  }
  return results;
}
async function search(q) { const r = await request(`${MAIN_URL}/search?q=${encodeURIComponent(q)}`); return cards(r.text, r.url); }
function tags(html, re) { return [...html.matchAll(re)].map(m => m[0]); }
function videoSources(html) {
  const out = [];
  for (const video of tags(html, /<video\b[^>]*>[\s\S]*?<\/video>/gi)) {
    for (const s of tags(video, /<source\b[^>]*>/gi)) {
      const url = attr(s, "src"); if (!url) continue;
      const size = attr(s, "size") || "720";
      out.push({ url, quality: /^\d+$/.test(size) ? `${size}p` : size, qualityNumber: Number(size) || 0 });
    }
  }
  return out;
}
async function sourcesFromItem(url) {
  const item = await request(url);
  const watchLinks = [];
  for (const a of tags(item.text, /<a\b[^>]*>/gi)) if (attr(a, "class").split(/\s+/).includes("link-show")) { const u = abs(attr(a, "href"), item.url); if (u) watchLinks.push(u); }
  const all = [];
  for (const watchUrl of [...new Set(watchLinks)]) {
    try {
      const page = await request(watchUrl);
      for (const source of videoSources(page.text)) all.push({ ...source, referer: item.url });
    } catch (_) { /* keep other watch pages */ }
  }
  return all;
}
async function seriesEpisode(seriesUrl, episode) {
  const page = await request(seriesUrl);
  const tab = page.text.match(/<div\b[^>]*id=["']movie-tab-1["'][^>]*>[\s\S]*?(?=<div\b[^>]*id=["']movie-tab-|$)/i)?.[0] || page.text;
  const entries = [];
  const re = /<div\b[^>]*class=["'][^"']*\bentry-box-3\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi;
  for (const m of tab.matchAll(re)) {
    const href = abs(attr(m[0].match(/<a\b[^>]*>/i)?.[0], "href"), page.url);
    const ep = Number(textOf(m[0].match(/<span\b[^>]*class=["'][^"']*font-size-50[^"']*["'][^>]*>[\s\S]*?<\/span>/i)?.[0]));
    if (href) entries.push({ href, ep });
  }
  return entries.reverse().find(x => x.ep === Number(episode || 1))?.href || "";
}
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const movie = mediaType === "movie", candidates = await names(tmdbId, mediaType);
    let results = [];
    for (const q of candidates) { results = await search(q); if (results.length) break; }
    const selected = results.find(x => x.movie === movie) || results[0];
    if (!selected) return [];
    const itemUrl = movie ? selected.href : await seriesEpisode(selected.href, episode);
    if (!itemUrl) return [];
    const streams = await sourcesFromItem(itemUrl), seen = new Set();
    return streams.filter(s => { if (seen.has(s.url)) return false; seen.add(s.url); return true; })
      .map(s => ({ name: "Aflaam", title: `Aflaam - ${s.quality}`, url: abs(s.url, itemUrl), quality: s.quality, language: "ar", headers: { ...HEADERS, Referer: s.referer || itemUrl } }));
  } catch (_) { return []; }
}

module.exports = { getStreams };
