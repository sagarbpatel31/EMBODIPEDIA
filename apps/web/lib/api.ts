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
      // Server component fetch — short cache so live edits show up.
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return (await res.json()) as WikiArticle;
  } catch {
    return null;
  }
}
