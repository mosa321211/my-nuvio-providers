const MAIN_URL = "https://aflaam.com";
const HEADERS = { "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36", Referer: `${MAIN_URL}/` };
function dec(s = "") { return String(s).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
function attr(tag, key) { const m = String(tag || "").match(new RegExp(`\\b${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")); return dec(m ? m[1] || m[2] || m[3] || "" : ""); }
function textOf(html = "") { return dec(String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim(); }
function abs(url, base = MAIN_URL) { try { return new URL(dec(String(url || "").trim()), base).href; } catch (_) { return ""; } }
async function request(url) { const r = await fetch(url, { headers: HEADERS, redirect: "follow" }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return { text: await r.text(), url: r.url || url }; }
async function names(id, type){
  const kind = type === "movie" ? "movie" : "tv", names = [];
  for (const language of ["en-US", "ar-SA"]) {
    try {
      const response = await fetch(`https://www.themoviedb.org/${kind}/${encodeURIComponent(String(id))}?language=${language}`, { redirect: "follow" });
      if (!response.ok) continue;
      const html = await response.text();
      const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]).find((tag) => /property=["']og:title["']/i.test(tag));
      const raw = attr(meta, "content") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
      const title = dec(raw).replace(/\s*\([^)]*\)\s*(?:—|-).*$/i, "").replace(/\s*[—-]\s*The Movie Database.*$/i, "").trim();
      if (title && !names.some((name) => name.toLowerCase() === title.toLowerCase())) names.push(title);
    } catch (_) { /* try the other TMDB localization */ }
  }
  return names;
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
function normalizeTitle(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u064B-\u065F\u0670]/g, "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim(); }
function titleScore(candidate, query) {
  const a = normalizeTitle(candidate), b = normalizeTitle(query);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 80;
  const aa = [...new Set(a.split(/\s+/).filter(Boolean))], bb = [...new Set(b.split(/\s+/).filter(Boolean))];
  const common = aa.filter((token) => bb.includes(token)).length;
  return common ? 50 * common / Math.max(aa.length, bb.length) : 0;
}
function bestTitleMatch(items, query, titleOf) { return [...items].sort((a, b) => titleScore(titleOf(b), query) - titleScore(titleOf(a), query))[0] || null; }

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const movie = mediaType === "movie", candidates = await names(tmdbId, mediaType);
    let results = [], searchedTitle = "";
    for (const q of candidates) { const rows = await search(q); if (rows.length) { results = rows; searchedTitle = q; break; } }
    const typed = results.filter((x) => x.movie === movie);
    const selected = bestTitleMatch(typed.length ? typed : results, searchedTitle, (x) => x.title);
    if (!selected) return [];
    const itemUrl = movie ? selected.href : await seriesEpisode(selected.href, episode);
    if (!itemUrl) return [];
    const streams = await sourcesFromItem(itemUrl), seen = new Set();
    return streams.filter(s => { if (seen.has(s.url)) return false; seen.add(s.url); return true; })
      .map(s => ({ name: "Aflaam", title: `Aflaam - ${s.quality}`, url: abs(s.url, itemUrl), quality: s.quality, language: "ar", headers: { ...HEADERS, Referer: s.referer || itemUrl } }));
  } catch (_) { return []; }
}

module.exports = { getStreams };
