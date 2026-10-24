// Replaces the placeholder journal articles (smartphones, kitchens, deals) with original Rayana Collection content (EN + AR).
//
//   npm run seed-journal            dry run: shows what would change, writes nothing
//   npm run seed-journal -- --apply writes the articles and unpublishes the old placeholders (they become drafts, nothing is deleted)
//
// Covers are real product photos from the catalogue. Articles are normal documents: edit or remove them later in Admin -> Articles.
import mongoose from "mongoose";
import { Article } from "../src/models/article";

const apply = process.argv.includes("--apply");
const AUTHOR = "Rayana Collection";
const OLD_SLUGS = ["spot-a-genuine-deal", "small-kitchen-upgrades", "choosing-your-next-smartphone"];
// Each article's cover is the first photo of a real product from the catalogue (looked up when the script runs, so links never go stale).
const COVER_QUERY: Record<string, { category: string; name?: RegExp }> = {
  "make-your-perfume-last-in-uae-heat": { category: "perfume" },
  "jewelry-care-keep-your-pieces-shining": { category: "jewelry" },
  "how-to-choose-a-handbag-for-every-occasion": { category: "bags", name: /tote|handbag|shoulder|crossbody|clutch/i },
  "gift-ideas-for-every-occasion": { category: "watches" },
};
async function coverFor(slug: string) {
  const q = COVER_QUERY[slug];
  const p = await mongoose.connection.db!.collection("products").find(
    { status: "active", mergedInto: null, category: q.category, ...(q.name && { name: q.name }), "images.0.url": /^https:\/\// },
    { projection: { name: 1, images: { $slice: 1 } } },
  ).sort({ isFeatured: -1, ratingCount: -1 }).limit(1).next();
  return p ? { cover: p.images[0].url as string, alt: p.name as string } : null;
}
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

const ARTICLES = [
  {
    slug: "make-your-perfume-last-in-uae-heat", icon: "🧴", hue: 320, category: "Perfume", publishAt: daysAgo(2),
    title: { en: "How to make your perfume last in the UAE heat", ar: "كيف يدوم عطرك أطول في حرارة الإمارات" },
    excerpt: { en: "Where to spray, how to store it and which notes hold up when the temperature climbs.", ar: "أين ترشّين العطر، وكيف تحفظينه، وأي النوتات تثبت مع ارتفاع الحرارة." },
    body: {
      en: `Heat makes fragrance bloom fast and fade fast. A few small habits keep it with you from morning to night.

Spray on moisturised skin. Dry skin drinks perfume; a light, unscented lotion first gives it something to hold on to.

Choose pulse points, not clothes. Wrists, the base of the throat and behind the ears are warm enough to release the scent slowly. Do not rub your wrists together, it breaks the top notes down.

Pick the right family. Woody, amber, musk and oud notes are heavier and stay put in the heat. Fresh citrus and aquatic notes are lovely but lift off quickly, so save them for evenings or air-conditioned days.

Store it well. A bottle left in a hot car or on a sunny shelf loses its balance within weeks. Keep it in its box, in a cool drawer, away from light.

Carry a travel atomiser for a midday top-up and you will never smell like you have run out.`,
      ar: `الحرارة تجعل العطر يفوح بسرعة ويخفّ بسرعة. لكن بعض العادات الصغيرة تبقيه معك من الصباح حتى المساء.

رشّي العطر على بشرة مرطّبة. البشرة الجافة تمتص العطر بسرعة، أما كريم خفيف عديم الرائحة قبل الرش فيمنحه ما يتشبّث به.

اختاري نقاط النبض لا الملابس. الرسغان وأسفل الرقبة وخلف الأذنين دافئة بما يكفي لتُطلق الرائحة ببطء. لا تفركي الرسغين ببعضهما، فذلك يُفسد النوتات العليا.

اختاري العائلة العطرية المناسبة. نوتات الخشب والعنبر والمسك والعود أثقل وتثبت في الحر، أما نوتات الحمضيات والنوتات المائية فمنعشة لكنها تتبخر سريعاً، فاحتفظي بها للأمسيات أو الأيام المكيّفة.

احفظيه جيداً. الزجاجة المتروكة في سيارة حارّة أو على رفّ مشمس يختلّ توازنها خلال أسابيع. أبقيها في علبتها داخل درج بارد بعيداً عن الضوء.

وخذي معك بخّاخاً صغيراً للسفر لتجديد الرائحة في منتصف اليوم.`,
    },
  },
  {
    slug: "jewelry-care-keep-your-pieces-shining", icon: "💍", hue: 38, category: "Jewelry", publishAt: daysAgo(6),
    title: { en: "Jewelry care: keep your pieces shining", ar: "العناية بالمجوهرات: حافظي على لمعانها" },
    excerpt: { en: "Five simple rules that stop tarnish, tangles and scratches before they start.", ar: "خمس قواعد بسيطة تمنع التغيّر والتشابك والخدوش قبل أن تبدأ." },
    body: {
      en: `Good jewelry lasts when it is treated gently. These habits take a minute and add years.

Put it on last, take it off first. Perfume, hairspray and lotion dull metal and stones, so dress, do your hair and spray first, then add your jewelry.

Keep it dry. Take pieces off before swimming, showering and the gym. Sweat and chlorine are the quickest way to dull a finish.

Store pieces separately. A soft pouch or a lined box stops chains tangling and stones scratching each other. Fasten necklaces before putting them away.

Wipe after wearing. A soft, dry cloth removes oils and keeps the shine. Avoid harsh cleaners and rough tissue.

Check the clasps. A quick look every few months saves you from losing a favourite piece.`,
      ar: `المجوهرات الجميلة تدوم حين نعتني بها بلطف. هذه العادات تستغرق دقيقة وتضيف إلى عمرها سنوات.

ارتديها أخيراً وانزعيها أولاً. العطر ومثبّت الشعر والكريمات تُطفئ بريق المعدن والأحجار، لذا البسي ملابسك وسرّحي شعرك وضعي عطرك أولاً، ثم أضيفي مجوهراتك.

أبعديها عن الماء. انزعي القطع قبل السباحة والاستحمام والرياضة. العرق والكلور أسرع ما يُذهب لمعان الطلاء.

احفظي كل قطعة على حدة. كيس ناعم أو علبة مبطّنة يمنع تشابك السلاسل وخدش الأحجار لبعضها. اقفلي القلادة قبل وضعها.

امسحيها بعد الاستخدام. قطعة قماش ناعمة وجافة تزيل الزيوت وتحافظ على اللمعان. تجنّبي المنظّفات القوية والمناديل الخشنة.

افحصي الأقفال. نظرة سريعة كل بضعة أشهر تحميك من فقدان قطعتك المفضلة.`,
    },
  },
  {
    slug: "how-to-choose-a-handbag-for-every-occasion", icon: "👜", hue: 345, category: "Bags", publishAt: daysAgo(10),
    title: { en: "How to choose a handbag for every occasion", ar: "كيف تختارين الحقيبة المناسبة لكل مناسبة" },
    excerpt: { en: "A simple way to build a small bag wardrobe for work, weekends and evenings.", ar: "طريقة بسيطة لبناء مجموعة حقائب صغيرة للعمل وعطلة الأسبوع والسهرات." },
    body: {
      en: `You do not need a bag for every outfit. Three well-chosen shapes cover almost everything.

The everyday bag. Mid-size, structured and in a neutral colour such as black, tan or cream. It should fit a phone, wallet, keys and a small makeup pouch without bulging.

The work bag. Look for a firm base, a zip or flap that closes securely and enough room for a tablet or a folder. Comfortable handles matter more than you think.

The evening bag. Small and eye-catching: a clutch, a mini crossbody or a chain strap. It only needs your phone, a lipstick and a card.

Before you buy, check the stitching, the hardware and the lining, and ask yourself how many outfits it works with. If the answer is more than five, it is worth it.`,
      ar: `لا تحتاجين حقيبة لكل إطلالة. ثلاثة أشكال مختارة جيداً تغطي كل شيء تقريباً.

حقيبة اليوم. متوسطة الحجم، بقالب ثابت ولون محايد كالأسود أو البني الفاتح أو الكريمي. يجب أن تتسع للهاتف والمحفظة والمفاتيح وحافظة مكياج صغيرة دون أن تنتفخ.

حقيبة العمل. ابحثي عن قاعدة صلبة وسحّاب أو غطاء يُغلق بإحكام ومساحة تكفي لجهاز لوحي أو ملف. والمقابض المريحة أهم مما تتصورين.

حقيبة السهرة. صغيرة وملفتة: كلتش أو كروس بودي صغيرة أو بسلسلة. تكفي للهاتف وأحمر الشفاه وبطاقة.

قبل الشراء افحصي الخياطة والإكسسوارات المعدنية والبطانة، واسألي نفسك: مع كم إطلالة تناسب هذه الحقيبة؟ إن كان الجواب أكثر من خمس فهي تستحق.`,
    },
  },
  {
    slug: "gift-ideas-for-every-occasion", icon: "🎁", hue: 12, category: "Gifts", publishAt: daysAgo(14),
    title: { en: "Gift ideas for every occasion", ar: "أفكار هدايا لكل مناسبة" },
    excerpt: { en: "From birthdays to Eid, a short guide to gifts that feel personal, for her and for him.", ar: "من أعياد الميلاد إلى العيد، دليل مختصر لهدايا تبدو شخصية، لها وله." },
    body: {
      en: `The best gift says "I noticed". Start with how the person lives, not with what is on sale.

For someone who loves to dress up: a fine bracelet or a pair of earrings is easy to wear every day and easy to remember you by.

For someone who loves scent: a perfume in a signature fragrance, or a travel-size set so they can try a few.

For someone who is always on the go: a watch that works with both work and weekend outfits, or a compact bag that holds the essentials.

For someone who has everything: choose something small and thoughtful, and present it beautifully. Presentation turns a nice gift into a memorable one.

Not sure of the size or taste? Pick classic designs in neutral tones, and keep the receipt details handy in case an exchange is needed.`,
      ar: `أجمل هدية هي التي تقول "لقد انتبهت لك". ابدأ بطريقة حياة الشخص لا بما هو معروض بسعر مخفّض.

لمن تحب التأنّق: سوار رقيق أو أقراط يسهل ارتداؤها كل يوم وتذكّر بك.

لمن يحب العطور: عطر برائحته المفضلة، أو طقم صغير للسفر ليجرّب منه أكثر من رائحة.

لمن هو دائم الحركة: ساعة تناسب العمل وعطلة الأسبوع، أو حقيبة صغيرة تحمل الأساسيات.

لمن لديه كل شيء: اختر شيئاً صغيراً ومدروساً وقدّمه بشكل أنيق. التغليف الجميل يحوّل الهدية اللطيفة إلى هدية لا تُنسى.

لست متأكداً من المقاس أو الذوق؟ اختر تصاميم كلاسيكية بألوان محايدة، واحتفظ ببيانات الفاتورة تحسباً لأي استبدال.`,
    },
  },
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI must be set (.env.local)");
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });
  console.log(`${mongoose.connection.name}: ${apply ? "APPLY" : "DRY RUN"}\n`);
  for (const slug of OLD_SLUGS) {
    const n = await Article.countDocuments({ slug });
    console.log(`  unpublish placeholder  ${slug.padEnd(44)} ${n ? "found" : "not present"}`);
    if (apply && n) await Article.updateOne({ slug }, { $set: { status: "draft" } });
  }
  for (const a of ARTICLES) {
    const c = await coverFor(a.slug);
    console.log(`  upsert                 ${a.slug.padEnd(44)} cover: ${c ? c.alt : "(no product found, emoji fallback)"}`);
    if (apply) await Article.updateOne({ slug: a.slug }, { $set: { ...a, author: AUTHOR, status: "published", cover: c?.cover, coverAlt: { en: c?.alt ?? a.title.en, ar: c?.alt ?? a.title.ar } } }, { upsert: true });
  }
  if (!apply) console.log("\nDry run only. Add --apply to write.");
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
