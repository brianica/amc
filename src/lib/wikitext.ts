/**
 * Turns a cached AoPS problem statement into HTML for display.
 *
 * Whitelist, never blacklist: every character of the source is escaped, and the only
 * markup in the output is markup this file emits. The input is wikitext fetched from
 * a third-party site, so treating any of it as trusted HTML would be handing that
 * site script execution in the app.
 *
 * Maths is rendered with KaTeX. Asymptote diagrams cannot be rendered at all, so they
 * are replaced with a notice and a nudge to the source — silently dropping them would
 * leave a geometry problem unanswerable with no explanation.
 */
import katex from "katex";

export interface RenderedStatement {
  html: string;
  /** True when the problem has a diagram that could not be rendered. */
  hasDiagram: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMath(latex: string, display: boolean): string {
  try {
    return katex.renderToString(latex.trim(), {
      displayMode: display,
      throwOnError: false,
      strict: false,
// Trust is off: no \includegraphics, \href or \url from third-party source.
      trust: false,
    });
  } catch {
    // A formula that will not parse is still better shown as its source than dropped.
    return `<code>${escapeHtml(latex)}</code>`;
  }
}

/** Remove wiki furniture that is navigation rather than the problem. */
function stripFurniture(text: string): string {
  return text
    .replace(/\{\{[^{}]*\}\}/g, "") // templates: contest navigation boxes
    .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, "") // embedded images we cannot serve
    .replace(/^\s*==+.*?==+\s*$/gm, "") // section headings
    .trim();
}

/**
 * Segments the source into text and maths, so escaping never touches LaTeX and KaTeX
 * never sees prose. `<cmath>` is AoPS's display-maths tag; `<math>` is inline.
 */
export function renderStatement(wikitext: string): RenderedStatement {
  const source = stripFurniture(wikitext);
  let hasDiagram = false;

  const pattern = /<(math|cmath)>([\s\S]*?)<\/\1>|\[asy\][\s\S]*?\[\/asy\]|\$([^$\n]+)\$/gi;
  let out = "";
  let last = 0;

  for (const m of source.matchAll(pattern)) {
    out += escapeHtml(source.slice(last, m.index));
    last = m.index + m[0].length;

    if (m[0].toLowerCase().startsWith("[asy]")) {
      hasDiagram = true;
      out += '<span class="statement-diagram">[diagram — see the original]</span>';
    } else if (m[1]) {
      out += renderMath(m[2] ?? "", m[1].toLowerCase() === "cmath");
    } else {
      // Bare $...$ maths, which some pages use instead of the tags.
      out += renderMath(m[3] ?? "", false);
    }
  }
  out += escapeHtml(source.slice(last));

  // Blank lines separate paragraphs; single newlines are wrapping, not structure.
  const html = out
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/\n/g, " ")}</p>`)
    .join("\n");

  return { html, hasDiagram };
}
