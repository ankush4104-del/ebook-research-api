import { logger } from "./logger";

const TAVILY_API_URL = "https://api.tavily.com/search";
const CROSSREF_API_URL = "https://api.crossref.org/works";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
  answer?: string;
}

interface CrossrefItem {
  title?: string[];
  author?: { given?: string; family?: string }[];
  DOI?: string;
}

interface CrossrefResponse {
  message?: {
    items?: CrossrefItem[];
  };
}

export interface ResearchResult {
  topic: string;
  summary: string;
  key_concepts: string[];
  chapter_ideas: string[];
  industry_trends: string[];
  statistics: { fact: string; source: string }[];
  case_studies: { title: string; summary: string }[];
  sources: { title: string; url: string }[];
  academic_references: { title: string; authors: string; doi: string }[];
}

async function tavilySearch(
  query: string,
  searchDepth: "basic" | "advanced" = "advanced",
  maxResults = 10
): Promise<TavilyResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not configured");
  }

  const res = await fetch(TAVILY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: searchDepth,
      max_results: maxResults,
      include_answer: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavily API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<TavilyResponse>;
}

async function crossrefSearch(
  topic: string,
  rows = 5
): Promise<CrossrefItem[]> {
  try {
    const url = `${CROSSREF_API_URL}?query=${encodeURIComponent(topic)}&rows=${rows}&select=title,author,DOI`;
    const res = await fetch(url, {
      headers: { "User-Agent": "BookResearchAPI/1.0 (mailto:research@example.com)" },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Crossref returned non-OK status");
      return [];
    }
    const data = (await res.json()) as CrossrefResponse;
    return data.message?.items ?? [];
  } catch (err) {
    logger.warn({ err }, "Crossref search failed, skipping academic references");
    return [];
  }
}

function extractKeyConcepts(results: TavilyResult[], topic: string): string[] {
  const text = results.map((r) => r.content).join(" ").toLowerCase();
  const words = text.match(/\b[a-z][a-z\s-]{3,30}\b/g) ?? [];
  const freq: Record<string, number> = {};
  for (const w of words) {
    const trimmed = w.trim();
    if (trimmed.split(" ").length >= 2) {
      freq[trimmed] = (freq[trimmed] ?? 0) + 1;
    }
  }
  const topTerms = Object.entries(freq)
    .filter(([k]) => !k.includes(topic.toLowerCase()))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k]) => k.replace(/\b\w/g, (c) => c.toUpperCase()));

  return topTerms.length > 0 ? topTerms : [`Core principles of ${topic}`, `${topic} frameworks`, `${topic} best practices`];
}

function extractStatistics(results: TavilyResult[]): { fact: string; source: string }[] {
  const stats: { fact: string; source: string }[] = [];
  const statPattern = /[\d]+[\d,.%$BMK\s]*(?:percent|%|billion|million|thousand|users|companies|businesses|organizations)[^.!?]*/gi;

  for (const result of results) {
    const matches = result.content.match(statPattern) ?? [];
    for (const match of matches.slice(0, 2)) {
      const cleaned = match.trim().replace(/\s+/g, " ");
      if (cleaned.length > 20 && cleaned.length < 200) {
        stats.push({ fact: cleaned, source: result.url });
      }
    }
    if (stats.length >= 8) break;
  }

  return stats;
}

function buildChapterIdeas(
  topic: string,
  bookType: string,
  targetAudience: string,
  keyConceptsData: TavilyResult[]
): string[] {
  const base: Record<string, string[]> = {
    ebook: [
      `Introduction to ${topic}`,
      `Why ${topic} Matters in Today's World`,
      `Core Concepts and Fundamentals`,
      `Getting Started: Your First Steps`,
      `Advanced Strategies and Techniques`,
      `Real-World Applications`,
      `Common Mistakes to Avoid`,
      `Building Your ${topic} Action Plan`,
    ],
    nonfiction: [
      `The Story of ${topic}`,
      `Historical Context and Origins`,
      `Key Principles That Drive Success`,
      `Case Studies: Lessons from the Field`,
      `The Science Behind ${topic}`,
      `Expert Perspectives`,
      `Practical Frameworks`,
      `The Future of ${topic}`,
      `Conclusion: Your Path Forward`,
    ],
    training_manual: [
      `Module 1: Orientation and Overview`,
      `Module 2: Foundational Concepts`,
      `Module 3: Core Skills and Techniques`,
      `Module 4: Hands-On Practice`,
      `Module 5: Advanced Applications`,
      `Module 6: Assessment and Certification`,
      `Appendix: Resources and References`,
    ],
  };

  const chapters = base[bookType] ?? base["ebook"];

  if (targetAudience.toLowerCase().includes("beginner")) {
    chapters.splice(1, 0, `${topic} for Absolute Beginners`);
  } else if (targetAudience.toLowerCase().includes("advanced") || targetAudience.toLowerCase().includes("expert")) {
    chapters.push(`Mastering ${topic}: Expert-Level Techniques`);
  }

  return chapters;
}

function extractTrends(results: TavilyResult[]): string[] {
  const trendKeywords = ["trend", "emerging", "future", "growing", "rise of", "shift to", "increasing", "ai", "automation", "digital"];
  const trends: string[] = [];
  const sentences = results
    .flatMap((r) => r.content.split(/[.!?]+/))
    .filter((s) => trendKeywords.some((k) => s.toLowerCase().includes(k)));

  for (const sentence of sentences) {
    const trimmed = sentence.trim().replace(/\s+/g, " ");
    if (trimmed.length > 30 && trimmed.length < 150) {
      trends.push(trimmed);
      if (trends.length >= 6) break;
    }
  }

  return trends;
}

function extractCaseStudies(results: TavilyResult[]): { title: string; summary: string }[] {
  const caseStudies: { title: string; summary: string }[] = [];
  const caseKeywords = ["case study", "example", "company", "brand", "how .* used", "success story"];

  for (const result of results) {
    const hasCaseStudy = caseKeywords.some((k) =>
      new RegExp(k, "i").test(result.content)
    );
    if (hasCaseStudy && result.title && result.content.length > 100) {
      const summary = result.content.slice(0, 300).replace(/\s+/g, " ").trim();
      caseStudies.push({ title: result.title, summary: summary + "..." });
      if (caseStudies.length >= 4) break;
    }
  }

  return caseStudies;
}

export async function performResearch(
  topic: string,
  bookType: string,
  targetAudience: string
): Promise<ResearchResult> {
  logger.info({ topic, bookType, targetAudience }, "Starting research");

  const [generalData, trendsData, statisticsData, crossrefItems] = await Promise.all([
    tavilySearch(`${topic} overview fundamentals guide ${targetAudience}`, "advanced", 10),
    tavilySearch(`${topic} latest trends 2024 2025`, "basic", 7),
    tavilySearch(`${topic} statistics data facts research`, "basic", 7),
    crossrefSearch(topic, 5),
  ]);

  const allResults = [
    ...generalData.results,
    ...trendsData.results,
    ...statisticsData.results,
  ];

  const summary =
    generalData.answer ??
    (generalData.results[0]?.content.slice(0, 500) ?? `Research overview for ${topic}.`);

  const keyConcepts = extractKeyConcepts(generalData.results, topic);
  const chapterIdeas = buildChapterIdeas(topic, bookType, targetAudience, generalData.results);
  const industryTrends = extractTrends(trendsData.results);
  const statistics = extractStatistics(statisticsData.results);
  const caseStudies = extractCaseStudies(allResults);

  const sources = allResults
    .filter((r) => r.title && r.url)
    .reduce<{ title: string; url: string }[]>((acc, r) => {
      if (!acc.find((s) => s.url === r.url)) {
        acc.push({ title: r.title, url: r.url });
      }
      return acc;
    }, [])
    .slice(0, 10);

  const academicReferences = crossrefItems
    .filter((item) => item.title?.[0] && item.DOI)
    .map((item) => ({
      title: item.title![0],
      authors: (item.author ?? [])
        .map((a) => `${a.given ?? ""} ${a.family ?? ""}`.trim())
        .filter(Boolean)
        .join(", ") || "Unknown",
      doi: item.DOI!,
    }));

  logger.info(
    {
      topic,
      sourcesCount: sources.length,
      academicCount: academicReferences.length,
    },
    "Research complete"
  );

  return {
    topic,
    summary,
    key_concepts: keyConcepts,
    chapter_ideas: chapterIdeas,
    industry_trends: industryTrends,
    statistics,
    case_studies: caseStudies,
    sources,
    academic_references: academicReferences,
  };
}
