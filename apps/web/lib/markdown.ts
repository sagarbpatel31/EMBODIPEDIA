// Tiny Wikipedia-flavoured markdown renderer.
// Supports: # / ## / ### headers, paragraphs, **bold**, _italic_,
// [text](url) links, [^N] footnote markers, [unverified] inline badge.

import type { Reference } from "./api";

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function renderInline(line: string, refs?: Reference[]): string {
  let out = escapeHtml(line);

  // Footnote markers: [^N] -> superscript link with hover tooltip showing source.
  out = out.replace(/\[\^(\d+)\]/g, (_m, n) => {
    const idx = parseInt(n, 10) - 1;
    const ref = refs?.[idx];
    const tip = ref
      ? `${ref.source_type || "source"}${ref.actor_entity ? " · " + ref.actor_entity : ""}${ref.published_at ? " · " + ref.published_at.slice(0, 10) : ""}${ref.claim_text ? "\n\n" + ref.claim_text : ""}`
      : `Footnote ${n}`;
    return `<sup class="footnote-ref"><a href="#cite-${n}" id="ref-${n}" title="${escapeHtml(tip)}">[${n}]</a></sup>`;
  });

  // [unverified] badge — clean grey pill linking to Talk page.
  out = out.replace(
    /\[unverified\]/gi,
    `<span class="badge-unverified" title="Confidence below 0.70 or no primary source. See Talk page for open question.">unverified</span>`,
  );
  // Legacy [citation needed] tag — render as same clean badge.
  out = out.replace(
    /\[citation needed\]/gi,
    `<span class="badge-unverified" title="No primary source located. See Talk page.">needs source</span>`,
  );
  // Bold / italic.
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/_([^_]+)_/g, "<em>$1</em>");
  // Plain markdown links.
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, label, href) =>
      `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  );
  return out;
}

// Build a map from footnote_id → confidence for heatmap coloring.
function buildConfMap(refs?: Reference[]): Map<number, number> {
  const m = new Map<number, number>();
  if (!refs) return m;
  for (const r of refs) {
    if (r.footnote_id != null && r.confidence != null) {
      m.set(r.footnote_id, r.confidence);
    }
  }
  return m;
}

// Wrap a sentence that has a footnote marker with a confidence heatmap span.
function applyHeatmap(html: string, confMap: Map<number, number>): string {
  // Match footnote superscript and look up confidence of the LAST ref in the text.
  return html.replace(
    /(<sup class="footnote-ref"><a[^>]+>\[(\d+)\]<\/a><\/sup>)/g,
    (_m, tag, n) => {
      const conf = confMap.get(parseInt(n, 10));
      if (conf == null) return tag;
      const cls = conf >= 0.75 ? "conf-high" : conf >= 0.5 ? "conf-med" : "conf-low";
      return `${tag}<span class="${cls}" title="confidence ${conf.toFixed(2)}" style="width:6px;height:6px;display:inline-block;border-radius:50%;vertical-align:0.2em;margin-left:1px;"></span>`;
    },
  );
}

export function renderArticleMarkdown(md: string, refs?: Reference[]): string {
  const confMap = buildConfMap(refs);
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const raw = `<p>${renderInline(paragraph.join(" "), refs)}</p>`;
    html.push(confMap.size > 0 ? applyHeatmap(raw, confMap) : raw);
    paragraph = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      flushParagraph();
      const level = h[1].length;
      html.push(`<h${level}>${renderInline(h[2], refs)}</h${level}>`);
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  return html.join("\n");
}
