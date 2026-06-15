import { logger } from "./logger";

const CROSSREF_API_URL = "https://api.crossref.org/works";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CitationStyle = "APA" | "MLA" | "Chicago" | "Harvard";

interface CrossrefAuthor {
  given?: string;
  family?: string;
}

interface CrossrefItem {
  title?: string[];
  author?: CrossrefAuthor[];
  DOI?: string;
  publisher?: string;
  "container-title"?: string[];
  issued?: { "date-parts"?: number[][] };
  URL?: string;
  volume?: string;
  issue?: string;
  page?: string;
  type?: string;
}

interface CrossrefSearchResponse {
  message?: { items?: CrossrefItem[] };
}

export interface CitationReference {
  title: string;
  authors: string;
  year: string;
  doi: string;
  citation: string;
}

export interface CitationsResult {
  topic: string;
  style: CitationStyle;
  references: CitationReference[];
}

// ── Crossref ──────────────────────────────────────────────────────────────────

async function crossrefSearch(topic: string, rows = 10): Promise<CrossrefItem[]> {
  try {
    const url =
      `${CROSSREF_API_URL}?query=${encodeURIComponent(topic)}&rows=${rows}` +
      `&select=title,author,DOI,container-title,issued,publisher,URL,volume,issue,page,type`;

    const res = await fetch(url, {
      headers: { "User-Agent": "BookResearchAPI/1.0 (mailto:research@example.com)" },
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "Crossref returned non-OK");
      return [];
    }

    const data = (await res.json()) as CrossrefSearchResponse;
    return (data.message?.items ?? []).filter((item) => item.title?.[0] && item.DOI);
  } catch (err) {
    logger.warn({ err }, "Crossref search failed");
    return [];
  }
}

// ── Year / date helpers ───────────────────────────────────────────────────────

function extractYear(item: CrossrefItem): string {
  const parts = item.issued?.["date-parts"]?.[0];
  return parts?.[0] != null ? String(parts[0]) : "n.d.";
}

// ── Author formatters (per style) ─────────────────────────────────────────────

function apaAuthors(authors: CrossrefAuthor[]): string {
  if (!authors.length) return "Unknown";
  const formatted = authors.map((a) => {
    const initials = (a.given ?? "").split(/[\s-]+/).map((n) => (n[0] ? n[0] + "." : "")).join(" ");
    return initials ? `${a.family ?? ""}, ${initials}` : (a.family ?? "");
  });
  if (formatted.length === 1) return formatted[0]!;
  if (formatted.length === 2) return formatted.join(", & ");
  if (formatted.length <= 20) return formatted.slice(0, -1).join(", ") + ", & " + formatted[formatted.length - 1];
  return formatted.slice(0, 19).join(", ") + ", . . . " + formatted[formatted.length - 1];
}

function mlaAuthors(authors: CrossrefAuthor[]): string {
  if (!authors.length) return "Unknown";
  const [first, second, ...rest] = authors;
  const firstName = `${first?.family ?? ""}, ${first?.given ?? ""}`.replace(/,\s*$/, "").trim();
  if (!second) return firstName;
  const secondName = `${second.given ?? ""} ${second.family ?? ""}`.trim();
  if (!rest.length) return `${firstName}, and ${secondName}`;
  return `${firstName}, et al.`;
}

function chicagoAuthors(authors: CrossrefAuthor[]): string {
  if (!authors.length) return "Unknown";
  const [first, ...rest] = authors;
  const firstName = `${first?.family ?? ""}, ${first?.given ?? ""}`.replace(/,\s*$/, "").trim();
  if (!rest.length) return firstName;
  const others = rest.map((a) => `${a.given ?? ""} ${a.family ?? ""}`.trim()).join(", ");
  return `${firstName}, and ${others}`;
}

function harvardAuthors(authors: CrossrefAuthor[]): string {
  if (!authors.length) return "Unknown";
  return authors
    .map((a) => {
      const initials = (a.given ?? "")
        .split(/[\s-]+/)
        .map((n) => (n[0] ? n[0] + "." : ""))
        .join("");
      return initials ? `${a.family ?? ""}, ${initials}` : (a.family ?? "");
    })
    .join(", ");
}

// ── Citation formatters ───────────────────────────────────────────────────────

function formatApa(item: CrossrefItem): string {
  const authStr = apaAuthors(item.author ?? []);
  const yr = extractYear(item);
  const title = item.title?.[0] ?? "Untitled";
  const journal = item["container-title"]?.[0];
  const doi = item.DOI;

  let source = "";
  if (journal) {
    source = `*${journal}*`;
    if (item.volume) source += `, *${item.volume}*`;
    if (item.issue) source += `(${item.issue})`;
    if (item.page) source += `, ${item.page}`;
    source += ".";
  } else if (item.publisher) {
    source = `${item.publisher}.`;
  }

  const ref = doi ? ` https://doi.org/${doi}` : item.URL ? ` ${item.URL}` : "";
  return `${authStr} (${yr}). ${title}. ${source}${ref}`.replace(/\s{2,}/g, " ").trim();
}

function formatMla(item: CrossrefItem): string {
  const authStr = mlaAuthors(item.author ?? []);
  const yr = extractYear(item);
  const title = item.title?.[0] ?? "Untitled";
  const journal = item["container-title"]?.[0];
  const doi = item.DOI;

  if (journal) {
    const v = item.volume ? `, vol. ${item.volume}` : "";
    const i = item.issue ? `, no. ${item.issue}` : "";
    const p = item.page ? `, pp. ${item.page}` : "";
    const d = doi ? `, doi:${doi}` : "";
    return `${authStr}. "${title}." *${journal}*${v}${i}, ${yr}${p}${d}.`;
  }

  const pub = item.publisher ? `${item.publisher}, ` : "";
  const d = doi ? ` doi:${doi}.` : "";
  return `${authStr}. *${title}*. ${pub}${yr}.${d}`.replace(/\s{2,}/g, " ").trim();
}

function formatChicago(item: CrossrefItem): string {
  const authStr = chicagoAuthors(item.author ?? []);
  const yr = extractYear(item);
  const title = item.title?.[0] ?? "Untitled";
  const journal = item["container-title"]?.[0];
  const doi = item.DOI;

  if (journal) {
    const v = item.volume ? ` ${item.volume}` : "";
    const i = item.issue ? `, no. ${item.issue}` : "";
    const p = item.page ? `: ${item.page}` : "";
    const d = doi ? ` https://doi.org/${doi}.` : "";
    return `${authStr}. "${title}." *${journal}*${v}${i} (${yr})${p}.${d}`.replace(/\s{2,}/g, " ").trim();
  }

  const pub = item.publisher ? `${item.publisher}, ` : "";
  const d = doi ? ` https://doi.org/${doi}.` : "";
  return `${authStr}. *${title}*. ${pub}${yr}.${d}`.replace(/\s{2,}/g, " ").trim();
}

function formatHarvard(item: CrossrefItem): string {
  const authStr = harvardAuthors(item.author ?? []);
  const yr = extractYear(item);
  const title = item.title?.[0] ?? "Untitled";
  const journal = item["container-title"]?.[0];
  const doi = item.DOI;

  if (journal) {
    const v = item.volume ? `, ${item.volume}` : "";
    const i = item.issue ? `(${item.issue})` : "";
    const p = item.page ? `, pp.${item.page}` : "";
    const d = doi ? ` doi: ${doi}.` : "";
    return `${authStr} (${yr}) '${title}', *${journal}*${v}${i}${p}.${d}`;
  }

  const pub = item.publisher ? `${item.publisher}.` : "";
  const d = doi ? ` doi: ${doi}.` : "";
  return `${authStr} (${yr}) *${title}*. ${pub}${d}`.replace(/\s{2,}/g, " ").trim();
}

const FORMATTERS: Record<CitationStyle, (item: CrossrefItem) => string> = {
  APA: formatApa,
  MLA: formatMla,
  Chicago: formatChicago,
  Harvard: formatHarvard,
};

// ── Main export ───────────────────────────────────────────────────────────────

export async function findAndFormatCitations(
  topic: string,
  style: CitationStyle
): Promise<CitationsResult> {
  logger.info({ topic, style }, "Fetching citations from Crossref");

  const items = await crossrefSearch(topic, 10);

  logger.info({ topic, style, count: items.length }, "Crossref results received");

  const format = FORMATTERS[style];

  const references: CitationReference[] = items.map((item) => ({
    title:    item.title?.[0] ?? "Untitled",
    authors:  apaAuthors(item.author ?? []),
    year:     extractYear(item),
    doi:      item.DOI ?? "",
    citation: format(item),
  }));

  return { topic, style, references };
}
