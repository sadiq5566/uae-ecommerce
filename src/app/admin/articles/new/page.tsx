import { guard } from "@/lib/admin/guard";
import { PageHeader } from "@/components/admin/ui";
import { ArticleForm } from "@/features/admin/content/forms";

export const metadata = { title: "New article" };
export default async function NewArticle() {
  await guard("articles:write", "/admin/articles/new");
  return (<><PageHeader title="New article" /><ArticleForm /></>);
}
