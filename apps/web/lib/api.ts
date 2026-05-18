// Server-side helpers for talking to the FastAPI agent backend.
// Default to local FastAPI; override via NEXT_PUBLIC_AGENTS_URL.

export const AGENTS_URL =
  process.env.AGENTS_URL ||
  process.env.NEXT_PUBLIC_AGENTS_URL ||
  "http://127.0.0.1:8000";

export interface Reference {
  footnote_id: number | null;
  source_url: string | null;
  claim_text: string | null;
  source_type: string | null;
  published_at: string | null;
  confidence: number | null;
  actor_entity: string | null;
}

export interface WikiArticle {
  slug: string;
  entity: string;
  markdown: string;
  citation_needed_count: number;
  references: Reference[];
}

export async function fetchArticle(slug: string): Promise<WikiArticle | null> {
  try {
    const res = await fetch(`${AGENTS_URL}/api/wiki/${slug}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return (await res.json()) as WikiArticle;
  } catch {
    return null;
  }
}

export interface TalkPage {
  slug: string;
  entity: string;
  markdown: string;
  references: (Reference & { perspective?: string | null })[];
  bull_count: number;
  bear_count: number;
}

export async function fetchTalkPage(slug: string): Promise<TalkPage | null> {
  try {
    const res = await fetch(`${AGENTS_URL}/api/talk/${slug}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return (await res.json()) as TalkPage;
  } catch {
    return null;
  }
}

export interface HistoryEntry {
  memory_id: string;
  sub_tenant: string;
  subject_entity: string | null;
  claim_type: string | null;
  claim_text: string | null;
  confidence: string | null;
  perspective: string | null;
  source_type: string | null;
  source_url: string | null;
  actor_entity: string | null;
  published_at: string | null;
  ingested_at: string | null;
}

export interface ArticleHistory {
  entity: string;
  slug: string;
  count: number;
  entries: HistoryEntry[];
}

export async function fetchHistory(slug: string): Promise<ArticleHistory | null> {
  try {
    const res = await fetch(`${AGENTS_URL}/api/history/${slug}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ArticleHistory;
  } catch {
    return null;
  }
}

export interface AskResponse {
  answer: string;
  chunks: Array<{
    footnote_id: number;
    subject_entity: string | null;
    claim_text: string | null;
    source_url: string | null;
    source_type: string | null;
    actor_entity: string | null;
  }>;
  entity_paths: unknown[];
}

export async function askEmbodipedia(query: string): Promise<AskResponse | null> {
  try {
    const res = await fetch(
      `${AGENTS_URL}/api/ask?q=${encodeURIComponent(query)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as AskResponse;
  } catch {
    return null;
  }
}
