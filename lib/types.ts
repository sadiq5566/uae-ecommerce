export type Variant = {
  sku: string;
  color?: string;
  size?: string;
  price?: number;
  stock: number;
  image?: string;
};

export type Product = {
  id?: string;
  sku: string;
  name: string;
  slug: string;
  category: string;
  subcategory: string;
  brand: string;
  model: string;
  shortDescription: string;
  longDescription: string;
  highlights: string[];
  finish: string;
  includedItems: string[];
  images: { url: string; alt: string; publicId?: string }[];
  priceFrom: number;
  priceTo: number;
  currency: "AED";
  variants: Variant[];
  stock: number;
  tags: string[];
  isNewArrival: boolean;
  isFeatured: boolean;
  isMostWanted: boolean;
  soldCount?: number;
  viewCount?: number;
  ratingAvg?: number;
  status: "active" | "draft" | "archived";
  mergedInto?: string;
  seo?: { title?: string; description?: string };
  createdAt: string;
};

export type Collection = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  image: string;
  parent?: string;
  type: "category" | "style" | "finish" | "curated";
  sortOrder: number;
};

export type CartItem = {
  sku: string;
  slug: string;
  name: string;
  image: string;
  unitPrice: number;
  qty: number;
  variant?: string;
};
