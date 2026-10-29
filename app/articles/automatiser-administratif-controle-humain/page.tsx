import ArticlePage from "../ArticlePage";
import { articles } from "@/lib/articles";

const article = articles.find(
  ({ slug }) => slug === "automatiser-administratif-controle-humain",
);

export default function AutomatiserAdministratifControleHumainPage() {
  return <ArticlePage article={article!} />;
}
