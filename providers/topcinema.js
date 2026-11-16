const MAIN_URL = "https://www.topcinema.cam";
const UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: `${MAIN_URL}/`,
};

const decodeHtml = (s = "") => String(s)
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

function attr(tag, name) {
  const m = String(tag || "").match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeHtml(m ? m[1] || m[2] || m[3] || "" : "");
}

function textOf(html = "") {
  return decodeHtml(String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function absolute(url, base = MAIN_URL) {
  try { return new URL(decodeHtml(String(url || "").trim()), base).href; } catch (_) { return ""; }
}

function origin(url) {
  try { return new URL(url).origin; } catch (_) { return MAIN_URL; }
}

function classBlocks(html, tagName, className) {
  const re = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  const result = [];
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith("</") || !attr(m[0], "class").split(/\s+/).includes(className)) continue;
    const start = m.index;
    let depth = 1;
    let end = re.lastIndex;
    let next;
    while ((next = re.exec(html))) {
      if (next[0].startsWith("</")) depth--;
      else if (!/\/>$/.test(next[0])) depth++;
      if (!depth) { end = re.lastIndex; break; }
    }
    result.push(html.slice(start, end));
    re.lastIndex = end;
  }
  return result;
}

function firstTag(html, name, className) {
  for (const m of String(html || "").matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))) {
    if (!className || attr(m[0], "class").split(/\s+/).includes(className)) return m[0];
  }
  return "";
}

async function request(url, { method = "GET", headers = HEADERS, body } = {}) {
  const res = await fetch(url, { method, headers, body, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return { text: await res.text(), url: res.url || url };
}

function cards(html, base) {
  return classBlocks(html, "div", "Small--Box").flatMap((card) => {
    const a = firstTag(card, "a");
    const href = absolute(attr(a, "href"), base);
    const title = attr(a, "title") || textOf(a);
    if (!href || !title) return [];
    const image = firstTag(a, "img");
    return [{
      href, title,
      poster: absolute(attr(image, "data-src") || attr(image, "src"), base),
      isSeries: title.includes("مسلسل") || /class=["'][^"']*\b(?:number|epnum)\b|\/series\//i.test(card + href),
    }];
  });
}

async function metadataTitles(tmdbId, mediaType) {
  const type = mediaType === "movie" ? "movie" : "tv";
  try {
    const r = await fetch(`https://www.themoviedb.org/${type}/${encodeURIComponent(String(tmdbId))}?language=en-US`,{redirect:"follow"});
    if (!r.ok) return [];
    const html = await r.text();
    const tag = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]).find((x) => /property=["']og:title["']/i.test(x));
    const raw = attr(tag, "content") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
    const title = decodeHtml(raw).replace(/\s*\([^)]*\)\s*(?:—|-).*$/i, "").replace(/\s*[—-]\s*The Movie Database.*$/i, "").trim();
    return title ? [title] : [];
  } catch (_) { return []; }
}

async function search(title) {
  const result = await request(`${MAIN_URL}/search/?query=${encodeURIComponent(title)}&type=all`);
  return cards(result.text, result.url);
}

function num(s) {
  const m = String(s || "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

async function episodeUrl(seriesUrl, wantedSeason, wantedEpisode) {
  const series = await request(seriesUrl);
  const seasons = classBlocks(series.text, "div", "Season");
  const parseEpisodes = (html, base, seasonNo, seasonPoster) => {
    const found = [];
    for (const row of classBlocks(html, "div", "row")) {
      for (const a of row.matchAll(/<a\b[^>]*>/gi)) {
        const href = absolute(attr(a[0], "href"), base);
        const close = row.indexOf("</a>", a.index);
        const anchorHtml = close >= 0 ? row.slice(a.index, close + 4) : a[0];
        const label = `${attr(a[0], "title")} ${textOf(anchorHtml)}`;
        const n = Number(label.match(/الحلقة\D*(\d+)/i)?.[1] || label.match(/episode\D*(\d+)/i)?.[1] || label.match(/\b(\d+)\b/)?.[1]) || null;
        if (href && n != null) found.push({ href, season: seasonNo, episode: n, poster: seasonPoster || absolute(attr(firstTag(row, "img"), "src"), base) });
      }
    }
    return found;
  };

  if (seasons.length) {
    for (const block of seasons) {
      const a = firstTag(block, "a");
      const href = absolute(attr(a, "href"), series.url);
      const seasonNo = num(textOf(block).match(/الموسم\s*\d+/)?.[0]);
      if (!href || (seasonNo != null && seasonNo !== Number(wantedSeason || 1))) continue;
      const poster = absolute(attr(firstTag(block, "img"), "src"), series.url);
      const page = await request(href, { headers: { ...HEADERS, Referer: series.url } });
      const ep = parseEpisodes(page.text, page.url, seasonNo || Number(wantedSeason) || 1, poster)
        .find((x) => x.episode === Number(wantedEpisode || 1));
      if (ep) return ep.href;
    }
  }

  const seasonNo = num(series.text.match(/الموسم\s*\d+/)?.[0]) || Number(wantedSeason) || 1;
  return parseEpisodes(series.text, series.url, seasonNo, "")
    .find((x) => x.episode === Number(wantedEpisode || 1))?.href || "";
}

function baseN(n, base) {
  const digits = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (!n) return "0";
  let out = "";
  while (n > 0) { out = digits[n % base] + out; n = Math.floor(n / base); }
  return out;
}

function unpackPacker(payload, radix, count, words) {
  const base = radix > 0 && radix <= 62 ? radix : 62;
  const dict = Object.create(null);
  for (let i = 0; i < count; i++) if (words[i]) dict[baseN(i, base)] = words[i];
  return payload.replace(/[0-9A-Za-z]+/g, (token) => dict[token] || token);
}

function unpackVidtube(html) {
  const re = /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\6\.split\(['"]\|['"]\)/i;
  const m = html.match(re);
  if (!m) return "";
  return unpackPacker(m[2].replace(/\\'/g, "'"), Number(m[3]), Number(m[4]), m[6] ? m[6].split("|") : []);
}

function makeStream(url, title, referer, quality = "HD") {
  return {
    name: "Top Cinema", title, url, quality, language: "ar",
    headers: { ...HEADERS, Referer: referer || `${MAIN_URL}/` },
  };
}

function quality(label) {
  const m = String(label || "").match(/(\d{3,4})\s*p?/i);
  return m ? `${m[1]}p` : "HD";
}

function cleanUrl(url) { return String(url || "").replace(/[&?]referer=[^&]*/i, ""); }

function unwrapPlay(url) {
  try {
    if (!url.includes("play.php?to=")) return url;
    let value = decodeURIComponent(url.split("play.php?to=")[1]).trim();
    const hits = [...value.matchAll(/https:\/\//g)];
    if (hits.length > 1) value = value.slice(hits[hits.length - 1].index);
    return value.startsWith("http") ? value : `https:${value.replace(/^:+/, "")}`;
  } catch (_) { return url; }
}

async function extractVidtube(url, referer) {
  const host = origin(url);
  let page;
  try { page = await request(url, { headers: { ...HEADERS, Referer: referer || host + "/" } }); }
  catch (_) { return []; }

  const buttons = [...page.text.matchAll(/<a\b[^>]*>/gi)].map((m) => m[0]).filter((a) => /\/d\//.test(attr(a, "href")));
  const streams = [];
  if (buttons.length) {
    for (const a of buttons) {
      const download = absolute(attr(a, "href"), host);
      const label = textOf(a).match(/\b(?:\d{3,4}p?|HD|SD|FHD|4K)\b/i)?.[0] || "Direct";
      try {
        const dl = await request(download, { headers: { ...HEADERS, Referer: url } });
        const link = [...dl.text.matchAll(/<a\b[^>]*>/gi)].map((m) => m[0]).find((x) => /btn-primary|download|\.mp4|\.m3u8/i.test(attr(x, "class") + " " + attr(x, "href")));
        const direct = link ? absolute(attr(link, "href"), dl.url) : dl.url;
        if (direct) streams.push(makeStream(cleanUrl(direct), `Vidtube - ${label}`, host + "/", quality(label)));
      } catch (_) { /* retain other quality links */ }
    }
    return streams;
  }

  const decoded = unpackVidtube(page.text);
  const files = [...decoded.matchAll(/\bfile\s*:\s*["'](https?:\/\/[^"']+)["']/gi)];
  const labels = [...decoded.matchAll(/\blabel\s*:\s*["']([^"']+)["']/gi)];
  files.forEach((m, i) => {
    const label = labels[i]?.[1] || "Auto";
    streams.push(makeStream(cleanUrl(m[1]), `Vidtube - ${label}`, host + "/", quality(label)));
  });
  return streams;
}

async function resolveEmbed(url, referer, depth = 0) {
  if (!url || depth > 2) return [];
  url = unwrapPlay(url);
  if (/vidtube/i.test(url)) return extractVidtube(url, referer);
  if (/\.(?:m3u8|mp4)(?:[?#]|$)/i.test(url)) return [makeStream(url, "Top Cinema", referer)];

  let page;
  try { page = await request(url, { headers: { ...HEADERS, Referer: referer || origin(url) + "/" } }); }
  catch (_) { return [makeStream(url, `Top Cinema - ${new URL(url).hostname}`, referer)]; }

  const html = unpackVidtube(page.text) || page.text;
  const media = [];
  for (const m of html.matchAll(/(?:file|src)\s*:\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/gi)) media.push(m[1]);
  for (const m of html.matchAll(/<source\b[^>]*src=["']([^"']+)["']/gi)) media.push(absolute(m[1], page.url));
  if (media.length) return [...new Set(media.filter(Boolean))].map((link) => makeStream(link, "Top Cinema", url));

  if (depth < 2) {
    for (const m of page.text.matchAll(/<iframe\b[^>]*src=["']([^"']+)["']/gi)) {
      const nested = absolute(m[1], page.url);
      if (nested && nested !== url) {
        const result = await resolveEmbed(nested, url, depth + 1);
        if (result.length) return result;
      }
    }
  }
  // The CloudStream loadExtractor host library is not available in Nuvio's standalone file.
  return [makeStream(url, `Top Cinema - ${new URL(url).hostname}`, referer)];
}

async function discover(pageUrl) {
  const links = new Map();
  if (/\/watch\//i.test(pageUrl)) {
    const page = await request(pageUrl);
    const base = origin(page.url);
    for (const m of page.text.matchAll(/<iframe\b[^>]*>/gi)) {
      if (/player--iframe/i.test(attr(m[0], "class"))) {
        const src = absolute(attr(m[0], "src"), page.url);
        if (src) links.set(src, page.url);
      }
    }
    for (const block of classBlocks(page.text, "li", "server--item")) {
      const li = block.match(/<li\b[^>]*>/i)?.[0] || "";
      const body = new URLSearchParams({ id: attr(li, "data-id"), i: attr(li, "data-server") }).toString();
      try {
        const ajax = await request(`${base}/wp-content/themes/movies2023/Ajaxat/Single/Server.php`, {
          method: "POST", body, headers: { ...HEADERS, "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Accept: "*/*", Referer: page.url },
        });
        const iframe = ajax.text.match(/<iframe\b[^>]*>/i)?.[0];
        const src = iframe && absolute(attr(iframe, "src"), page.url);
        if (src) links.set(src, page.url);
      } catch (_) { /* continue other servers */ }
    }
  } else if (/\/download\//i.test(pageUrl)) {
    const page = await request(pageUrl);
    for (const m of page.text.matchAll(/<a\b[^>]*>/gi)) {
      if (attr(m[0], "class").split(/\s+/).includes("downloadsLink")) {
        const href = absolute(attr(m[0], "href"), page.url);
        if (href) links.set(href, page.url);
      }
    }
  } else links.set(pageUrl, origin(pageUrl));
  return links;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const movie = mediaType === "movie";
    const titles = await metadataTitles(tmdbId, mediaType);
    if (!titles.length) return [];

    let found = [];
    for (const title of titles) {
      found = await search(title);
      if (found.length) break;
    }
    const candidates = found.filter((x) => movie ? !x.isSeries : x.isSeries);
    const selected = candidates[0] || found[0];
    if (!selected) return [];

    const itemUrl = movie ? selected.href : await episodeUrl(selected.href, season || 1, episode || 1);
    if (!itemUrl) return [];
    const detail = await request(itemUrl);
    const urls = [`${detail.url.replace(/\/$/, "")}/watch/`, `${detail.url.replace(/\/$/, "")}/download/`];
    const output = [];
    const seen = new Set();

    for (const target of urls) {
      let links;
      try { links = await discover(target); } catch (_) { continue; }
      for (const [url, ref] of links) {
        const streams = await resolveEmbed(unwrapPlay(url), ref);
        for (const item of streams) {
          if (item.url && !seen.has(item.url)) { seen.add(item.url); output.push(item); }
        }
      }
    }
    // Nuvio can play direct media most reliably; put those ahead of host pages.
    const isDirect = (s) => /\.(?:m3u8|mp4)(?:[?#]|$)/i.test(s.url);
    return output.sort((a, b) => Number(isDirect(b)) - Number(isDirect(a)));
  } catch (_) { return []; }
}

module.exports = { getStreams };
