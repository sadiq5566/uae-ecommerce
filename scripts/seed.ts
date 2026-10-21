// Development-only seed. Usage: npm run seed   (add -- --reset to wipe catalogue collections first)
import mongoose from "mongoose";
import { Category } from "../src/models/category";
import { Product } from "../src/models/product";
import { User } from "../src/models/user";
import { Article } from "../src/models/article";
import { ContentPage, PAGE_SLUGS } from "../src/models/content-page";
import { Review } from "../src/models/review";
import { Coupon } from "../src/models/coupon";
import { DeliveryZone } from "../src/models/delivery-zone";
import { Settings } from "../src/models/settings";
import { hashPassword } from "../src/lib/auth/password";
import { categories, products } from "./seed-data";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "souq_uae_dev";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed: NODE_ENV=production");
  if (!uri) throw new Error("MONGODB_URI is not set");
  // if (!/(dev|local|test)/i.test(dbName)) throw new Error(`Refusing to seed database "${dbName}": name must contain dev, local or test`);
  await mongoose.connect(uri, { dbName });
  if (process.argv.includes("--reset")) {
    await Promise.all([Category.deleteMany({}), Product.deleteMany({}), User.deleteMany({ email: /@example\.test$/ }), DeliveryZone.deleteMany({}), Coupon.deleteMany({}), Article.deleteMany({}), ContentPage.deleteMany({}), Review.deleteMany({ demo: true })]);
    console.log("Reset catalogue collections in", dbName);
  }
  await Promise.all([Category.init(), Product.init(), User.init()]); // build indexes

  const bySlug = new Map<string, string>();
  let order = 0;
  for (const c of categories) {
    const parent = "parent" in c && c.parent ? bySlug.get(c.parent) : null;
    const doc = await Category.findOneAndUpdate({ slug: c.slug }, { ...c, parent, order: order++, active: true }, { upsert: true, returnDocument: "after" });
    bySlug.set(c.slug, String(doc._id));
  }
  let n = 0;
  for (const p of products) {
    const sku = `DEMO-${p.slug.split("-").map((w) => w[0]).join("").toUpperCase()}-${String(++n).padStart(3, "0")}`;
    const doc = await Product.findOne({ slug: p.slug }) ?? new Product({ slug: p.slug });
    doc.set({
      sku, name: p.name, description: p.desc, category: bySlug.get(p.cat), brand: p.brand, price: p.price, salePrice: p.sale,
      stock: p.variants ? p.variants.reduce((a, v) => a + v.stock, 0) : p.stock, attrs: p.attrs ?? {}, icon: p.icon, hue: p.hue,
      featured: !!p.featured, status: "published", soldCount: p.sold ?? 0, viewCount: p.views ?? 0, ratingAvg: 0, ratingCount: 0, // ratings are derived from approved reviews only
      tags: [p.brand.toLowerCase(), p.cat],
      variants: (p.variants ?? []).map((v, i) => ({ sku: `${sku}-V${i + 1}`, label: v.label, stock: v.stock, price: v.price ?? p.sale ?? p.price })),
      specs: (p.spec ?? []).map(([label, value]) => ({ label, value })),
    });
    await doc.save();
  }
  // Demo staff + customer accounts (development only; password is public in this repo — never use in production).
  const demoPassword = "Demo-Pass-2026!";
  const hash = await hashPassword(demoPassword);
  for (const [email, name, role] of [
    ["owner@example.test", "Demo Owner", "owner"], ["catalog@example.test", "Demo Catalogue Manager", "catalog_manager"],
    ["ops@example.test", "Demo Operations", "operations_manager"], ["content@example.test", "Demo Content Editor", "content_editor"],
    ["customer@example.test", "Demo Customer", "customer"],
  ] as const) {
    await User.updateOne({ email }, { $setOnInsert: { email, name, role, passwordHash: hash } }, { upsert: true });
  }
  // Delivery zones, store settings and demo coupons.
  const zones = [
    { key: "metro", name: { en: "Dubai, Sharjah & Ajman", ar: "دبي والشارقة وعجمان" }, emirates: ["dubai", "sharjah", "ajman"], fee: 15, estimate: { en: "1–2 business days", ar: "1–2 أيام عمل" } },
    { key: "abu-dhabi", name: { en: "Abu Dhabi", ar: "أبوظبي" }, emirates: ["abu-dhabi"], fee: 20, estimate: { en: "2–3 business days", ar: "2–3 أيام عمل" } },
    { key: "northern", name: { en: "Northern Emirates", ar: "الإمارات الشمالية" }, emirates: ["ras-al-khaimah", "umm-al-quwain", "fujairah"], fee: 25, freeThreshold: 300, estimate: { en: "3–5 business days", ar: "3–5 أيام عمل" } },
  ];
  for (const z of zones) await DeliveryZone.updateOne({ key: z.key }, { $set: { ...z, active: true } }, { upsert: true });
  await Settings.updateOne({ key: "store" }, { $setOnInsert: { key: "store" } }, { upsert: true });
  const coupons = [
    { code: "WELCOME10", type: "percent" as const, value: 10, maxDiscount: 50, minSubtotal: 100, perCustomerLimit: 1, description: { en: "10% off (max AED 50) on full-price items over AED 100", ar: "خصم 10% (حتى 50 درهم) على المنتجات بسعرها الكامل فوق 100 درهم" } },
    { code: "SAVE25", type: "fixed" as const, value: 25, minSubtotal: 150, perCustomerLimit: 3, usageLimit: 100, stackWithSale: true, description: { en: "AED 25 off orders over AED 150 (works on sale items)", ar: "خصم 25 درهم على الطلبات فوق 150 درهم (يشمل المنتجات المخفضة)" } },
    { code: "EXPIRED5", type: "percent" as const, value: 5, endsAt: new Date("2024-01-01"), description: { en: "Expired demo coupon", ar: "قسيمة تجريبية منتهية" } },
  ];
  for (const c of coupons) await Coupon.updateOne({ code: c.code }, { $set: { ...c, active: true } }, { upsert: true });

  // Editable content pages: clearly-marked placeholders (the merchant must supply real, reviewed policy text).
  const note = {
    en: "PLACEHOLDER — this page has not been written yet. The store owner must provide the real text in Admin → Pages.",
    ar: "نص مؤقت — لم تتم كتابة هذه الصفحة بعد. يجب على مالك المتجر إضافة النص الفعلي من لوحة الإدارة ← الصفحات.",
  };
  const titles: Record<string, { en: string; ar: string }> = { about: { en: "About us", ar: "من نحن" }, contact: { en: "Contact us", ar: "اتصل بنا" }, faq: { en: "FAQ", ar: "الأسئلة الشائعة" }, delivery: { en: "Delivery information", ar: "معلومات التوصيل" }, returns: { en: "Returns & refunds", ar: "الإرجاع والاسترداد" }, privacy: { en: "Privacy policy", ar: "سياسة الخصوصية" }, terms: { en: "Terms & conditions", ar: "الشروط والأحكام" }, help: { en: "Payment & help", ar: "الدفع والمساعدة" } };
  for (const slug of PAGE_SLUGS) await ContentPage.updateOne({ slug }, { $setOnInsert: { slug, title: titles[slug], body: note, published: true } }, { upsert: true });
  await Settings.updateOne({ key: "store" }, { $set: { supportEmail: "support@example.test", supportPhone: "+971 4 000 0000" } });

  // Demo articles (placeholders).
  const arts = [
    { slug: "spot-a-genuine-deal", icon: "🛍️", hue: 160, category: "Guides", author: "Demo Editor", title: { en: "How to spot a genuine deal this season", ar: "كيف تميّز العرض الحقيقي هذا الموسم" }, excerpt: { en: "Compare prices, check the fine print and know when a discount is really a discount.", ar: "قارن الأسعار وراجع التفاصيل واعرف متى يكون الخصم حقيقياً." }, body: { en: "Sample article (demo content).\n\n## Compare before you buy\n\nLook at the price history and compare across stores.\n\n- Check the original price\n- Read the delivery terms\n- Look at return conditions", ar: "مقال تجريبي (محتوى تجريبي).\n\n## قارن قبل أن تشتري\n\nانظر إلى تاريخ السعر وقارن بين المتاجر.\n\n- تحقق من السعر الأصلي\n- اقرأ شروط التوصيل\n- راجع شروط الإرجاع" } },
    { slug: "small-kitchen-upgrades", icon: "🏠", hue: 35, category: "Home", author: "Demo Editor", title: { en: "5 kitchen upgrades for small apartments", ar: "5 ترقيات للمطبخ في الشقق الصغيرة" }, excerpt: { en: "Smart, space-saving ideas for compact kitchens.", ar: "أفكار ذكية توفر المساحة للمطابخ الصغيرة." }, body: { en: "Sample article (demo content).\n\nUse vertical space and multi-purpose tools.", ar: "مقال تجريبي (محتوى تجريبي).\n\nاستفد من المساحة العمودية والأدوات متعددة الاستخدامات." } },
    { slug: "choosing-your-next-smartphone", icon: "📱", hue: 260, category: "Tech", author: "Demo Editor", title: { en: "Choosing your next smartphone", ar: "كيف تختار هاتفك القادم" }, excerpt: { en: "What matters: battery, camera, storage and updates.", ar: "ما الذي يهم: البطارية والكاميرا والتخزين والتحديثات." }, body: { en: "Sample article (demo content).\n\nStart with how you use your phone every day.", ar: "مقال تجريبي (محتوى تجريبي).\n\nابدأ بالطريقة التي تستخدم بها هاتفك يومياً." } },
  ];
  for (const a of arts) await Article.updateOne({ slug: a.slug }, { $set: { ...a, status: "published", publishAt: new Date(Date.now() - 3600_000) } }, { upsert: true });

  // Demo reviews (development only, flagged demo:true) → ratings are recalculated from them.
  const reviewers = [] as { id: string; name: string }[];
  for (const n of ["Layla K.", "Omar S.", "Mariam A.", "Yusuf H."]) {
    const email = `reviewer-${n.split(" ")[0].toLowerCase()}@example.test`;
    await User.updateOne({ email }, { $setOnInsert: { email, name: n, role: "customer", passwordHash: hash } }, { upsert: true });
    reviewers.push({ id: String((await User.findOne({ email }))!._id), name: n });
  }
  const sample = [[5, "Excellent quality", "Arrived quickly and works exactly as described. (demo review)"], [4, "Very good", "Good value for the price, packaging could be better. (demo review)"], [5, "Love it", "Better than expected, would buy again. (demo review)"], [3, "It is fine", "Does the job but nothing special. (demo review)"]] as const;
  const reviewedSlugs = ["aurora-wireless-headphones", "nova-x-smartphone", "palm-medjool-dates-1kg", "chef-nonstick-cookware-10", "oud-royale-edp-100"];
  for (const slug of reviewedSlugs) {
    const prod = await Product.findOne({ slug });
    if (!prod) continue;
    for (let i = 0; i < reviewers.length; i++) {
      const [rating, title, body] = sample[(i + slug.length) % sample.length];
      await Review.updateOne({ product: prod._id, user: reviewers[i].id }, { $setOnInsert: { product: prod._id, user: reviewers[i].id, rating, title, body, authorName: reviewers[i].name, verified: false, status: "approved", demo: true } }, { upsert: true });
    }
    const all = await Review.find({ product: prod._id, status: "approved" });
    await Product.updateOne({ _id: prod._id }, { ratingAvg: Math.round((all.reduce((a, r) => a + r.rating, 0) / all.length) * 10) / 10, ratingCount: all.length });
  }

  console.log(`Demo users (password "${demoPassword}"): owner@, catalog@, ops@, content@, customer@example.test`);
  console.log(`Seeded ${categories.length} categories and ${products.length} products into "${dbName}".`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
