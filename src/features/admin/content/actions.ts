"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { FORBIDDEN, actor } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { fail, formObj, isDupKey, issues } from "@/lib/admin/common";
import { connectDb } from "@/lib/db";
import type { FormState } from "@/features/auth/schemas";
import { Article } from "@/models/article";
import { ContentPage } from "@/models/content-page";
import { Homepage } from "@/models/homepage";
import { articleSchema, bannersSchema, pageSchema } from "./schemas";

export async function saveArticleAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("articles:write");
  if (!user) return { error: FORBIDDEN };
  const parsed = articleSchema.safeParse(formObj(fd));
  if (!parsed.success) return fail(issues(parsed.error), fd);
  const a = parsed.data;
  await connectDb();
  const doc = {
    slug: a.slug, title: { en: a.title_en, ar: a.title_ar }, excerpt: { en: a.excerpt_en, ar: a.excerpt_ar }, body: { en: a.body_en, ar: a.body_ar },
    category: a.category, author: a.author, cover: a.cover, coverAlt: { en: a.coverAlt_en, ar: a.coverAlt_ar }, icon: a.icon, hue: a.hue, status: a.status,
    // Published articles without a date go live immediately; a future date schedules them.
    publishAt: a.status === "published" ? (a.publishAt ?? new Date()) : a.publishAt,
    seo: { title: { en: a.seoTitle_en, ar: a.seoTitle_ar }, description: { en: a.seoDesc_en, ar: a.seoDesc_ar } },
  };
  try {
    if (a.id) {
      if (!Types.ObjectId.isValid(a.id) || !(await Article.findByIdAndUpdate(a.id, doc))) return { error: "Article not found" };
      await audit(user, "article.update", "article", a.id, `Updated article ${a.slug}`, { status: a.status });
      revalidatePath("/admin/articles"); revalidatePath("/[lang]", "layout");
      return { ok: true };
    }
    const created = await Article.create(doc);
    await audit(user, "article.create", "article", String(created._id), `Created article ${a.slug}`);
  } catch (e) { if (isDupKey(e, "slug")) return fail({ slug: "This slug is already in use" }, fd); throw e; }
  revalidatePath("/admin/articles"); revalidatePath("/[lang]", "layout");
  redirect("/admin/articles?saved=1");
}

export async function deleteArticleAction(fd: FormData) {
  const user = await actor("articles:write");
  const id = String(fd.get("id") ?? "");
  if (!user || !Types.ObjectId.isValid(id)) return;
  await connectDb();
  const gone = await Article.findByIdAndDelete(id);
  if (gone) await audit(user, "article.delete", "article", id, `Deleted article ${gone.slug}`);
  revalidatePath("/[lang]", "layout"); redirect("/admin/articles");
}

export async function savePageAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("articles:write");
  if (!user) return { error: FORBIDDEN };
  const parsed = pageSchema.safeParse(formObj(fd));
  if (!parsed.success) return fail(issues(parsed.error), fd);
  const p = parsed.data;
  if (p.published && (!p.body_en.trim() || !p.body_ar.trim())) return fail({ body_en: "Published pages need both English and Arabic text" }, fd);
  await connectDb();
  await ContentPage.updateOne({ slug: p.slug }, { $set: { title: { en: p.title_en, ar: p.title_ar }, body: { en: p.body_en, ar: p.body_ar }, published: p.published, updatedBy: user.id } }, { upsert: true });
  await audit(user, "page.update", "page", p.slug, `Updated page ${p.slug}`, { published: p.published });
  revalidatePath("/admin/pages"); revalidatePath("/[lang]", "layout");
  return { ok: true };
}

export async function saveHomepageAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("homepage:write");
  if (!user) return { error: FORBIDDEN };
  const parsed = bannersSchema.safeParse(fd.get("banners"));
  if (!parsed.success) {
    // Errors are indexed by banner; show them under one field with the banner number.
    const first = parsed.error.issues[0];
    const where = typeof first.path[0] === "number" ? `Banner ${first.path[0] + 1}${first.path[1] ? ` (${String(first.path[1])})` : ""}: ` : "";
    return fail({ banners: `${where}${first.message}` }, fd);
  }
  const flag = (k: string) => fd.get(k) === "on";
  await connectDb();
  await Homepage.updateOne({ key: "home" }, { $set: {
    banners: parsed.data.map((b, i) => ({ ...b, id: b.id || `b${i}`, ctaHref: b.ctaHref || undefined })),
    sections: { deals: flag("s_deals"), featured: flag("s_featured"), newArrivals: flag("s_newArrivals"), popular: flag("s_popular"), mostViewed: flag("s_mostViewed"), journal: flag("s_journal") },
  } }, { upsert: true });
  await audit(user, "homepage.update", "homepage", "home", `Updated homepage (${parsed.data.length} banners)`);
  revalidatePath("/[lang]", "layout");
  return { ok: true };
}
