// Replaces the PLACEHOLDER store pages (About, Contact, FAQ, Delivery, Returns) with real Rayana Collection content (EN + AR).
// Every number below matches the live settings: delivery zones/fees, free-delivery thresholds, COD limit and the 7-day return window.
// Privacy, Terms and Help are NOT touched: legal text must be written or approved by the store owner.
//
//   npm run seed-pages            dry run: shows what would change, writes nothing
//   npm run seed-pages -- --apply writes the pages (published)
//
// Pages stay editable in Admin -> Pages. If you change a fee, window or limit in Settings, update the matching page too.
import mongoose from "mongoose";
import { ContentPage } from "../src/models/content-page";

const apply = process.argv.includes("--apply");
const WHATSAPP = "+971 58 985 7250";

const PAGES = [
  {
    slug: "about",
    title: { en: "About Rayana Collection", ar: "عن مجموعة ريانا" },
    body: {
      en: `Rayana Collection is a UAE online boutique for jewelry, perfume, watches and bags. We bring together pieces you will actually enjoy wearing, from everyday basics to something special for an occasion, and we deliver them across all seven Emirates.

## What we offer
- Jewelry: bracelets, necklaces, earrings and rings
- Perfume: signature scents and gift-ready bottles
- Watches: styles for work, weekends and evenings
- Bags: totes, shoulder bags, crossbody and evening bags

## How we work
- Every order is checked before it is dispatched.
- Your order arrives in gift-ready packaging.
- You can pay cash on delivery, so you only pay when your parcel is in your hands.
- If something is not right, you have 7 days after delivery to ask for an exchange or store credit.

## Shop with confidence
Prices are shown in UAE dirhams (AED). Delivery fees and estimated times are shown clearly before you pay, and you can follow your parcel any time from the Track order page.

Have a question or need help choosing a gift? Message us on WhatsApp at ${WHATSAPP}. We are happy to help.`,
      ar: `مجموعة ريانا متجر إلكتروني إماراتي للمجوهرات والعطور والساعات والحقائب. نجمع لك قطعاً تستمتع بارتدائها فعلاً، من الأساسيات اليومية إلى القطعة المميزة للمناسبات، ونوصلها إلى جميع الإمارات السبع.

## ماذا نقدّم
- المجوهرات: أساور وقلادات وأقراط وخواتم
- العطور: روائح مميزة وزجاجات جاهزة للإهداء
- الساعات: تصاميم للعمل وعطلة الأسبوع والسهرات
- الحقائب: حقائب يد وكتف وكروس بودي وحقائب سهرة

## كيف نعمل
- يتم فحص كل طلب قبل شحنه.
- يصلك طلبك في تغليف جاهز للإهداء.
- يمكنك الدفع عند الاستلام، فلا تدفع إلا حين تصبح الشحنة بين يديك.
- إن لم يكن الطلب كما توقعت، لديك 7 أيام بعد التسليم لطلب الاستبدال أو رصيد في المتجر.

## تسوّق بثقة
الأسعار بالدرهم الإماراتي. تظهر رسوم التوصيل ومدته المتوقعة بوضوح قبل الدفع، ويمكنك متابعة شحنتك في أي وقت من صفحة تتبّع الطلب.

لديك سؤال أو تحتاج مساعدة في اختيار هدية؟ راسلنا على واتساب ${WHATSAPP}. يسعدنا مساعدتك.`,
    },
  },
  {
    slug: "contact",
    title: { en: "Contact us", ar: "اتصل بنا" },
    body: {
      en: `We are here to help with orders, sizing, gift ideas and anything else you need.

## WhatsApp
Message us on ${WHATSAPP}. This is the fastest way to reach us. Please include your order number if your question is about an order.

## Before you write
- Track your parcel: use the Track order page with your order number.
- Delivery times and fees: see the Delivery information page.
- Returns and exchanges: see the Returns & exchanges page. You can also start a return yourself from your order page.
- Quick answers: see the FAQ.

## What to send us
- For a delivery question: your order number and the emirate you ordered to.
- For a damaged or wrong item: your order number and a clear photo of the item and the packaging.
- For sizing or gift advice: the product link and who it is for, and we will suggest the best option.`,
      ar: `نحن هنا لمساعدتك في الطلبات والمقاسات وأفكار الهدايا وأي شيء آخر.

## واتساب
راسلنا على ${WHATSAPP}. هذه أسرع طريقة للتواصل معنا. يرجى ذكر رقم الطلب إن كان سؤالك عن طلب.

## قبل أن تكتب لنا
- تتبّع شحنتك: استخدم صفحة تتبّع الطلب مع رقم طلبك.
- مدة التوصيل والرسوم: راجع صفحة معلومات التوصيل.
- الإرجاع والاستبدال: راجع صفحة الإرجاع والاستبدال. ويمكنك أيضاً بدء طلب الإرجاع بنفسك من صفحة طلبك.
- إجابات سريعة: راجع الأسئلة الشائعة.

## ما الذي نحتاجه منك
- لسؤال عن التوصيل: رقم الطلب والإمارة التي طلبت إليها.
- لمنتج تالف أو خاطئ: رقم الطلب وصورة واضحة للمنتج والتغليف.
- لنصيحة في المقاس أو الهدية: رابط المنتج ولمن هو، ونقترح لك الأنسب.`,
    },
  },
  {
    slug: "faq",
    title: { en: "Frequently asked questions", ar: "الأسئلة الشائعة" },
    body: {
      en: `## Do you deliver across the UAE?
Yes. We deliver to all seven Emirates: Abu Dhabi, Dubai, Sharjah, Ajman, Umm Al Quwain, Ras Al Khaimah and Fujairah.

## How much is delivery and how long does it take?
Dubai, Sharjah and Ajman: AED 15, usually 1-2 business days. Abu Dhabi: AED 20, usually 2-3 business days. Ras Al Khaimah, Umm Al Quwain and Fujairah: AED 25, usually 3-5 business days. Your exact fee is shown at checkout before you pay.

## Is delivery ever free?
Yes. Delivery is free on orders over AED 200. For Ras Al Khaimah, Umm Al Quwain and Fujairah, delivery is free on orders over AED 300.

## What is the minimum order?
The minimum order is AED 50.

## Can I pay cash on delivery?
Yes. Cash on delivery is available for orders up to AED 3,000, with no extra fee. Please keep the exact amount ready if you can.

## How do I track my order?
Open the Track order page and enter your order number. If you have an account, you can also see every order under My account.

## Can I return or exchange something?
Yes. You have 7 days from the day your order is delivered. You can choose store credit or, for items that come in different sizes or colours, an exchange. See the Returns & exchanges page for the steps.

## Does it cost anything to return or exchange?
Returns and exchanges are free from our side, with no return fee and no exchange fee. You only pay the rider's delivery charge, directly to the rider.

## How does store credit work?
When your return is complete, we give you a single-use code worth the value of the returned items. You enter it at checkout on your next order. It is valid for 90 days.

## What if my item arrives damaged or is not what I ordered?
Please message us on WhatsApp at ${WHATSAPP} with your order number and a photo, or start a return from your order page and choose the matching reason. We will put it right.

## Do you offer gift packaging?
Yes. Orders are packed in gift-ready packaging, so they are ready to give.

## How do I care for my jewelry and perfume?
Our journal has simple guides for both. Short version: put jewelry on last and keep it dry, and store perfume in a cool place away from sunlight.

## I have a discount code. Where do I enter it?
Enter it in the coupon box at checkout. Some offers also apply automatically when your basket qualifies, and the best available discount is applied to your order.

## How can I reach you?
Message us on WhatsApp at ${WHATSAPP}.`,
      ar: `## هل توصلون إلى جميع أنحاء الإمارات؟
نعم. نوصل إلى الإمارات السبع: أبوظبي ودبي والشارقة وعجمان وأم القيوين ورأس الخيمة والفجيرة.

## كم رسوم التوصيل وكم تستغرق؟
دبي والشارقة وعجمان: 15 درهماً، وعادةً خلال 1-2 يوم عمل. أبوظبي: 20 درهماً، وعادةً خلال 2-3 أيام عمل. رأس الخيمة وأم القيوين والفجيرة: 25 درهماً، وعادةً خلال 3-5 أيام عمل. تظهر لك الرسوم الدقيقة عند إتمام الطلب قبل الدفع.

## هل التوصيل مجاني أحياناً؟
نعم. التوصيل مجاني للطلبات التي تزيد عن 200 درهم. وبالنسبة لرأس الخيمة وأم القيوين والفجيرة، التوصيل مجاني للطلبات التي تزيد عن 300 درهم.

## ما الحد الأدنى للطلب؟
الحد الأدنى للطلب 50 درهماً.

## هل يمكنني الدفع عند الاستلام؟
نعم. الدفع عند الاستلام متاح للطلبات حتى 3,000 درهم، دون رسوم إضافية. يُفضّل تجهيز المبلغ المطلوب.

## كيف أتتبّع طلبي؟
افتح صفحة تتبّع الطلب وأدخل رقم طلبك. وإن كان لديك حساب يمكنك رؤية كل طلباتك من صفحة حسابي.

## هل يمكنني إرجاع منتج أو استبداله؟
نعم. لديك 7 أيام من يوم تسليم طلبك. يمكنك اختيار رصيد في المتجر، أو الاستبدال للمنتجات المتوفرة بمقاسات أو ألوان مختلفة. راجع صفحة الإرجاع والاستبدال لمعرفة الخطوات.

## هل هناك تكلفة للإرجاع أو الاستبدال؟
الإرجاع والاستبدال مجانيان من جهتنا، دون رسوم إرجاع أو رسوم استبدال. تدفع فقط أجرة توصيل المندوب مباشرة له.

## كيف يعمل رصيد المتجر؟
عند اكتمال الإرجاع نعطيك رمزاً للاستخدام مرة واحدة بقيمة المنتجات المرجعة. تدخله عند إتمام طلبك التالي، وهو صالح لمدة 90 يوماً.

## ماذا لو وصلني منتج تالف أو مختلف عمّا طلبت؟
راسلنا على واتساب ${WHATSAPP} مع رقم الطلب وصورة، أو ابدأ طلب إرجاع من صفحة طلبك واختر السبب المناسب. وسنعالج الأمر.

## هل تقدّمون تغليفاً للهدايا؟
نعم. تُجهَّز الطلبات في تغليف جاهز للإهداء.

## كيف أعتني بمجوهراتي وعطري؟
في مدونتنا أدلة بسيطة لكليهما. باختصار: ارتدِ المجوهرات أخيراً وأبقها جافة، واحفظ العطر في مكان بارد بعيداً عن الشمس.

## لدي رمز خصم، أين أدخله؟
أدخله في خانة القسيمة عند إتمام الطلب. وبعض العروض تُطبَّق تلقائياً عندما تستوفي سلتك الشروط، ويُطبَّق أفضل خصم متاح على طلبك.

## كيف أتواصل معكم؟
راسلنا على واتساب ${WHATSAPP}.`,
    },
  },
  {
    slug: "delivery",
    title: { en: "Delivery information", ar: "معلومات التوصيل" },
    body: {
      en: `We deliver to all seven Emirates. The fee and time depend on where you are.

## Delivery fees and times
- Dubai, Sharjah and Ajman: AED 15, usually 1-2 business days
- Abu Dhabi: AED 20, usually 2-3 business days
- Ras Al Khaimah, Umm Al Quwain and Fujairah: AED 25, usually 3-5 business days

Times are estimates in business days from the day your order is confirmed and may be longer around public holidays and sales. Your exact fee is shown at checkout before you pay.

## Free delivery
- Free on orders over AED 200
- Free on orders over AED 300 to Ras Al Khaimah, Umm Al Quwain and Fujairah

## Minimum order
The minimum order is AED 50.

## Payment on delivery
Cash on delivery is available for orders up to AED 3,000, with no extra fee. Please keep the exact amount ready if you can.

## Tracking your order
Use the Track order page with your order number to see where your order is. If you have an account, your orders and their status are also under My account.

## When your parcel arrives
Please check the parcel when it arrives. If it looks damaged, or an item is missing or wrong, message us on WhatsApp at ${WHATSAPP} with your order number and a photo, and we will fix it. You can also request a return or exchange within 7 days of delivery. It is free from our side; you only pay the rider's delivery charge. See the Returns & exchanges page.

## Delivery address
Please enter a complete address with a phone number that is reachable on the day. A wrong or incomplete address can delay your order.`,
      ar: `نوصل إلى الإمارات السبع. تختلف الرسوم والمدة حسب موقعك.

## رسوم التوصيل ومدته
- دبي والشارقة وعجمان: 15 درهماً، وعادةً خلال 1-2 يوم عمل
- أبوظبي: 20 درهماً، وعادةً خلال 2-3 أيام عمل
- رأس الخيمة وأم القيوين والفجيرة: 25 درهماً، وعادةً خلال 3-5 أيام عمل

المدد تقديرية بأيام العمل من يوم تأكيد طلبك، وقد تطول في العطل الرسمية وأوقات التخفيضات. تظهر لك الرسوم الدقيقة عند إتمام الطلب قبل الدفع.

## التوصيل المجاني
- مجاني للطلبات التي تزيد عن 200 درهم
- مجاني للطلبات التي تزيد عن 300 درهم إلى رأس الخيمة وأم القيوين والفجيرة

## الحد الأدنى للطلب
الحد الأدنى للطلب 50 درهماً.

## الدفع عند الاستلام
الدفع عند الاستلام متاح للطلبات حتى 3,000 درهم، دون رسوم إضافية. يُفضّل تجهيز المبلغ المطلوب.

## تتبّع طلبك
استخدم صفحة تتبّع الطلب مع رقم طلبك لمعرفة مكانه. وإن كان لديك حساب فطلباتك وحالتها موجودة أيضاً في صفحة حسابي.

## عند وصول الشحنة
يرجى فحص الشحنة عند وصولها. إن بدت تالفة، أو كان منتج ناقصاً أو خاطئاً، راسلنا على واتساب ${WHATSAPP} مع رقم الطلب وصورة وسنعالج الأمر. ويمكنك أيضاً طلب الإرجاع أو الاستبدال خلال 7 أيام من التسليم. وهو مجاني من جهتنا، وتدفع فقط أجرة توصيل المندوب. راجع صفحة الإرجاع والاستبدال.

## عنوان التوصيل
يرجى إدخال عنوان كامل ورقم هاتف يمكن الوصول إليه في يوم التسليم. العنوان الخاطئ أو الناقص قد يؤخر طلبك.`,
    },
  },
  {
    slug: "returns",
    title: { en: "Returns & exchanges", ar: "الإرجاع والاستبدال" },
    body: {
      en: `If something is not right, we will help. You have 7 days from the day your order is delivered to ask for a return.

## What you can choose
- Store credit: when your return is complete, you receive a single-use code worth the value of the returned items. Enter it at checkout on your next order. It is valid for 90 days.
- Exchange: for items that come in other sizes or colours, you can ask for a different option of the same product, when it is in stock.

## How to request a return
- Open your order from My account, or from the Track order page with your order number.
- Choose Request a return, select the items and the reason, and choose store credit or exchange.
- We review your request and update you on the order page. Once it is approved, we explain how to send the items back.

## Reasons we accept
Wrong size, wrong colour, defective item, item not as described, or changed your mind.

## Cost
Returns and exchanges are free from our side: there is no return fee and no exchange fee. The only cost is the rider's delivery charge, which you pay directly to the rider.

## Conditions
- The request must be made within 7 days of delivery.
- Items should be unused and in their original packaging, with any tags and accessories.
- Items must be returned for the return to be completed.
- If the item arrived damaged, defective or different from your order, tell us as soon as you can with your order number and a photo.

## Questions
Message us on WhatsApp at ${WHATSAPP} and we will guide you.`,
      ar: `إن لم يكن شيء كما توقعت فسنساعدك. لديك 7 أيام من يوم تسليم طلبك لطلب الإرجاع.

## ما الذي يمكنك اختياره
- رصيد في المتجر: عند اكتمال الإرجاع تحصل على رمز للاستخدام مرة واحدة بقيمة المنتجات المرجعة. تدخله عند إتمام طلبك التالي، وهو صالح لمدة 90 يوماً.
- الاستبدال: للمنتجات المتوفرة بمقاسات أو ألوان أخرى، يمكنك طلب خيار مختلف من المنتج نفسه عند توفره.

## كيف تطلب الإرجاع
- افتح طلبك من صفحة حسابي، أو من صفحة تتبّع الطلب برقم طلبك.
- اختر طلب إرجاع، وحدّد المنتجات والسبب، ثم اختر رصيد المتجر أو الاستبدال.
- نراجع طلبك ونوافيك بالتحديثات في صفحة الطلب. وبعد الموافقة نشرح لك كيفية إعادة المنتجات.

## الأسباب المقبولة
مقاس خاطئ، لون خاطئ، منتج معيب، منتج مختلف عن الوصف، أو تغيير الرأي.

## التكلفة
الإرجاع والاستبدال مجانيان من جهتنا: لا توجد رسوم إرجاع ولا رسوم استبدال. التكلفة الوحيدة هي أجرة توصيل المندوب، وتدفعها مباشرة للمندوب.

## الشروط
- يجب تقديم الطلب خلال 7 أيام من التسليم.
- يجب أن تكون المنتجات غير مستخدمة وفي عبوتها الأصلية مع أي بطاقات وملحقات.
- يجب إعادة المنتجات لاكتمال الإرجاع.
- إن وصل المنتج تالفاً أو معيباً أو مختلفاً عن طلبك، أخبرنا في أقرب وقت مع رقم الطلب وصورة.

## أسئلة
راسلنا على واتساب ${WHATSAPP} وسنرشدك.`,
    },
  },
] as const;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI must be set (.env.local)");
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });
  console.log(`${mongoose.connection.name}: ${apply ? "APPLY" : "DRY RUN"}\n`);
  for (const p of PAGES) {
    const cur = await ContentPage.findOne({ slug: p.slug }).lean();
    const state = !cur ? "new" : /PLACEHOLDER|نص مؤقت/.test(`${cur.body?.en}${cur.body?.ar}`) ? "replaces placeholder" : "REPLACES EDITED TEXT";
    console.log(`  ${p.slug.padEnd(10)} ${state.padEnd(22)} ${p.body.en.length} + ${p.body.ar.length} chars`);
    if (apply) await ContentPage.updateOne({ slug: p.slug }, { $set: { title: p.title, body: p.body, published: true } }, { upsert: true });
  }
  if (!apply) console.log("\nDry run only. Add --apply to write.");
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
