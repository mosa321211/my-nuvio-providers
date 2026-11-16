const MAIN_URL = "https://new61.5tv.lol";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const HEADERS = { "User-Agent": UA, Referer: `${MAIN_URL}/` };

function dec(s = "") { return String(s).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\\"/g, '"').replace(/\\'/g, "'"); }
function attr(tag, key) { const m = String(tag || "").match(new RegExp(`\\b${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")); return dec(m ? m[1] || m[2] || m[3] || "" : ""); }
function textOf(html = "") { return dec(String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim(); }
function abs(url, base = MAIN_URL) { try { return new URL(dec(String(url || "").trim()), base).href; } catch (_) { return ""; } }
function origin(url) { try { return new URL(url).origin; } catch (_) { return MAIN_URL; } }
function tag(html, selector) {
  const cls = selector.replace(/^\./, "");
  for (const m of String(html || "").matchAll(/<[a-z][^>]*>/gi)) if (attr(m[0], "class").split(/\s+/).includes(cls)) return m[0];
  return "";
}
function block(html, selector) {
  const cls = selector.replace(/^\./, ""), re = /<([a-z][\w:-]*)\b[^>]*>|<\/([a-z][\w:-]*)\s*>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (!m[1] || !attr(m[0], "class").split(/\s+/).includes(cls)) continue;
    const name = m[1], start = m.index, closeRe = new RegExp(`<\\/?${name}\\b[^>]*>`, "gi"); closeRe.lastIndex = re.lastIndex;
    let depth = 1, close;
    while ((close = closeRe.exec(html))) { if (close[0].startsWith("</")) depth--; else if (!/\/>$/.test(close[0])) depth++; if (!depth) return html.slice(start, closeRe.lastIndex); }
  }
  return "";
}
async function request(url, options = {}) {
  const r = await fetch(url, { method: options.method || "GET", headers: options.headers || HEADERS, body: options.body, redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return { text: await r.text(), url: r.url || url, status: r.status, headers: r.headers };
}
async function titles(id, type) {
  try { const kind = type === "movie" ? "movie" : "series"; const r = await fetch(`https://v3-cinemeta.strem.io/meta/${kind}/${encodeURIComponent(String(id))}.json`); if (!r.ok) return []; const m = (await r.json()).meta; return [...new Set([m?.name, ...(m?.aliases || []), m?.original_name, m?.original_title].filter(x => typeof x === "string" && x.trim()).map(x => x.trim()))]; } catch (_) { return []; }
}
function parseCard(article, base) {
  const titleText = block(article, ".ftv-home-poster-card__title") || block(article, ".ftv-home-episode-card__title");
  let linkTag = tag(article, ".ftv-home-poster-card__image") || tag(article, ".ftv-home-episode-card__title");
  if (!linkTag) linkTag = article.match(/<a\b[^>]*>/i)?.[0] || "";
  const href = abs(attr(linkTag, "href"), base);
  const title = textOf(titleText) || attr(linkTag, "title");
  const img = article.match(/<img\b[^>]*>/i)?.[0] || "";
  const poster = abs(attr(img, "src") || attr(img, "data-src"), base);
  if (!href || !title) return null;
  return { href, title, poster, movie: /\/movie\//i.test(href) || /ftv-home-poster-card--movie/.test(attr(article.match(/<article\b[^>]*>/i)?.[0], "class")) };
}
async function search(q) {
  const r = await request(`${MAIN_URL}/search/?q=${encodeURIComponent(q)}`);
  const grid = block(r.text, ".ftv-search-grid") || r.text;
  return [...grid.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map(m => parseCard(m[0], r.url)).filter(Boolean);
}
function number(s) { const m = String(s || "").match(/\d+/); return m ? Number(m[0]) : null; }
async function selectEpisode(seriesUrl, season, episode) {
  let page = await request(seriesUrl);
  if (/\/episode\//i.test(seriesUrl)) {
    const backTag = tag(page.text, ".ftv-episode-poster-back");
    const back = abs(attr(backTag, "href"), page.url);
    if (back) { page = await request(back); seriesUrl = back; }
  }
  const re = /<a\b[^>]*class=["'][^"']*\bftv-series-episode-card\b[^"']*["'][^>]*>|<a\b[^>]*class=["'][^"']*\bftv-episode-card\b[^"']*["'][^>]*>/gi;
  const episodes = [];
  for (const m of page.text.matchAll(re)) {
    const href = abs(attr(m[0], "href"), page.url);
    const title = attr(m[0], "title") || textOf(m[0]);
    const ep = number(title) || number(block(page.text.slice(m.index, m.index + 1000), ".ftv-series-episode-card__body"));
    if (href) episodes.push({ href, episode: ep });
  }
  const chosen = episodes.find(x => x.episode === Number(episode || 1));
  return chosen?.href || "";
}
function unescape(s) { return dec(String(s).replace(/\\\//g, "/").replace(/\\u002F/gi, "/").replace(/\\x([\da-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))); }
function unpackDean(script) {
  const split = Math.max(script.lastIndexOf(".split('|')"), script.lastIndexOf('.split("|")'));
  if (split < 0) return "";
  const sub = script.slice(0, split);
  const ms = [...sub.matchAll(/,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]/g)];
  const m = ms[ms.length - 1]; if (!m) return "";
  const radix = Number(m[1]), count = Number(m[2]);
  const words = sub.slice(m.index + m[0].length).split("|");
  const brace = sub.lastIndexOf("}", m.index);
  const quote = sub.indexOf("'", brace) >= 0 ? sub.indexOf("'", brace) : sub.indexOf('"', brace);
  if (brace < 0 || quote < 0) return "";
  let payload = sub.slice(quote + 1, m.index).replace(/['"]\s*$/, "");
  const digits = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const baseN = n => { if (!n) return "0"; let s = ""; while (n > 0) { s = digits[n % radix] + s; n = Math.floor(n / radix); } return s; };
  for (let i = count - 1; i >= 0; i--) { const k = baseN(i); if (words[i]) payload = payload.replace(new RegExp(`\\b${k}\\b`, "g"), words[i]); }
  return payload;
}
function streamsFromText(html) {
  const found = new Set();
  const patterns = [
    /https?:[\\/]+[^\s"'<>]+\.m3u8[^\s"'<>]*/gi,
    /https?:[\\/]+[^\s"'<>]+cloudflarestorage[^\s"'<>]*/gi,
    /https?:[\\/]+[^\s"'<>]+\.(?:mp4|mkv)(?:\?[^\s"'<>]*)?/gi,
    /["']?file["']?\s*:\s*["']([^"']+)["']/gi,
  ];
  for (const re of patterns) for (const m of html.matchAll(re)) found.add(unescape(m[1] || m[0]).split(/["'<>,]/)[0]);
  return [...found].filter(x => /^https?:/i.test(x) && /m3u8|mp4|mkv|webm|mov/i.test(x));
}
async function inspectTarget(raw, pageUrl, isDownload) {
  let url = abs(raw, pageUrl);
  if (url.includes("dsvplay.com")) url = url.replace("dsvplay.com", "playmogo.com");
  let page;
  try { page = await request(url, { headers: { ...HEADERS, Referer: pageUrl } }); } catch (_) { return []; }
  let content = unescape(page.text);
  if (content.includes("eval(function(p,a,c,k")) content += "\n" + unescape(unpackDean(content));
  const found = streamsFromText(content);
  if (isDownload) {
    for (const m of page.text.matchAll(/<a\b[^>]*>/gi)) {
      const href = attr(m[0], "href");
      if (/\.(?:mp4|mkv|m3u8)/i.test(href)) found.push(abs(href, page.url));
    }
  }
  return [...new Set(found)];
}
async function probe(url, domain) {
  const hdrs = { "User-Agent": UA, Range: "bytes=0-1" };
  try { const r = await fetch(url, { method: "GET", headers: hdrs, redirect: "follow" }); if (r.ok) return {}; } catch (_) {}
  try { const r = await fetch(url, { method: "GET", headers: { ...hdrs, Referer: domain, Origin: domain.replace(/\/$/, "") }, redirect: "follow" }); if (r.ok) return { Referer: domain, Origin: domain.replace(/\/$/, "") }; } catch (_) {}
  if (/\.m3u8/i.test(url)) {
    try { const r = await fetch(url, { headers: { Referer: domain }, redirect: "follow" }); if (r.ok) return { Referer: domain }; } catch (_) {}
    try { const r = await fetch(url, { redirect: "follow" }); if (r.ok) return {}; } catch (_) {}
  }
  return null;
}
async function extract(pageUrl) {
  const page = await request(pageUrl);
  const targets = [], seen = new Set();
  const iframe = page.text.match(/<iframe\b[^>]*class=["'][^"']*\bftv-player-iframe\b[^"']*["'][^>]*>/i)?.[0];
  if (iframe) { const u = abs(attr(iframe, "src"), page.url); if (u) { targets.push({ name: "Direct Player", url: u, download: false }); seen.add(u); } }
  for (const m of page.text.matchAll(/<button\b[^>]*data-server-url=["'][^"']+["'][^>]*>/gi)) {
    const u = abs(attr(m[0], "data-server-url"), page.url), name = textOf(m[0]) || "Stream";
    if (u && !seen.has(u)) { targets.push({ name, url: u, download: false }); seen.add(u); }
  }
  const downloadZone = block(page.text, ".ftv-download-list");
  for (const m of downloadZone.matchAll(/<a\b[^>]*>/gi)) {
    const u = abs(attr(m[0], "href"), page.url);
    if (u && !seen.has(u)) { targets.push({ name: "Download", url: u, download: true }); seen.add(u); }
  }
  const output = [];
  for (const target of targets) {
    for (const url of await inspectTarget(target.url, page.url, target.download)) {
      const headers = await probe(url, origin(target.url) + "/");
      if (!headers) continue;
      output.push({ name: "5TV", title: `[5TV] ${target.name}`, url, quality: "1080p", language: "ar", headers });
    }
  }
  return output;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const movie = mediaType === "movie";
    const names = await titles(tmdbId, mediaType);
    let cards = [];
    for (const title of names) { cards = await search(title); if (cards.length) break; }
    const selected = cards.find(x => x.movie === movie) || cards[0];
    if (!selected) return [];
    let target = selected.href;
    if (!movie) {
      target = await selectEpisode(selected.href, season, episode);
      if (!target) return [];
    }
    return extract(target);
  } catch (_) { return []; }
}

module.exports = { getStreams };
