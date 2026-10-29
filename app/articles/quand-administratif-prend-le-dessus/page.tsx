import ArticlePage from "../ArticlePage";
import { articles } from "@/lib/articles";

const article = articles.find(
  ({ slug }) => slug === "quand-administratif-prend-le-dessus",
);

export default function QuandAdministratifPrendLeDessusPage() {
  return <ArticlePage article={article!} />;
}
