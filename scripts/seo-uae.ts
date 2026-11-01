/* eslint-disable @typescript-eslint/no-explicit-any */
// SEO for the UAE market, in one run: SEO title, SEO description and keywords / hashtags for products, category pages, brands,
// journal articles, info pages (about, shipping, returns…) and the homepage. English and Arabic. Written for people in Dubai,
// Abu Dhabi, Sharjah, Ajman, Ras Al Khaimah, Fujairah, Umm Al Quwain and Al Ain who search with cash on delivery, "near me" and gift intent.
//
//   npm run db:seo-uae                       dry run: shows what it would write and a few samples, writes nothing
//   npm run db:seo-uae -- --apply            writes (a backup of every touched collection goes to ./backups first)
//   npm run db:seo-uae -- --apply --overwrite   also replaces SEO text that is already filled in (otherwise only EMPTY fields are filled, so
//                                            anything an admin wrote by hand is kept; safe to run again after new products are added)
//   --only=products,categories,brands,articles,pages,home    limit to some parts
//   --limit=200                              products: only the first N (to try it out)
//   --match=Rolex  --samples=10              products: only names matching this text/regex, and print more samples
//
// It only states facts the data holds (name, brand, category) plus the store's own promises (fast UAE delivery, cash on delivery,
// easy returns). It never invents materials, sizes, authenticity or discounts. The same file runs in every storefront of this family:
// it reads each project's own schema (string / list / English+Arabic) and only writes the fields that project actually has.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { ProductModel } from "../lib/models/Product";
import { CollectionModel } from "../lib/models/Collection";
import { BrandModel } from "../lib/models/Brand";
import { SEO_LABEL, STORE_NAME, categoryCopy, hasArabic, hasSupplierName, plainName, productCopy, resolveBrand } from "../lib/seo-copy";

// Referenced so the models register their schemas (shapeOf reads them) and the bundler cannot drop the imports.
const REGISTERED = [ProductModel, CollectionModel, BrandModel].map((m) => m.modelName);
const args = process.argv.slice(2);
const apply = args.includes("--apply") || process.env.npm_config_apply === "true";
const overwrite = args.includes("--overwrite") || process.env.npm_config_overwrite === "true";
const only = args.find((a) => a.startsWith("--only="))?.split("=")[1]?.split(",");
const limit = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1]) || 0;
const match = args.find((a) => a.startsWith("--match="))?.split("=").slice(1).join("="); // only products whose name matches this regex, e.g. --match=رولكس
const nSamples = Number(args.find((a) => a.startsWith("--samples="))?.split("=")[1]) || 3;
const want = (part: string) => !only || only.includes(part);

// ---- UAE vocabulary --------------------------------------------------------------------------------------------------------
const CITIES = ["Dubai", "Abu Dhabi", "Sharjah"];
const ALL_CITIES_AR = "دبي وأبوظبي والشارقة";
type Cat = { en: string; enPl: string; ar: string; arPl: string; extra: string[]; extraAr: string[] };
const CATS: Record<string, Cat> = {
  watches: { en: "watch", enPl: "watches", ar: "ساعة", arPl: "ساعات", extra: ["luxury watches", "men's watches", "women's watches", "watch gift"], extraAr: ["ساعات فاخرة", "ساعات رجالية", "ساعات نسائية"] },
  jewelry: { en: "jewelry piece", enPl: "jewelry", ar: "مجوهرات", arPl: "مجوهرات", extra: ["luxury jewelry", "gold jewelry", "jewelry gift"], extraAr: ["مجوهرات فاخرة", "هدايا مجوهرات"] },
  perfume: { en: "perfume", enPl: "perfumes", ar: "عطر", arPl: "عطور", extra: ["arabic perfume", "oud perfume", "fragrance", "perfume gift"], extraAr: ["عطور فاخرة", "عطور عربية", "عود"] },
  bags: { en: "bag", enPl: "bags", ar: "حقيبة", arPl: "حقائب", extra: ["designer bags", "handbags", "wallets"], extraAr: ["حقائب نسائية", "حقائب يد", "محافظ"] },
  footwear: { en: "shoes", enPl: "shoes", ar: "حذاء", arPl: "أحذية", extra: ["sneakers", "designer shoes"], extraAr: ["أحذية رياضية", "أحذية فاخرة"] },
  glasses: { en: "sunglasses", enPl: "sunglasses", ar: "نظارة شمسية", arPl: "نظارات شمسية", extra: ["designer sunglasses", "eyewear"], extraAr: ["نظارات", "نظارات ماركات"] },
  caps: { en: "cap", enPl: "caps", ar: "قبعة", arPl: "قبعات", extra: ["baseball caps", "hats"], extraAr: ["كابات", "قبعات رجالية"] },
  belts: { en: "belt", enPl: "belts", ar: "حزام", arPl: "أحزمة", extra: ["designer belts", "leather belts"], extraAr: ["أحزمة جلد", "أحزمة ماركات"] },
  apparel: { en: "clothing item", enPl: "clothing", ar: "ملابس", arPl: "ملابس", extra: ["men's clothing", "underwear"], extraAr: ["ملابس رجالية"] },
  home: { en: "home accessory", enPl: "home accessories", ar: "مستلزمات المنزل", arPl: "مستلزمات المنزل", extra: ["home decor", "home essentials", "kitchen"], extraAr: ["ديكور المنزل", "أدوات منزلية"] },
  accessories: { en: "accessory", enPl: "accessories", ar: "إكسسوار", arPl: "إكسسوارات", extra: ["fashion accessories", "gift ideas"], extraAr: ["إكسسوارات رجالية", "هدايا"] },
};
CATS.perfumes = CATS.perfume; CATS.glass = CATS.glasses; CATS.shoes = CATS.footwear; CATS.bag = CATS.bags; CATS.watch = CATS.watches;
const catOf = (slug?: string | null): Cat | undefined => CATS[(slug ?? "").toLowerCase().replace(/^all-/, "")];
const titleCase = (s: string) => s.replace(/^all[-\s]/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

// ---- small helpers ---------------------------------------------------------------------------------------------------------
const clip = (s: string, max: number) => {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1), sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–|-]+$/, "") + "…";
};
const ellipsisFree = (s: string, max: number) => clip(s, max).replace(/…$/, "");
const kwClean = (list: (string | undefined | false | null)[], max = 16) => {
  const seen = new Set<string>(), out: string[] = [];
  for (const raw of list) {
    const k = (raw || "").replace(/#/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    if (k.length < 3 || k.length > 60 || seen.has(k) || hasSupplierName(k)) continue;
    seen.add(k); out.push(k);
    if (out.length >= max) break;
  }
  return out;
};
const titleFit = (core: string, suffixes: string[]) => { for (const s of suffixes) if ((core + s).length <= 62) return core + s; return clip(core, 62); };
const TAIL_EN = "Fast delivery in Dubai, Abu Dhabi & Sharjah, cash on delivery, easy returns.";
const descFit = (s: string) => clip(s, 158);
/** Text + the first tail that still fits a Google snippet whole (never a tail cut in the middle). */
const withTail = (text: string, tails: string[]) => { for (const t of tails) if (`${text} ${t}`.length <= 158) return `${text} ${t}`; return descFit(text); };
const JUNK_CATEGORIES = new Set(["general", "lambskin", "jadore", ""]);

// ---- schema awareness: write only what this project's models support ---------------------------------------------------------
type Fmt = "flat" | "i18n" | "none";
type KwFmt = "array" | "string" | "i18n" | "none";
type Shape = { title: Fmt; desc: Fmt; kw: KwFmt };
async function tryImport(...paths: string[]) { for (const p of paths) { try { await import(p); return; } catch { /* not in this project */ } } }
function shapeOf(model: string, base = "seo"): Shape {
  const s = mongoose.models[model]?.schema;
  if (!s) return { title: "none", desc: "none", kw: "none" };
  const fmt = (f: string): Fmt => (s.path(`${base}.${f}`) ? "flat" : s.path(`${base}.${f}.en`) ? "i18n" : "none");
  const k = s.path(`${base}.keywords`);
  return { title: fmt("title"), desc: fmt("description"), kw: k ? (k.instance === "Array" ? "array" : "string") : s.path(`${base}.keywords.en`) ? "i18n" : "none" };
}
/** For collections whose model is not loaded here: read the shape from a document that already has an seo block. */
function shapeFromDoc(d: any, base = "seo"): Shape {
  const s = d?.[base];
  if (!s || typeof s !== "object") return { title: "none", desc: "none", kw: "none" };
  const f = (v: any): Fmt => (typeof v === "string" ? "flat" : v && typeof v === "object" ? "i18n" : "none");
  return { title: f(s.title), desc: f(s.description), kw: Array.isArray(s.keywords) ? "array" : typeof s.keywords === "string" ? "string" : s.keywords && typeof s.keywords === "object" ? "i18n" : f(s.title) === "i18n" ? "i18n" : "none" };
}
const getPath = (o: any, p: string) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const isEmpty = (v: any) => v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");
const kwOut = (fmt: KwFmt, list: string[]) => (fmt === "array" ? list : list.join(", "));

type Gen = { title?: string; description?: string; keywords?: string[] };
/** Adds `$set` entries for one language of a seo block, respecting what exists, what the schema allows and --overwrite. */
function fill(doc: any, set: Record<string, unknown>, shape: Shape, lang: "en" | "ar", g: Gen, base = "seo") {
  const at = (f: string, fmt: Fmt | KwFmt) => (fmt === "i18n" ? `${base}.${f}.${lang}` : `${base}.${f}`);
  const old = (f: string, fmt: Fmt | KwFmt) => getPath(doc, at(f, fmt));
  const stale = (v: any) => hasSupplierName(Array.isArray(v) ? v.join(" ") : String(v ?? ""));
  if (shape.title !== "none" && g.title && (shape.title === "i18n" || lang === "en") && (overwrite || isEmpty(old("title", shape.title)) || stale(old("title", shape.title)))) set[at("title", shape.title)] = g.title;
  if (shape.desc !== "none" && g.description && (shape.desc === "i18n" || lang === "en") && (overwrite || isEmpty(old("description", shape.desc)) || stale(old("description", shape.desc)))) set[at("description", shape.desc)] = g.description;
  if (shape.kw !== "none" && g.keywords?.length && (shape.kw === "i18n" || lang === "en") && (overwrite || isEmpty(old("keywords", shape.kw)))) {
    // A flat project has ONE keywords field: the English list also carries the Arabic terms, so both audiences are covered.
    set[at("keywords", shape.kw)] = kwOut(shape.kw, g.keywords);
  }
}

// ---- products ---------------------------------------------------------------------------------------------------------------
function productKeywords(p: { name: string; brand: string; category: string; colors: string[]; tags: string[] }) {
  const cat = catOf(p.category), name = plainName(p.name), ar = hasArabic(name);
  const brand = p.brand && p.brand !== STORE_NAME ? p.brand : "";
  const noun = cat?.en ?? titleCase(p.category).toLowerCase(), pl = cat?.enPl ?? noun;
  const en = ar ? [] : [
    brand && `${brand} ${pl}`, brand && `buy ${brand} ${noun} online uae`, brand && `${brand} ${pl} dubai`, brand && `${brand} uae`,
    `${ellipsisFree(name, 50)} uae`, `buy ${pl} online uae`, `${pl} dubai`, `${pl} abu dhabi`, `${pl} sharjah`, `cash on delivery ${pl} uae`, `${noun} gift uae`,
    ...p.colors.slice(0, 2).map((c) => (hasArabic(c) ? "" : `${c.toLowerCase()} ${noun} uae`)),
    ...(cat?.extra ?? []).slice(0, 2).map((e) => `${e} uae`),
  ];
  const arKw = cat ? [`${cat.arPl} في الإمارات`, `شراء ${cat.arPl} اونلاين`, `${cat.ar} دبي`, `${cat.arPl} الدفع عند الاستلام`, ...cat.extraAr.slice(0, 1)] : [];
  const arName = ar ? [`${ellipsisFree(name, 45)} الإمارات`, `${ellipsisFree(name, 45)} دبي`, `شراء ${ellipsisFree(name, 40)}`, brand && `${brand} ${pl} uae`, `${pl} online uae`, `${pl} dubai`, "cash on delivery uae"] : [];
  return kwClean([...en, ...arName, ...arKw, ...p.tags.slice(0, 3)], 16);
}

async function products(report: Report) {
  const col = mongoose.connection.db!.collection("products");
  const shape = shapeOf("Product");
  const hasAr = !!mongoose.models.Product?.schema.path("seoAr.title");
  const ops: any[] = [];
  let seen = 0, changed = 0;
  for await (const p of col.find({ status: { $ne: "archived" }, mergedInto: null } as any)) {
    if (match && !new RegExp(match, "i").test(String(p.name ?? ""))) continue;
    if (limit && seen >= limit) break;
    seen++;
    const name = plainName(p.name ?? "");
    if (!name) continue;
    const brand = resolveBrand(p.brand, name);
    const colors = [...new Set((p.variants ?? []).map((v: any) => v.color).filter(Boolean))] as string[];
    const copy = productCopy({ sku: p.sku, name, brand, category: p.category, colors });
    const kw = productKeywords({ name, brand, category: p.category, colors, tags: (p.tags ?? []).map(String) });
    const set: Record<string, unknown> = {};
    fill(p, set, shape, "en", { title: copy.seoTitle, description: copy.seoDescription, keywords: kw });
    // Arabic page: use the Arabic name when the product has one.
    if (hasAr && p.nameAr && !hasArabic(name)) {
      const a = productCopy({ sku: p.sku, name: String(p.nameAr), brand, category: p.category });
      for (const [f, v] of [["title", a.seoTitle], ["description", a.seoDescription]] as const) if (overwrite || isEmpty(p.seoAr?.[f])) set[`seoAr.${f}`] = v;
    }
    if (Object.keys(set).length) { changed++; set.updatedAt = new Date(); ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: set } } }); if (report.samples.length < nSamples) report.samples.push({ name, set }); }
  }
  report.add("products", seen, changed);
  return { col, ops };
}

// ---- categories (collections) + brands --------------------------------------------------------------------------------------
async function categories(report: Report) {
  const db = mongoose.connection.db!, col = db.collection("collections"), pcol = db.collection("products");
  const shape = shapeOf("Collection");
  const ops: any[] = [];
  const live = { status: "active", mergedInto: null } as any;
  let seen = 0;
  for await (const c of col.find()) {
    seen++;
    const parent = String(c.parent ?? c.slug ?? "").replace(/^all-/, "");
    if (JUNK_CATEGORIES.has(parent)) continue; // leftover import categories: not worth a search result
    const cat = catOf(parent);
    const isCat = c.type === "category" || !c.type;
    const label = isCat ? SEO_LABEL[parent] ?? titleCase(parent || c.name) : String(c.name);
    let g: Gen;
    if (isCat) {
      const rows = await pcol.aggregate([{ $match: { ...live, category: parent, brand: { $nin: [null, ""] } } }, { $group: { _id: "$brand", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 4 }]).toArray();
      const total = await pcol.countDocuments({ ...live, category: parent });
      const cc = categoryCopy(label, rows.map((r) => String(r._id)), total);
      const top = rows.map((r) => String(r._id)).filter((b) => b !== STORE_NAME).slice(0, 3);
      const from = top.length ? ` from ${top.slice(0, -1).join(", ")}${top.length > 1 ? " & " : ""}${top[top.length - 1]}` : "";
      const lead = `Shop ${total > 20 ? `${Math.floor(total / 10) * 10}+ ` : ""}${label.toLowerCase()}${from} online in the UAE.`;
      g = { title: cc.title, description: withTail(lead, [TAIL_EN, "Fast UAE delivery, cash on delivery."]), keywords: kwClean([
        `buy ${label} online uae`, `${label} dubai`, `${label} abu dhabi`, `${label} sharjah`, `${label} ajman`, `best ${label} in uae`, `${label} cash on delivery uae`, `${label} uae`,
        ...rows.slice(0, 3).map((r) => `${r._id} ${label} uae`), ...(cat?.extra ?? []).slice(0, 3).map((e) => `${e} uae`),
        cat && `${cat.arPl} في الإمارات`, cat && `شراء ${cat.arPl} اونلاين`, cat && `${cat.arPl} دبي`, ...(cat?.extraAr ?? []).slice(0, 2),
      ], 16) };
    } else {
      g = { title: titleFit(`${label} Online in UAE`, [` | ${STORE_NAME}`]), description: descFit(`Shop ${label} online in the UAE at ${STORE_NAME}. ${TAIL_EN}`), keywords: kwClean([`${label} uae`, `buy ${label} online uae`, `${label} dubai`, `${label} cash on delivery`, `${label} abu dhabi`]) };
    }
    const set: Record<string, unknown> = {};
    fill(c, set, shape, "en", g);
    if (isCat && g.description && (overwrite || isEmpty(c.description))) set.description = `Shop ${label.toLowerCase()} at ${STORE_NAME}, with fast delivery across the UAE, cash on delivery and easy returns.`;
    if (Object.keys(set).length) { ops.push({ updateOne: { filter: { _id: c._id }, update: { $set: set } } }); if (report.samples.length < 6) report.samples.push({ category: label, set }); }
  }
  report.add("categories", seen, ops.length);
  return { col, ops };
}

async function brands(report: Report) {
  const db = mongoose.connection.db!, col = db.collection("brands"), pcol = db.collection("products");
  const shape = shapeOf("Brand");
  if (!(await col.estimatedDocumentCount())) return { col, ops: [] as any[] };
  const ops: any[] = [];
  let seen = 0;
  for await (const b of col.find()) {
    seen++;
    const name = String(b.name);
    const rx = new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
    const top = await pcol.aggregate([{ $match: { status: "active", mergedInto: null, brand: rx } }, { $group: { _id: "$category", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 2 }]).toArray();
    const cats = top.map((t) => catOf(t._id)).filter(Boolean) as Cat[];
    const pl = cats[0]?.enPl ?? "products";
    const title = titleFit(`${name} ${titleCase(pl)} in Dubai & UAE`, [` | ${STORE_NAME}`, ""]);
    const g: Gen = {
      title,
      description: descFit(`Shop ${name} ${pl} online in the UAE. ${TAIL_EN}`),
      keywords: kwClean([`${name} uae`, `${name} dubai`, `buy ${name} online uae`, `${name} ${pl} uae`, `${name} ${pl} dubai`, `${name} abu dhabi`, `${name} cash on delivery uae`, cats[0] && `${cats[0].arPl} ${name}`, cats[0] && `${cats[0].arPl} ${name} الإمارات`]),
    };
    const set: Record<string, unknown> = {};
    fill(b, set, shape, "en", g);
    if (Object.keys(set).length) ops.push({ updateOne: { filter: { _id: b._id }, update: { $set: set } } });
  }
  report.add("brands", seen, ops.length);
  return { col, ops };
}

// ---- articles, info pages, homepage ----------------------------------------------------------------------------------------
const firstSentences = (text: string, max = 150) => clip(String(text ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), max);
const val = (v: any, lang: "en" | "ar") => (v && typeof v === "object" ? String(v[lang] ?? "") : lang === "en" ? String(v ?? "") : "");

async function articles(report: Report) {
  const col = mongoose.connection.db!.collection("articles");
  await tryImport("../src/models/article", "../lib/models/Article");
  const shapeM = shapeOf("Article");
  const ops: any[] = [];
  let seen = 0;
  for await (const a of col.find()) {
    seen++;
    const shape = shapeM.title === "none" ? shapeFromDoc(a) : shapeM;
    const set: Record<string, unknown> = {};
    for (const lang of ["en", "ar"] as const) {
      const title = val(a.title, lang);
      if (!title) continue;
      const cat = val(a.category, lang) || (lang === "en" ? "Guides" : "");
      const excerpt = val(a.excerpt, lang) || firstSentences(val(a.body, lang));
      const g: Gen = lang === "en"
        ? { title: titleFit(title, [` | ${STORE_NAME}`, ""]), description: withTail(excerpt, [TAIL_EN, "Fast UAE delivery, cash on delivery."]), keywords: kwClean([`${cat} uae`, `${title}`.slice(0, 55), "shopping guide uae", "dubai shopping tips", "online shopping uae", `${cat} dubai`]) }
        : { title: titleFit(title, [` | ${STORE_NAME}`, ""]), description: withTail(excerpt, [`توصيل سريع في ${ALL_CITIES_AR} والدفع عند الاستلام.`, "توصيل سريع والدفع عند الاستلام."]), keywords: kwClean([`${title}`.slice(0, 55), "تسوق اونلاين الإمارات", "نصائح التسوق في دبي", `${cat} الإمارات`]) };
      fill(a, set, shape, lang, g);
    }
    if (Object.keys(set).length) { ops.push({ updateOne: { filter: { _id: a._id }, update: { $set: set } } }); if (report.samples.length < 8) report.samples.push({ article: val(a.title, "en") || a.slug, set }); }
  }
  report.add("articles", seen, ops.length);
  return { col, ops };
}

const PAGE_COPY: Record<string, { en: [string, string, string[]]; ar: [string, string, string[]] }> = {
  about: { en: ["About Us", `${STORE_NAME} is a UAE online store: fast delivery across Dubai, Abu Dhabi & Sharjah, cash on delivery and easy returns.`, ["about us uae", "online store dubai"]], ar: ["من نحن", `${STORE_NAME} متجر إلكتروني في الإمارات: توصيل سريع إلى ${ALL_CITIES_AR}، الدفع عند الاستلام وإرجاع سهل.`, ["من نحن", "متجر اونلاين الإمارات"]] },
  contact: { en: ["Contact Us", `Contact ${STORE_NAME} on WhatsApp, email or phone. We reply fast to customers in Dubai, Abu Dhabi, Sharjah and across the UAE.`, ["contact store uae", "whatsapp support dubai"]], ar: ["اتصل بنا", `تواصل مع ${STORE_NAME} عبر واتساب أو البريد أو الهاتف. نرد بسرعة على عملائنا في دبي وأبوظبي والشارقة وجميع الإمارات.`, ["اتصل بنا", "خدمة العملاء الإمارات"]] },
  faq: { en: ["FAQ", `Answers about ordering, delivery across the UAE, cash on delivery, payment and returns at ${STORE_NAME}.`, ["faq online store uae", "cash on delivery uae questions"]], ar: ["الأسئلة الشائعة", `إجابات عن الطلب والتوصيل داخل الإمارات والدفع عند الاستلام والإرجاع في ${STORE_NAME}.`, ["الأسئلة الشائعة", "الدفع عند الاستلام الإمارات"]] },
  shipping: { en: ["Delivery & Shipping in the UAE", `Delivery to Dubai, Abu Dhabi, Sharjah, Ajman, Ras Al Khaimah, Fujairah, Umm Al Quwain and Al Ain. Cash on delivery available.`, ["delivery uae", "shipping dubai", "cash on delivery uae"]], ar: ["التوصيل والشحن في الإمارات", `توصيل إلى دبي وأبوظبي والشارقة وعجمان ورأس الخيمة والفجيرة وأم القيوين والعين. الدفع عند الاستلام متاح.`, ["التوصيل في الإمارات", "الشحن دبي", "الدفع عند الاستلام"]] },
  returns: { en: ["Returns & Exchanges", `Easy returns and exchanges for orders delivered in the UAE. Read how to return or exchange an item from ${STORE_NAME}.`, ["returns policy uae", "exchange policy dubai"]], ar: ["الإرجاع والاستبدال", `إرجاع واستبدال سهل للطلبات المسلّمة داخل الإمارات. تعرف على طريقة الإرجاع من ${STORE_NAME}.`, ["سياسة الإرجاع الإمارات", "استبدال المنتجات"]] },
  privacy: { en: ["Privacy Policy", `How ${STORE_NAME} collects and protects your personal data when you shop online in the UAE.`, ["privacy policy uae"]], ar: ["سياسة الخصوصية", `كيف تجمع ${STORE_NAME} بياناتك الشخصية وتحميها عند التسوق أونلاين في الإمارات.`, ["سياسة الخصوصية"]] },
  terms: { en: ["Terms & Conditions", `Terms of use and sale for shopping at ${STORE_NAME} in the United Arab Emirates.`, ["terms and conditions uae"]], ar: ["الشروط والأحكام", `شروط الاستخدام والبيع عند التسوق من ${STORE_NAME} في دولة الإمارات العربية المتحدة.`, ["الشروط والأحكام"]] },
};
async function pages(report: Report) {
  const col = mongoose.connection.db!.collection("contentpages");
  await tryImport("../src/models/content-page", "../lib/models/ContentPage");
  const shapeM = shapeOf("ContentPage");
  const ops: any[] = [];
  let seen = 0;
  for await (const p of col.find()) {
    seen++;
    const shape = shapeM.title === "none" ? shapeFromDoc(p) : shapeM;
    const slug = String(p.slug).replace(/-/g, "");
    const tpl = PAGE_COPY[String(p.slug)] ?? PAGE_COPY[slug.replace(/policy|and.*/g, "")] ?? PAGE_COPY[Object.keys(PAGE_COPY).find((k) => String(p.slug).includes(k)) ?? ""];
    const set: Record<string, unknown> = {};
    for (const lang of ["en", "ar"] as const) {
      const title = val(p.title, lang);
      const t = tpl?.[lang];
      if (!t && !title) continue;
      const kw = (t?.[2] ?? []).concat(lang === "en" ? ["uae", "dubai"] : ["الإمارات", "دبي"]);
      fill(p, set, shape, lang, { title: titleFit(t?.[0] ?? title, [` | ${STORE_NAME}`, ""]), description: descFit(t?.[1] ?? (lang === "en" ? `${title} at ${STORE_NAME}. ${TAIL_EN}` : `${title} لدى ${STORE_NAME}.`)), keywords: kwClean(kw) });
    }
    if (Object.keys(set).length) ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: set } } });
  }
  report.add("pages", seen, ops.length);
  return { col, ops };
}

async function home(report: Report) {
  const db = mongoose.connection.db!, col = db.collection("homeconfigs");
  await tryImport("../src/models/homepage", "../lib/models/Homepage", "../lib/home-config");
  const docs = await col.find().toArray();
  const colAlt = docs.length ? col : db.collection("homepages");
  const target = docs.length ? docs : await colAlt.find().toArray();
  const modelName = Object.keys(mongoose.models).find((m) => /^home/i.test(m)) ?? "";
  const rows = await db.collection("products").aggregate([{ $match: { status: "active", mergedInto: null } }, { $group: { _id: "$category", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 6 }]).toArray();
  const cats = rows.map((r) => ({ slug: String(r._id), cat: catOf(r._id) })).filter((r) => r.cat && r.slug !== "general").slice(0, 3);
  const en = cats.map((c) => titleCase(c.cat!.enPl)), ar = cats.map((c) => c.cat!.arPl);
  const list = (a: string[], and: string) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} ${and} ${a[a.length - 1]}` : a[0] ?? "Products");
  const ops: any[] = [];
  for (const d of target) {
    const set: Record<string, unknown> = {};
    let shape = modelName ? shapeOf(modelName) : shapeFromDoc(d);
    if (shape.title === "none") shape = shapeFromDoc(d); // schema stores seo as free-form (Mixed): read the shape from the saved document
    fill(d, set, shape, "en", {
      title: titleFit(`Buy ${list(en, "&")} Online in UAE`, [` | ${STORE_NAME}`, ""]),
      description: descFit(`Shop ${list(en.map((x) => x.toLowerCase()), "&")} online in the UAE. ${TAIL_EN}`),
      keywords: kwClean([`online shopping uae`, `buy online dubai`, ...CITIES.map((c) => `online store ${c.toLowerCase()}`), "cash on delivery uae", ...cats.flatMap((c) => [`${c.cat!.enPl} uae`, `${c.cat!.enPl} dubai`]), ...ar.map((a) => `${a} في الإمارات`), "تسوق اونلاين الإمارات", "الدفع عند الاستلام"], 18),
    });
    if (shape.title === "i18n") fill(d, set, shape, "ar", {
      title: titleFit(`تسوق ${list(ar, "و")} أونلاين في الإمارات`, [` | ${STORE_NAME}`, ""]),
      description: descFit(`تسوق ${list(ar, "و")} أونلاين في الإمارات. توصيل سريع إلى ${ALL_CITIES_AR}، الدفع عند الاستلام وإرجاع سهل.`),
      keywords: kwClean([`تسوق اونلاين الإمارات`, ...ar.map((a) => `${a} في الإمارات`), ...ar.map((a) => `شراء ${a} دبي`), "الدفع عند الاستلام"], 14),
    });
    if (Object.keys(set).length) { ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: set } } }); report.samples.push({ home: true, set }); }
  }
  report.add("home", target.length, ops.length);
  return { col: colAlt, ops };
}

// ---- run --------------------------------------------------------------------------------------------------------------------
class Report {
  rows: [string, number, number][] = [];
  samples: any[] = [];
  add(part: string, seen: number, changed: number) { this.rows.push([part, seen, changed]); }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI must be set");
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });
  const db = mongoose.connection.db!;
  console.log(`models: ${REGISTERED.join(", ")}`);
  console.log(`${apply ? "APPLY" : "DRY RUN"}${overwrite ? " + OVERWRITE" : " (empty fields only)"} on database "${db.databaseName}" as "${STORE_NAME}"`);
  const report = new Report();
  const jobs: { col: any; ops: any[] }[] = [];
  if (want("products")) jobs.push(await products(report));
  if (want("categories")) jobs.push(await categories(report));
  if (want("brands")) jobs.push(await brands(report));
  if (want("articles")) jobs.push(await articles(report));
  if (want("pages")) jobs.push(await pages(report));
  if (want("home")) jobs.push(await home(report));

  console.table(report.rows.map(([part, seen, changed]) => ({ part, checked: seen, "will update": changed })));
  console.log("samples:\n" + JSON.stringify(report.samples.slice(0, Math.max(4, nSamples)), null, 1));

  if (!apply) { console.log("\nDry run: nothing written. Re-run with --apply."); return; }
  const dir = path.join(process.cwd(), "backups");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let written = 0;
  for (const j of jobs) {
    if (!j.ops.length) continue;
    await writeFile(path.join(dir, `seo-uae-${j.col.collectionName}-${stamp}.json`), JSON.stringify(await j.col.find({ _id: { $in: j.ops.map((o) => o.updateOne.filter._id) } }).toArray()));
    for (let i = 0; i < j.ops.length; i += 500) await j.col.bulkWrite(j.ops.slice(i, i + 500), { ordered: false });
    written += j.ops.length;
  }
  console.log(`\nDone: ${written} document(s) updated. Backup of the previous values: ${dir}${path.sep}seo-uae-*-${stamp}.json. Restart the site (or wait ~5 minutes) so cached pages refresh.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
