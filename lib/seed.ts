import type { Collection, Product } from "./types";

export const img = (id: string, w = 1200) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

export const IMG = {
  roseChrono: "1524592094714-0f0654e20314",
  handWatch: "1524592094714-0f0654e20314",
  goldWrist: "1590736969955-71cc94801759",
  navyStrap: "1590736969955-71cc94801759",
  blueStrap: "1524592094714-0f0654e20314",
  darkWatch: "1590736969955-71cc94801759",
  chrono: "1524592094714-0f0654e20314",
  pearls: "1515562141207-7a88fb7ce338",
  earrings: "1535632066927-ab7c9ab60908",
  diamondBracelet: "1573408301185-9146fe634ad0",
  goldBracelet: "1602173574767-37ac01994b2a",
  ring: "1605100804763-247f67b3557e",
  roseBracelet: "1611591437281-460bfbe1220a",
  rings: "1617038260897-41a1f14a8ca0",
  pendant: "1599643478518-a784e5dc4c8f",
  daintyBracelet: "1596944924616-7b38e7cfac36",
};

const p = (
  o: Partial<Product> &
    Pick<Product, "sku" | "name" | "slug" | "category" | "subcategory" | "finish" | "priceFrom" | "priceTo" | "shortDescription"> & {
      img: string;
      img2?: string;
    },
): Product => {
  const { img: i1, img2, ...rest } = o;
  return {
    brand: "Carts Heaven",
    model: o.name,
    longDescription: o.shortDescription,
    highlights: ["Hypoallergenic, tarnish-resistant finish", "Gift-ready premium packaging", "Checked by hand before dispatch"],
    includedItems: ["Carts Heaven gift box", "Care cloth", "7-day exchange card"],
    images: [
      { url: img(i1), alt: o.name },
      ...(img2 ? [{ url: img(img2), alt: `${o.name} detail` }] : []),
    ],
    currency: "AED",
    variants: [],
    stock: 12,
    tags: [],
    isNewArrival: false,
    isFeatured: false,
    isMostWanted: false,
    status: "active",
    createdAt: "2026-09-01",
    ...rest,
  };
};

export const products: Product[] = [
  p({
    sku: "AW-001", name: "Lumière Rose Chronograph", slug: "lumiere-rose-chronograph", category: "watches", subcategory: "chronograph",
    finish: "Rose gold", priceFrom: 699, priceTo: 449, img: IMG.goldWrist, img2: IMG.handWatch,
    shortDescription: "A blush-toned chronograph with a soft leather strap, made for brunch and boardroom alike.",
    tags: ["classic", "work", "rose gold"], isNewArrival: true, isMostWanted: true, isFeatured: true, stock: 4,
    variants: [
      { sku: "AW-001-RG", color: "Rose gold", stock: 4 },
      { sku: "AW-001-SV", color: "Silver", stock: 6, image: img(IMG.goldWrist) },
    ],
  }),
  p({
    sku: "AW-002", name: "Aura Minimal Rose", slug: "aura-minimal-rose", category: "watches", subcategory: "minimal",
    finish: "Rose gold", priceFrom: 549, priceTo: 349, img: IMG.handWatch, img2: IMG.goldWrist,
    shortDescription: "Ultra-clean dial, slim case and a taupe suede-finish strap. Quiet luxury for every day.",
    tags: ["everyday", "minimal", "rose gold"], isNewArrival: true, isMostWanted: true, isFeatured: true,
  }),
  p({
    sku: "AW-003", name: "Soirée Gold Link Watch", slug: "soiree-gold-link-watch", category: "watches", subcategory: "bracelet-watch",
    finish: "Gold", priceFrom: 799, priceTo: 529, img: IMG.goldWrist, img2: IMG.handWatch,
    shortDescription: "A delicate gold bracelet watch with a pearl-white dial. Stacks beautifully with your favourite bangles.",
    tags: ["statement", "evening", "gold"], isMostWanted: true, isFeatured: true, stock: 3,
  }),
  p({
    sku: "AW-004", name: "Nuit Noir Classic", slug: "nuit-noir-classic", category: "watches", subcategory: "classic",
    finish: "Gold", priceFrom: 599, priceTo: 389, img: IMG.handWatch, img2: IMG.goldWrist,
    shortDescription: "Black dial, gold indices and an interchangeable woven strap. A modern classic.",
    tags: ["classic", "work", "gold"], isNewArrival: true,
  }),
  p({
    sku: "AW-005", name: "Marina Blue Strap", slug: "marina-blue-strap", category: "watches", subcategory: "classic",
    finish: "Silver", priceFrom: 649, priceTo: 429, img: IMG.goldWrist, img2: IMG.handWatch,
    shortDescription: "Fresh silver case with a dusty-blue silicone strap. Light, sporty and sophisticated.",
    tags: ["everyday", "silver"], isMostWanted: true,
  }),
  p({
    sku: "AW-006", name: "Eclat Midnight", slug: "eclat-midnight", category: "watches", subcategory: "statement",
    finish: "Silver", priceFrom: 899, priceTo: 599, img: IMG.handWatch, img2: IMG.goldWrist,
    shortDescription: "A bold black-dial statement piece with a polished steel case and leather strap.",
    tags: ["statement", "silver"], isFeatured: true,
  }),
  p({
    sku: "AW-007", name: "Heritage Two-Tone Chrono", slug: "heritage-two-tone-chrono", category: "watches", subcategory: "chronograph",
    finish: "Two-tone", priceFrom: 749, priceTo: 479, img: IMG.goldWrist, img2: IMG.handWatch,
    shortDescription: "Cream dial, tri-compax sub-dials and a tan strap with a retro two-tone bezel.",
    tags: ["classic", "work", "two-tone"],
  }),
  p({
    sku: "AJ-001", name: "Perle Strand Necklace", slug: "perle-strand-necklace", category: "jewelry", subcategory: "necklaces",
    finish: "Pearl", priceFrom: 399, priceTo: 249, img: IMG.pearls, img2: IMG.pendant,
    shortDescription: "Lustrous freshwater-style pearls on a hand-knotted strand with a sparkling clasp.",
    tags: ["classic", "gifting"], isNewArrival: true, isFeatured: true,
  }),
  p({
    sku: "AJ-002", name: "Celeste Sapphire Drops", slug: "celeste-sapphire-drops", category: "jewelry", subcategory: "earrings",
    finish: "Silver", priceFrom: 349, priceTo: 219, img: IMG.earrings, img2: IMG.ring,
    shortDescription: "Statement drop earrings set with sapphire-blue stones framed in sparkling crystals.",
    tags: ["statement", "evening", "gifting"], isMostWanted: true, isFeatured: true,
  }),
  p({
    sku: "AJ-003", name: "Étoile Crystal Bracelet", slug: "etoile-crystal-bracelet", category: "jewelry", subcategory: "bracelets",
    finish: "Silver", priceFrom: 299, priceTo: 189, img: IMG.diamondBracelet, img2: IMG.ring,
    shortDescription: "A shimmering line of crystals that catches every light. Made for evenings.",
    tags: ["evening", "statement"], isNewArrival: true,
  }),
  p({
    sku: "AJ-004", name: "Soleil Chain Bracelet", slug: "soleil-chain-bracelet", category: "jewelry", subcategory: "bracelets",
    finish: "Gold", priceFrom: 279, priceTo: 169, img: IMG.goldBracelet, img2: IMG.daintyBracelet,
    shortDescription: "Chunky 18k gold-plated curb chain with a smooth, comfortable clasp.",
    tags: ["statement", "gold", "everyday"], isMostWanted: true,
  }),
  p({
    sku: "AJ-005", name: "Halo Solitaire Ring", slug: "halo-solitaire-ring", category: "jewelry", subcategory: "rings",
    finish: "Silver", priceFrom: 329, priceTo: 199, img: IMG.ring, img2: IMG.rings,
    shortDescription: "A halo of crystals around a brilliant centre stone, on a split shank band.",
    tags: ["classic", "gifting"], isFeatured: true,
    variants: [
      { sku: "AJ-005-6", size: "6", stock: 5 },
      { sku: "AJ-005-7", size: "7", stock: 5 },
      { sku: "AJ-005-8", size: "8", stock: 2 },
    ],
  }),
  p({
    sku: "AJ-006", name: "Rosé Link Bracelet", slug: "rose-link-bracelet", category: "jewelry", subcategory: "bracelets",
    finish: "Rose gold", priceFrom: 259, priceTo: 159, img: IMG.roseBracelet, img2: IMG.daintyBracelet,
    shortDescription: "Interlocking rose-gold links set with tiny crystals. Soft, romantic, effortless.",
    tags: ["everyday", "rose gold", "gifting"], isNewArrival: true,
  }),
  p({
    sku: "AJ-007", name: "Twist Gold Stack Rings", slug: "twist-gold-stack-rings", category: "jewelry", subcategory: "rings",
    finish: "Gold", priceFrom: 189, priceTo: 119, img: IMG.rings, img2: IMG.ring,
    shortDescription: "A set of twisted gold bands made for stacking and mixing.",
    tags: ["everyday", "gold", "gifting"], isMostWanted: true,
  }),
  p({
    sku: "AJ-008", name: "Crescent Gem Pendant", slug: "crescent-gem-pendant", category: "jewelry", subcategory: "necklaces",
    finish: "Gold", priceFrom: 319, priceTo: 199, img: IMG.pendant, img2: IMG.pearls,
    shortDescription: "A teal gemstone pendant with a crescent charm on a fine gold chain.",
    tags: ["statement", "gold", "gifting"], isFeatured: true,
  }),
];

export const collections: Collection[] = [
  { slug: "all-watches", name: "All Watches", description: "Women's watches in gold, silver and rose gold.", image: img(IMG.handWatch), type: "category", parent: "watches", sortOrder: 1 },
  { slug: "all-jewelry", name: "All Jewelry", description: "Necklaces, earrings, bracelets and rings.", image: img(IMG.diamondBracelet), type: "category", parent: "jewelry", sortOrder: 2 },
  { slug: "classic", name: "Classic", description: "Timeless watches that never go out of style.", image: img(IMG.handWatch), type: "style", parent: "watches", sortOrder: 3 },
  { slug: "statement", name: "Statement", description: "Bold pieces that start conversations.", image: img(IMG.earrings), type: "style", sortOrder: 4 },
  { slug: "everyday", name: "Everyday", description: "Easy, wearable pieces for every day.", image: img(IMG.goldWrist), type: "style", sortOrder: 5 },
  { slug: "work", name: "Work", description: "Polished watches for the office.", image: img(IMG.roseChrono), type: "style", parent: "watches", sortOrder: 6 },
  { slug: "gold", name: "Gold", description: "Warm, radiant gold finishes.", image: img(IMG.goldBracelet), type: "finish", sortOrder: 7 },
  { slug: "silver", name: "Silver", description: "Cool, clean silver finishes.", image: img(IMG.ring), type: "finish", sortOrder: 8 },
  { slug: "rose-gold", name: "Rose Gold", description: "Soft, romantic rose-gold finishes.", image: img(IMG.roseBracelet), type: "finish", sortOrder: 9 },
  { slug: "two-tone", name: "Two-Tone", description: "Gold and silver together.", image: img(IMG.rings), type: "finish", sortOrder: 10 },
  { slug: "gifting", name: "Gifting", description: "Beautifully boxed gifts for her.", image: img(IMG.pearls), type: "curated", sortOrder: 11 },
  { slug: "evening", name: "Evening Edit", description: "Sparkle for after dark.", image: img(IMG.earrings), type: "curated", sortOrder: 12 },
];

export const faqs = [
  { question: "How long does delivery take?", answer: "Orders are delivered within 1–3 working days across the UAE. Dubai and Abu Dhabi orders are often delivered the next day." },
  { question: "Do you offer cash on delivery?", answer: "Yes. Pay in cash when your order arrives, or pay online by card at checkout." },
  { question: "Can I exchange my order?", answer: "Absolutely. You have 7 days from delivery to exchange any unworn piece in its original packaging." },
  { question: "Are the pieces authentic and checked?", answer: "Every piece is inspected by hand before dispatch and ships in premium gift packaging." },
  { question: "How do I pick the right size?", answer: "Each product page lists sizes. Message us on WhatsApp and we will help you choose." },
];
