/**
 * Shared Markdown → sanitized HTML rendering, used by both the knowledge base
 * and comments so the two content surfaces behave the same way (D4).
 */
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "strong", "em", "del", "code", "pre", "blockquote",
  "ul", "ol", "li",
  "table", "thead", "tbody", "tr", "th", "td",
  "a", "img",
  "div", "span",
];

const ALLOWED_ATTRS: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "title", "target", "rel"],
  img: ["src", "alt", "width", "height"],
  code: ["class"],
  pre: ["class"],
  th: ["align"],
  td: ["align"],
};

export function renderMarkdown(bodyMd: string): string {
  const rawHtml = marked.parse(bodyMd, { async: false }) as string;
  return sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    // Force external links to open safely
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
}
