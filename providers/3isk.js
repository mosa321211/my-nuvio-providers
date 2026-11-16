const MAIN_URL = "https://3esk.onl";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
  "Accept-Language": "ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: `${MAIN_URL}/`,
};

function dec(s = "") {
  return String(s).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}
function attr(tag, key) {
  const m = String(tag || "").match(new RegExp(`\\b${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return dec(m ? m[1] || m[2] || m[3] || "" : "");
}
function text(html = "") { return dec(String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim(); }
function abs(url, base = MAIN_URL) { try { return new URL(dec(String(url || "").trim()), base).href; } catch (_) { return ""; } }
function origin(url) { try { return new URL(url).origin; } catch (_) { return MAIN_URL; } }
function firstTag(html, name) { return String(html || "").match(new RegExp(`<${name}\\b[^>]*>`, "i"))?.[0] || ""; }
function blocks(html, name, cls) {
  const re = new RegExp(`<\\/?${name}\\b[^>]*>`, "gi"), out = []; let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith("</") || !attr(m[0], "class").split(/\s+/).includes(cls)) continue;
    const start = m.index; let depth = 1, end = re.lastIndex, n;
    while ((n = re.exec(html))) { if (n[0].startsWith("</")) depth--; else if (!/\/>$/.test(n[0])) depth++; if (!depth) { end = re.lastIndex; break; } }
    out.push(html.slice(start, end)); re.lastIndex = end;
  }
  return out;
}
function decode64(s) {
  if (!s) return "";
  let value = String(s).trim().replace(/-/g, "+").replace(/_/g, "/");
  while (value.length % 4) value += "=";
  try { return decodeURIComponent(Array.from(atob(value), c => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")); }
  catch (_) { try { return atob(value); } catch (__) { return ""; } }
}
async function request(url, options = {}) {
  const response = await fetch(url, { method: options.method || "GET", headers: options.headers || HEADERS, body: options.body, redirect: "follow" });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return { text: await response.text(), url: response.url || url };
}
async function titleNames(id,type){const kind=type==='movie'?'movie':'tv',out=[];for(const lang of ['en-US','ar-SA']){try{const r=await fetch(`https://www.themoviedb.org/${kind}/${encodeURIComponent(String(id))}?language=${lang}`,{redirect:'follow'});if(!r.ok)continue;const h=await r.text(),tag=[...h.matchAll(/<meta\b[^>]*>/gi)].map(x=>x[0]).find(x=>/property=["']og:title["']/i.test(x)),raw=attr(tag,'content')||h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'',title=dec(raw).replace(/\s*\([^)]*\)\s*(?:—|-).*$/i,'').replace(/\s*[—-]\s*The Movie Database.*$/i,'').trim();if(title&&!out.some(x=>x.toLowerCase()===title.toLowerCase()))out.push(title)}catch(_){}}return out}
function searchCards(html, base) {
  const re = /<a\b[^>]*>/gi, list = []; let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    if (!/type_item(?:_wide)?\b/.test(attr(tag, "class"))) continue;
    const href = abs(decode64(attr(tag, "data-clse")) || attr(tag, "href"), base);
    const title = attr(tag, "title") || text(tag);
    const poster = abs(attr(firstTag(html.slice(m.index, html.indexOf("</a>", m.index) + 4), "img"), "data-image") || attr(firstTag(html.slice(m.index, html.indexOf("</a>", m.index) + 4), "img"), "src"), base);
    if (!href || !title) continue;
    const type = /\/tvshows\//.test(href) ? "tv" : /\/movies\//.test(href) ? "movie" : /\/episodes\//.test(href) ? "episode" : "other";
    if (type !== "other") list.push({ href, title, poster, type });
  }
  return list;
}
async function search(query) {
  const url = `${MAIN_URL}/search/${encodeURIComponent(query)}/`;
  const page = await request(url);
  return searchCards(page.text, page.url);
}
function episodeNumber(s) { const m = String(s || "").match(/\d+/); return m ? Number(m[0]) : null; }
function episodesFromHtml(html, pageUrl, poster) {
  const out = [];
  const re = /<a\b[^>]*class=["'][^"']*\bep-num\b[^"']*["'][^>]*>/gi; let m;
  while ((m = re.exec(html))) {
    const a = m[0];
    const raw = attr(a, "data-clse") || attr(a, "href");
    const href = abs(/^https?:/i.test(raw) ? raw : decode64(raw) || attr(a, "href"), pageUrl);
    if (!href) continue;
    out.push({ href, episode: Number(attr(a, "data-ep-num")) || episodeNumber(attr(a, "title")), season: Number((pageUrl.match(/season-num-(\d+)/) || [])[1]) || 1, name: attr(a, "title") || "Episode", poster });
  }
  return out;
}
async function getItemUrl(card, season, episode) {
  if (card.type !== "tv") return card.href;
  const page = await request(card.href);
  for (const seasonHtml of blocks(page.text, "div", "season-eps")) {
    const id = attr(seasonHtml.match(/<div\b[^>]*>/i)?.[0] || "", "id");
    const seasonNo = Number(id.replace("season-num-", "")) || 1;
    if (seasonNo !== Number(season || 1)) continue;
    const items = episodesFromHtml(seasonHtml, page.url, card.poster);
    const found = items.find(x => x.episode === Number(episode || 1));
    if (found) return found.href;
  }
  return "";
}
function jsUnescape(s) {
  return String(s).replace(/\\u([\da-f]{4})|\\x([\da-f]{2})|\\([\\'"nt])/gi, (m, u, x, c) => u ? String.fromCharCode(parseInt(u, 16)) : x ? String.fromCharCode(parseInt(x, 16)) : ({ n: "\n", t: "\t", "\\": "\\", "'": "'", '"': '"' }[c] ?? c));
}
function unpackPacker(html) {
  const sig = html.indexOf("function(p,a,c,k,e,d)");
  if (sig < 0) return "";
  const open = html.indexOf("{", sig); let depth = 0, close = -1, quote = "", esc = false;
  for (let i = open; i < html.length; i++) {
    const c = html[i];
    if (quote) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { close = i; break; }
  }
  if (close < 0) return "";
  const args = html.slice(close + 1).match(/^\s*\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5(?:\.split\(['"]\|['"]\))?/);
  if (!args) return "";
  let payload = jsUnescape(args[2]); const radix = Number(args[3]), count = Number(args[4]), words = args[6].split("|");
  const digits = "0123456789abcdefghijklmnopqrstuvwxyz";
  const b36 = n => { if (!n) return "0"; let s = ""; while (n > 0) { s = digits[n % 36] + s; n = Math.floor(n / 36); } return s; };
  for (let i = count - 1; i >= 0; i--) if (words[i]) payload = payload.replace(new RegExp(`\\b${b36(i)}\\b`, "g"), words[i]);
  return payload;
}
function mediaUrls(html) {
  const found = new Set();
  const re = /https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4|webm|mov)(?:\?[^\s"'<>\\]*)?/gi;
  let m; while ((m = re.exec(html))) found.add(m[0]);
  for (const url of [...found]) if (url.includes("\\u002F")) found.add(url.replace(/\\u002F/g, "/").replace(/\\\//g, "/"));
  return [...found];
}
async function probeEmbed(embedUrl, referer, depth = 0) {
  if (depth > 1) return [];
  let page;
  try { page = await request(embedUrl, { headers: { ...HEADERS, Referer: referer } }); } catch (_) { return []; }
  const urls = mediaUrls(page.text);
  urls.push(...mediaUrls(unpackPacker(page.text)));
  if (urls.length) return [...new Set(urls)];
  if (depth < 1) {
    const iframe = page.text.match(/<iframe\b[^>]*src=["']([^"']+)["']/i)?.[1];
    if (iframe) return probeEmbed(abs(iframe, page.url), page.url, depth + 1);
  }
  return [];
}
async function discoverEpisodeStreams(itemUrl) {
  const initial = await request(itemUrl);
  const form = (() => {
    const forms = [...initial.text.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map(x => x[0]);
    return forms.find(f => /3isk|3esk|watch/i.test(attr(f.match(/<form\b[^>]*>/i)?.[0], "action")) || /single-watch-btn/.test(f)) || "";
  })();
  if (!form) return [];
  const formTag = form.match(/<form\b[^>]*>/i)?.[0] || "";
  const post1Url = abs(attr(formTag, "action"), initial.url);
  const fields = new URLSearchParams();
  for (const m of form.matchAll(/<input\b[^>]*type=["']hidden["'][^>]*>/gi)) {
    const n = attr(m[0], "name"); if (n) fields.set(n, attr(m[0], "value"));
  }
  const button = form.match(/<button\b[^>]*class=["'][^"']*single-watch-btn[^"']*["'][^>]*>/i)?.[0];
  if (button && attr(button, "name")) fields.set(attr(button, "name"), attr(button, "value"));
  const posted1 = await request(post1Url, { method: "POST", body: fields.toString(), headers: { ...HEADERS, Referer: initial.url, "Content-Type": "application/x-www-form-urlencoded" } });
  const next = posted1.text.match(/var\s+myUrl\s*=\s*["']([^"']+)["']/)?.[1];
  const news = posted1.text.match(/myInput\.value\s*=\s*["']([^"']+)["']/)?.[1];
  if (!next || !news) return [];
  const body2 = new URLSearchParams({ news, u: "", submit: "submit" }).toString();
  const posted2 = await request(abs(next, posted1.url), { method: "POST", body: body2, headers: { ...HEADERS, Referer: posted1.url, "Content-Type": "application/x-www-form-urlencoded" } });
  const baseIframe = posted2.text.match(/<iframe\b[^>]*src=["']([^"']+)["']/i)?.[1];
  if (!baseIframe) return [];
  const base = abs(baseIframe, posted2.url);
  const m = base.match(/^(https:\/\/3esk\.onl\/embed\/)(\d+)\/(.*)$/i);
  const targets = m ? Array.from({ length: 5 }, (_, i) => `${m[1]}${i + 1}/${m[3]}`) : [base];
  const streams = new Set();
  for (const target of targets) for (const url of await probeEmbed(target, posted2.url)) streams.add(url);
  return [...streams].map(url => ({ name: "3isk", title: `3isk • ${url.match(/\.(m3u8|mp4|webm|mov)/i)?.[1]?.toUpperCase() || "Video"}`, url, quality: "HD", language: "ar", headers: { ...HEADERS, Referer: origin(url) + "/" } }));
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const names = await titleNames(tmdbId, mediaType);
    let results = [];
    for (const name of names) { results = await search(name); if (results.length) break; }
    const type = mediaType === "movie" ? "movie" : "tv";
    const card = results.find(x => type === "movie" ? x.type === "movie" : x.type === "tv") || results.find(x => x.type === "episode");
    if (!card) return [];
    const target = card.type === "tv" ? await getItemUrl(card, season, episode) : card.href;
    if (!target) return [];
    if (card.type === "movie") return discoverEpisodeStreams(target);
    const series = await request(card.href);
    const items = [];
    for (const group of blocks(series.text, "div", "season-eps")) {
      const id = attr(group.match(/<div\b[^>]*>/i)?.[0], "id");
      const s = Number(id.replace("season-num-", "")) || 1;
      if (s !== Number(season || 1)) continue;
      items.push(...episodesFromHtml(group, series.url, card.poster));
    }
    const ep = items.find(x => x.episode === Number(episode || 1));
    return ep ? discoverEpisodeStreams(ep.href) : [];
  } catch (_) { return []; }
}

module.exports = { getStreams };
