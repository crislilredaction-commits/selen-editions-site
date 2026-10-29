import ArticlePage from "../ArticlePage";
import { articles } from "@/lib/articles";

const article = articles.find(
  ({ slug }) => slug === "qualiopi-decret-2026-728-preuves",
);

export default function QualiopiDecret2026728PreuvesPage() {
  return <ArticlePage article={article!} />;
}
