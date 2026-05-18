// Tiny Wikipedia-flavoured markdown renderer.
// Supports: # / ## / ### headers, paragraphs, **bold**, _italic_,
// [text](url) links, [^N] footnote markers, [citation needed] inline tag.
// Returns HTML string for use with dangerouslySetInnerHTML.

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function renderInline(line: string): string {
  let out = escapeHtml(line);
  // Footnote markers: [^N] -> superscript link.
  out = out.replace(
    /\[\^(\d+)\]/g,
    (_m, n) =>
      `<sup class="footnote-ref"><a href="#cite-${n}" id="ref-${n}">[${n}]</a></sup>`,
  );
  // Citation needed tag — must come after footnote substitution.
  out = out.replace(
    /\[citation needed\]/gi,
    `<sup class="citation-needed" title="No primary source could be located. See Talk page.">[citation needed]</sup>`,
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

export function renderArticleMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
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
      html.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  return html.join("\n");
}
