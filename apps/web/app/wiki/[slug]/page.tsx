import { notFound } from "next/navigation";

import { fetchArticle, type Reference } from "@/lib/api";
import { renderArticleMarkdown } from "@/lib/markdown";

interface Params {
  slug: string;
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  return {
    title: `${slug.replace(/_+/g, " ")} — Embodipedia`,
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const article = await fetchArticle(slug);
  if (!article) {
    notFound();
  }

  const html = renderArticleMarkdown(article.markdown);

  return (
    <article className="wiki-article">
      <header className="wiki-header">
        <h1 className="wiki-title">{article.entity}</h1>
        <nav className="wiki-tabs">
          <a className="wiki-tab wiki-tab--active" href={`/wiki/${slug}`}>
            Article
          </a>
          <a className="wiki-tab" href={`/wiki/Talk:${slug}`}>
            Talk
          </a>
          <a className="wiki-tab" href={`/wiki/${slug}?action=history`}>
            History
          </a>
        </nav>
      </header>

      <div
        className="wiki-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <section className="wiki-references">
        <h2>References</h2>
        <ol>
          {article.references.map((ref: Reference) => (
            <li id={`cite-${ref.footnote_id}`} key={ref.footnote_id ?? Math.random()}>
              {ref.actor_entity ? <span>{ref.actor_entity}, </span> : null}
              {ref.source_url ? (
                <a href={ref.source_url} target="_blank" rel="noopener noreferrer">
                  {ref.source_type ?? "source"}
                </a>
              ) : (
                <span>(no URL)</span>
              )}
              {ref.published_at ? (
                <span className="wiki-ref-date"> · {ref.published_at.slice(0, 10)}</span>
              ) : null}
              <span className="wiki-ref-jump">
                {" "}
                <a href={`#ref-${ref.footnote_id}`}>↑</a>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {article.citation_needed_count > 0 ? (
        <footer className="wiki-meta">
          <em>
            {article.citation_needed_count} claim
            {article.citation_needed_count === 1 ? "" : "s"} flagged{" "}
            <span className="citation-needed-inline">[citation needed]</span>.
            See <a href={`/wiki/Talk:${slug}`}>Talk page</a> for open questions.
          </em>
        </footer>
      ) : null}
    </article>
  );
}
