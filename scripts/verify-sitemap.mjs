import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");
const entries = [...sitemap.matchAll(/<loc\s*>\s*([^<]+?)\s*<\/loc\s*>/g)].map((match) => match[1].trim());
const openingTags = (sitemap.match(/<loc\b/g) || []).length;
if (!entries.length || entries.length !== openingTags || !sitemap.includes("</urlset>")) {
  throw new Error("Sitemap XML URL entries are incomplete.");
}
const urls = new Set(entries);
if (urls.size !== entries.length) throw new Error("Sitemap contains duplicate URLs.");
const origin = new URL(entries[0]).origin;
const errors = [];
const pages = [join(root, "index.html")];

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.name === "index.html") pages.push(path);
  }
}
for (const section of ["golf", "guide", "region"]) collect(join(root, section));

const expected = new Set();
const internalTargets = new Set();
let internalLinksChecked = 0;
for (const page of pages) {
  const html = readFileSync(page, "utf8");
  const pathname = "/" + relative(root, page).split(sep).join("/").replace(/index\.html$/, "");
  const ownUrl = new URL(pathname, origin).href;
  if (html.includes("_FXwxkG/chat")) errors.push(`Wrong general-inquiry channel: ${pathname}`);
  if (!html.includes('class="nav-cta" href="https://pf.kakao.com/_xdBALn/chat"')) errors.push(`Direct golf inquiry is missing: ${pathname}`);
  if ((html.match(/<h1\b/gi) || []).length !== 1) errors.push(`Expected one H1: ${pathname}`);
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const href = (match[1] ?? match[2]).replaceAll("&amp;", "&");
    try {
      const target = new URL(href, ownUrl);
      if (target.origin !== origin) continue;
      internalLinksChecked++;
      internalTargets.add(target.pathname);
      const file = resolve(root, "." + decodeURIComponent(target.pathname));
      const inRoot = file === root || file.startsWith(root + sep);
      const candidates = [file, join(file, "index.html"), file + ".html"];
      if (!inRoot || !candidates.some((item) => existsSync(item) && statSync(item).isFile())) errors.push(`Missing internal target: ${pathname} -> ${href}`);
    } catch { errors.push(`Invalid internal link: ${pathname} -> ${href}`); }
  }
  const dataScript = html.match(/<script id="golf-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (dataScript) {
    try {
      const data = JSON.parse(dataScript[1]);
      if (data.rates || data.courses.some((course) => course.price)) errors.push(`Expired price data remains public: ${pathname}`);
    } catch { errors.push(`Invalid course data: ${pathname}`); }
  }
  if (/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) continue;
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
  if (canonical !== ownUrl) errors.push(`Canonical mismatch: ${pathname}`);
  if (!urls.has(ownUrl)) errors.push(`Missing from sitemap: ${pathname}`);
  expected.add(ownUrl);
}
for (const url of urls) {
  if (!expected.has(url)) errors.push(`Unexpected sitemap URL: ${url}`);
}
const catalog = JSON.parse(readFileSync(join(root, "assets", "catalog.json"), "utf8"));
if (catalog.rates || catalog.courses.some((course) => course.price)) errors.push("Expired price data remains in public catalog.");
const runtime = readFileSync(join(root, "assets", "planner-runtime.js"), "utf8");
if (!runtime.includes("timeZone: 'Asia/Ho_Chi_Minh'")) errors.push("Planner dates do not use Vietnam local day.");
const manifest = JSON.parse(readFileSync(join(root, "BUILD_MANIFEST.json"), "utf8"));
if (manifest.url_count !== urls.size || manifest.current_priced_course_count !== 0) errors.push("Build manifest counts are stale.");
for (const entry of manifest.files) {
  const raw = readFileSync(join(root, entry.path));
  const bytes = /\.(?:html|css|js|json|svg|xml|txt|webmanifest)$/i.test(entry.path)
    ? Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8")
    : raw;
  const hash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
  if (bytes.length !== entry.bytes || hash !== entry.sha256) errors.push(`Build manifest file mismatch: ${entry.path}`);
}
const guideEntries = [...sitemap.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url\s*>/g)]
  .map((match) => ({
    url: match[1].match(/<loc\s*>\s*([^<]+?)\s*<\/loc\s*>/)?.[1]?.trim(),
    lastmod: match[1].match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/)?.[1]?.trim(),
  }))
  .filter((entry) => entry.url && entry.lastmod);
const newestGuideDate = guideEntries.filter((entry) => new URL(entry.url).pathname.startsWith("/guide/"))
  .reduce((latest, entry) => entry.lastmod > latest ? entry.lastmod : latest, "");
const homeHtml = readFileSync(join(root, "index.html"), "utf8");
for (const entry of guideEntries.filter((item) => item.lastmod === newestGuideDate && new URL(item.url).pathname.startsWith("/guide/"))) {
  const path = new URL(entry.url).pathname;
  if (!homeHtml.includes(`href="${path}"`)) errors.push(`Latest guide lacks homepage link: ${path}`);
}
const homeDate = guideEntries.find((entry) => new URL(entry.url).pathname === "/")?.lastmod;
if (!homeDate || homeDate < newestGuideDate) errors.push("Homepage lastmod predates newest guide link.");
console.log(JSON.stringify({ indexablePages: expected.size, sitemapUrls: urls.size, internalLinksChecked, internalTargets: internalTargets.size, errors }, null, 2));
if (errors.length) process.exitCode = 1;
