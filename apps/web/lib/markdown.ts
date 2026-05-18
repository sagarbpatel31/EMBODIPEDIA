// Tiny Wikipedia-flavoured markdown renderer.
// Auto-links known entity names to their /wiki/ pages for hover tooltips.
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
      const v = typeof r.confidence === "string" ? parseFloat(r.confidence as unknown as string) : r.confidence;
      if (!isNaN(v)) m.set(r.footnote_id, v);
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
      const raw = confMap.get(parseInt(n, 10));
      if (raw == null) return tag;
      const conf = typeof raw === "string" ? parseFloat(raw) : raw;
      if (isNaN(conf)) return tag;
      const cls = conf >= 0.75 ? "conf-high" : conf >= 0.5 ? "conf-med" : "conf-low";
      return `${tag}<span class="${cls}" title="confidence ${conf.toFixed(2)}" style="width:6px;height:6px;display:inline-block;border-radius:50%;vertical-align:0.2em;margin-left:1px;"></span>`;
    },
  );
}

// Sorted longest-first so "Tesla Optimus Gen 3" matches before "Tesla Optimus".
const WIKI_ENTITY_LINKS: Array<[string, string]> = [
  ["NVIDIA GR00T N2", "NVIDIA_GR00T"],
  ["NVIDIA GR00T N1", "NVIDIA_GR00T"],
  ["NVIDIA GR00T", "NVIDIA_GR00T"],
  ["Physical Intelligence", "Physical_Intelligence"],
  ["Tesla Optimus Gen 3", "Tesla_Optimus"],
  ["Tesla Optimus", "Tesla_Optimus"],
  ["Apptronik Apollo", "Apptronik_Apollo"],
  ["Boston Dynamics Atlas", "Boston_Dynamics_Atlas"],
  ["Boston Dynamics", "Boston_Dynamics_Atlas"],
  ["Agility Robotics Digit", "Agility_Robotics_Digit"],
  ["Agility Robotics", "Agility_Robotics_Digit"],
  ["Sanctuary AI Phoenix", "Sanctuary_AI_Phoenix"],
  ["Sanctuary AI", "Sanctuary_AI_Phoenix"],
  ["Skild AI", "Skild_AI"],
  ["Unitree G1", "Unitree_G1"],
  ["Figure 03", "Figure_03"],
  ["Figure 02", "Figure_02"],
  ["Gemini Robotics", "Gemini_Robotics"],
  ["Astribot S1", "Astribot_S1"],
  ["Covariant", "Covariant"],
  ["GR00T N2", "NVIDIA_GR00T"],
  ["GR00T N1", "NVIDIA_GR00T"],
  ["Figure AI", "Figure_02"],
];
WIKI_ENTITY_LINKS.sort((a, b) => b[0].length - a[0].length);

// Link entity names in text nodes only — splits on HTML tags so we never
// mutate tag attributes or already-linked text.
function autoLinkEntities(html: string, skipEntity?: string): string {
  const parts = html.split(/(<[^>]+>)/g);
  let insideAnchor = 0;
  return parts
    .map((part, i) => {
      if (i % 2 === 1) {
        // Tag — track anchor depth to avoid double-linking.
        if (/^<a[\s>]/i.test(part)) insideAnchor++;
        else if (/^<\/a>/i.test(part)) insideAnchor = Math.max(0, insideAnchor - 1);
        return part;
      }
      if (insideAnchor > 0 || !part) return part;
      let out = part;
      for (const [name, slug] of WIKI_ENTITY_LINKS) {
        if (skipEntity && name.toLowerCase() === skipEntity.toLowerCase()) continue;
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Replace only the first occurrence per text segment.
        out = out.replace(
          new RegExp(`\\b${esc}\\b`),
          `<a href="/wiki/${slug}" class="entity-link">${name}</a>`,
        );
      }
      return out;
    })
    .join("");
}

export function renderArticleMarkdown(md: string, refs?: Reference[], currentEntity?: string): string {
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
  return autoLinkEntities(html.join("\n"), currentEntity);
}
