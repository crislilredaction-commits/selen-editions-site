import ArticlePage from "../ArticlePage";
import { articles } from "@/lib/articles";

const article = articles.find(
  ({ slug }) => slug === "qualiopi-preuves-session-formation",
);

export default function QualiopiPreuvesSessionFormationPage() {
  return <ArticlePage article={article!} />;
}
