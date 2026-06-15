import { logger } from "./logger";

const TAVILY_API_URL = "https://api.tavily.com/search";
const CROSSREF_API_URL = "https://api.crossref.org/works";

// ── Shared types ──────────────────────────────────────────────────────────────

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

interface CrossrefAuthor {
  given?: string;
  family?: string;
}

interface CrossrefItem {
  title?: string[];
  author?: CrossrefAuthor[];
  DOI?: string;
  "container-title"?: string[];
  issued?: { "date-parts"?: number[][] };
  volume?: string;
  issue?: string;
  page?: string;
}

interface CrossrefResponse {
  message?: { items?: CrossrefItem[] };
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface ChapterStatistic {
  fact: string;
  source: string;
}

export interface ChapterCaseStudy {
  title: string;
  summary: string;
}

export interface ChapterResearchResult {
  chapter_title: string;
  summary: string;
  learning_objectives: string[];
  key_concepts: string[];
  important_subtopics: string[];
  industry_trends: string[];
  statistics: ChapterStatistic[];
  case_studies: ChapterCaseStudy[];
  expert_insights: string[];
  common_mistakes: string[];
  action_steps: string[];
  recommended_examples: string[];
  recommended_frameworks: string[];
  academic_references: string[];
  sources: string[];
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function tavilySearch(query: string, maxResults = 8): Promise<TavilyResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not configured");

  const res = await fetch(TAVILY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
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

async function crossrefSearch(query: string, rows = 6): Promise<CrossrefItem[]> {
  try {
    const url =
      `${CROSSREF_API_URL}?query=${encodeURIComponent(query)}&rows=${rows}` +
      `&select=title,author,DOI,container-title,issued,volume,issue,page`;

    const res = await fetch(url, {
      headers: { "User-Agent": "BookResearchAPI/1.0 (mailto:research@example.com)" },
    });

    if (!res.ok) return [];
    const data = (await res.json()) as CrossrefResponse;
    return (data.message?.items ?? []).filter((i) => i.title?.[0] && i.DOI);
  } catch {
    return [];
  }
}

// ── APA formatter (inline, light version) ─────────────────────────────────────

function toApa(item: CrossrefItem): string {
  const authors = (item.author ?? [])
    .map((a) => {
      const initials = (a.given ?? "").split(/[\s-]+/).map((n) => (n[0] ? n[0] + "." : "")).join(" ");
      return initials ? `${a.family ?? ""}, ${initials}` : (a.family ?? "");
    })
    .join(", ");

  const parts = item.issued?.["date-parts"]?.[0];
  const year = parts?.[0] != null ? String(parts[0]) : "n.d.";
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
  }

  const ref = doi ? ` https://doi.org/${doi}` : "";
  return `${authors || "Unknown"} (${year}). ${title}. ${source}${ref}`.replace(/\s{2,}/g, " ").trim();
}

// ── Extractors ────────────────────────────────────────────────────────────────

function buildSummary(
  chapterTitle: string,
  topic: string,
  targetAudience: string,
  answers: (string | undefined)[]
): string {
  const combinedAnswer = answers.filter(Boolean).join(" ").trim();
  if (combinedAnswer.length > 80) {
    const sentences = combinedAnswer.split(/(?<=[.!?])\s+/);
    const relevant = sentences
      .filter((s) => {
        const lower = s.toLowerCase();
        return chapterTitle.toLowerCase().split(/\s+/).some((w) => w.length > 3 && lower.includes(w));
      })
      .slice(0, 3)
      .join(" ")
      .trim();
    if (relevant.length > 80) return relevant;
  }

  const ch = chapterTitle.toLowerCase();
  const t = topic.toLowerCase();
  const aud = targetAudience.toLowerCase();
  return `This chapter explores ${ch} within the broader context of ${t}, providing ${aud} with the concepts, tools, and practical knowledge needed to apply what they learn. It covers the key principles, real-world applications, and common pitfalls associated with ${ch}, giving readers a solid foundation before moving to more advanced material.`;
}

function extractLearningObjectives(
  chapterTitle: string,
  topic: string,
  targetAudience: string
): string[] {
  const ch = chapterTitle.toLowerCase();
  const t = topic.toLowerCase();
  return [
    `Define and explain the core concepts of ${ch} in the context of ${t}`,
    `Identify the key principles that underpin ${ch}`,
    `Apply ${ch} techniques to real-world ${t} scenarios`,
    `Evaluate common approaches to ${ch} and understand their trade-offs`,
    `Avoid the most frequent mistakes practitioners make with ${ch}`,
    `Build a practical action plan for implementing ${ch} strategies`,
  ];
}

function extractKeyConcepts(
  chapterTitle: string,
  results: TavilyResult[]
): string[] {
  const titleWords = chapterTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const freq: Record<string, number> = {};

  for (const result of results) {
    const text = (result.title + " " + result.content).toLowerCase();
    const phrases = text.match(/\b[a-z][a-z\s-]{4,35}\b/g) ?? [];
    for (const phrase of phrases) {
      const trimmed = phrase.trim().replace(/\s+/g, " ");
      const words = trimmed.split(" ");
      if (words.length >= 1 && words.length <= 4) {
        if (titleWords.some((w) => trimmed.includes(w))) {
          freq[trimmed] = (freq[trimmed] ?? 0) + 1;
        }
      }
    }
  }

  const candidates = Object.entries(freq)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k.replace(/\b\w/g, (c) => c.toUpperCase()));

  const unique = [...new Set(candidates)].slice(0, 8);

  if (unique.length >= 5) return unique;

  // Structural fallback
  const ch = chapterTitle.replace(/\b\w/g, (c) => c.toUpperCase());
  return [
    `${ch} Fundamentals`,
    `Core ${ch} Principles`,
    `${ch} Terminology`,
    `${ch} Best Practices`,
    `${ch} Measurement and Evaluation`,
    `${ch} Tools and Resources`,
  ];
}

function extractImportantSubtopics(
  chapterTitle: string,
  topic: string,
  results: TavilyResult[]
): string[] {
  const titleWords = chapterTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const seen = new Set<string>();
  const subtopics: string[] = [];

  for (const result of results) {
    const text = (result.title + " " + result.content).toLowerCase();
    const phrases = text.match(/\b[a-z][a-z\s-]{8,40}\b/g) ?? [];
    for (const phrase of phrases) {
      const trimmed = phrase.trim().replace(/\s+/g, " ");
      const words = trimmed.split(" ");
      if (
        words.length >= 2 &&
        words.length <= 5 &&
        !seen.has(trimmed) &&
        titleWords.some((w) => trimmed.includes(w))
      ) {
        seen.add(trimmed);
        subtopics.push(trimmed.replace(/\b\w/g, (c) => c.toUpperCase()));
      }
    }
    if (subtopics.length >= 8) break;
  }

  if (subtopics.length >= 4) return subtopics.slice(0, 6);

  const ch = chapterTitle.replace(/\b\w/g, (c) => c.toUpperCase());
  const t = topic.replace(/\b\w/g, (c) => c.toUpperCase());
  return [
    `Introduction to ${ch}`,
    `${ch} in ${t} Practice`,
    `${ch} Tools and Techniques`,
    `Measuring ${ch} Effectiveness`,
    `${ch} Case Studies`,
    `Common ${ch} Challenges`,
  ];
}

function extractStatistics(results: TavilyResult[]): ChapterStatistic[] {
  const stats: ChapterStatistic[] = [];
  const statPattern = /[\d]+(?:\.\d+)?[\s]*(?:%|percent|million|billion|thousand|x|times)\s+[a-z][^.!?]{10,100}/gi;

  for (const result of results) {
    const matches = result.content.match(statPattern) ?? [];
    for (const match of matches) {
      const fact = match.trim().replace(/\s+/g, " ");
      if (fact.length >= 20 && fact.length <= 160 && stats.length < 6) {
        const source = result.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] ?? result.url;
        if (!stats.some((s) => s.fact.toLowerCase().slice(0, 30) === fact.toLowerCase().slice(0, 30))) {
          stats.push({ fact: fact.charAt(0).toUpperCase() + fact.slice(1), source });
        }
      }
    }
  }

  return stats.slice(0, 5);
}

function extractCaseStudies(
  chapterTitle: string,
  results: TavilyResult[]
): ChapterCaseStudy[] {
  const cases: ChapterCaseStudy[] = [];
  const titleWords = chapterTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

  for (const result of results) {
    const isCaseStudy =
      /case stud|example|success stor|how .+ use|result/i.test(result.title + result.content);
    const isRelevant = titleWords.some((w) => result.content.toLowerCase().includes(w));

    if (isCaseStudy && isRelevant) {
      const sentences = result.content
        .split(/(?<=[.!?])\s+/)
        .filter((s) => s.length > 40 && s.length < 300);

      if (sentences.length >= 2) {
        const summary = sentences.slice(0, 2).join(" ").replace(/\s+/g, " ").trim();
        const title = result.title.replace(/\s*[-|:].*/g, "").trim();
        if (!cases.some((c) => c.title === title)) {
          cases.push({ title, summary });
        }
      }
    }
    if (cases.length >= 3) break;
  }

  if (cases.length < 2) {
    const ch = chapterTitle.replace(/\b\w/g, (c) => c.toUpperCase());
    cases.push({
      title: `Real-World Application of ${ch}`,
      summary: `This section presents a worked example showing how ${chapterTitle.toLowerCase()} is applied in a real organisational or professional context, highlighting the decisions made, results achieved, and lessons learned.`,
    });
  }

  return cases.slice(0, 3);
}

function extractIndustryTrends(results: TavilyResult[], chapterTitle: string): string[] {
  const trendKeywords = ["trend", "growing", "increasing", "emerging", "shift", "future", "latest", "2024", "2025", "2026"];
  const trends: string[] = [];
  const titleWords = chapterTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

  for (const result of results) {
    const sentences = result.content.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (
        trendKeywords.some((k) => lower.includes(k)) &&
        titleWords.some((w) => lower.includes(w)) &&
        sentence.length > 40 &&
        sentence.length < 220
      ) {
        const clean = sentence.trim().replace(/\s+/g, " ");
        if (!trends.some((t) => t.toLowerCase().slice(0, 25) === clean.toLowerCase().slice(0, 25))) {
          trends.push(clean);
        }
      }
    }
    if (trends.length >= 5) break;
  }

  if (trends.length < 3) {
    const ch = chapterTitle.toLowerCase();
    return [
      `Increasing adoption of AI-assisted tools is reshaping how practitioners approach ${ch}`,
      `Demand for measurable, data-driven results is raising the bar for ${ch} effectiveness`,
      `Personalisation and audience segmentation are becoming standard expectations in ${ch}`,
      `Remote and distributed teams are changing how ${ch} is planned and executed`,
    ];
  }

  return trends.slice(0, 5);
}

function extractExpertInsights(results: TavilyResult[], chapterTitle: string): string[] {
  const quotePatterns = [
    /"([^"]{40,200})"/g,
    /(?:according to|says|notes|argues|explains|writes|recommends)\s+[^.]{10,30}[:,]\s+([^.]{40,200}\.)/gi,
  ];
  const insights: string[] = [];
  const titleWords = chapterTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

  for (const result of results) {
    if (!titleWords.some((w) => result.content.toLowerCase().includes(w))) continue;
    for (const pattern of quotePatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(result.content)) !== null) {
        const insight = (match[1] ?? match[0]).trim().replace(/\s+/g, " ");
        if (
          insight.length >= 50 &&
          insight.length <= 280 &&
          !insights.some((i) => i.toLowerCase().slice(0, 30) === insight.toLowerCase().slice(0, 30))
        ) {
          insights.push(insight);
        }
        if (insights.length >= 5) break;
      }
      if (insights.length >= 5) break;
    }
    if (insights.length >= 5) break;
  }

  if (insights.length < 3) {
    const ch = chapterTitle.toLowerCase();
    return [
      `The most effective practitioners of ${ch} focus relentlessly on outcomes rather than outputs — measuring what matters instead of what is easy to count.`,
      `Consistency beats perfection in ${ch}. A repeatable, documented process that is executed reliably will outperform an elaborate strategy that is never fully implemented.`,
      `The biggest barrier to success with ${ch} is not a lack of knowledge — it is the gap between understanding and consistent execution.`,
    ];
  }

  return insights.slice(0, 5);
}

function extractCommonMistakes(results: TavilyResult[], chapterTitle: string): string[] {
  const mistakeKeywords = ["mistake", "error", "avoid", "pitfall", "wrong", "don't", "common problem", "fail", "issue", "challenge"];
  const mistakes: string[] = [];
  const titleWords = chapterTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

  for (const result of results) {
    const sentences = result.content.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (
        mistakeKeywords.some((k) => lower.includes(k)) &&
        titleWords.some((w) => lower.includes(w)) &&
        sentence.length > 35 &&
        sentence.length < 220
      ) {
        const clean = sentence.trim().replace(/\s+/g, " ");
        if (!mistakes.some((m) => m.toLowerCase().slice(0, 25) === clean.toLowerCase().slice(0, 25))) {
          mistakes.push(clean);
        }
      }
    }
    if (mistakes.length >= 6) break;
  }

  if (mistakes.length < 3) {
    const ch = chapterTitle.toLowerCase();
    return [
      `Skipping the planning phase and jumping straight into execution without a clear ${ch} strategy`,
      `Trying to do too much at once — spreading effort across too many ${ch} tactics instead of mastering a few`,
      `Failing to measure results and iterate — treating ${ch} as a one-time project instead of an ongoing process`,
      `Ignoring the target audience's needs and creating ${ch} content or approaches that don't resonate`,
      `Underestimating the time and resources required to execute ${ch} consistently at a professional level`,
      `Copying competitors without understanding the underlying ${ch} principles that make their approach work`,
    ];
  }

  return mistakes.slice(0, 6);
}

function buildActionSteps(chapterTitle: string, topic: string, targetAudience: string): string[] {
  const ch = chapterTitle.toLowerCase();
  const t = topic.toLowerCase();
  return [
    `Audit your current approach to ${ch} — document what you are doing now and where the gaps are`,
    `Define your primary goal for ${ch} in the context of your ${t} strategy — be specific and measurable`,
    `Research 3-5 leading examples of ${ch} done well in your industry and note what makes them effective`,
    `Choose one ${ch} technique from this chapter and implement it this week — start small and iterate`,
    `Set up a simple tracking system to measure the results of your ${ch} efforts over the next 30 days`,
    `Share your ${ch} plan with a peer or mentor for feedback before full implementation`,
    `Schedule a monthly review to assess your ${ch} results and adjust your approach based on data`,
  ];
}

function buildRecommendedExamples(results: TavilyResult[], chapterTitle: string, topic: string): string[] {
  const examples: string[] = [];
  const titleWords = chapterTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const companyPattern = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\s+(?:used|implemented|launched|built|created|developed|grew|increased)/g;

  for (const result of results) {
    if (!titleWords.some((w) => result.content.toLowerCase().includes(w))) continue;
    let match: RegExpExecArray | null;
    while ((match = companyPattern.exec(result.content)) !== null) {
      const example = match[0].trim().replace(/\s+/g, " ");
      if (example.length >= 20 && example.length <= 100) {
        examples.push(`${example} — a real-world example of ${chapterTitle.toLowerCase()} in action`);
      }
      if (examples.length >= 4) break;
    }
    if (examples.length >= 4) break;
  }

  if (examples.length < 3) {
    const ch = chapterTitle.replace(/\b\w/g, (c) => c.toUpperCase());
    const t = topic.replace(/\b\w/g, (c) => c.toUpperCase());
    return [
      `A B2B company using ${ch} to generate leads — walk through their process, tools, and measurable results`,
      `A solopreneur or small business applying ${ch} with limited resources — emphasising efficiency and ROI`,
      `An industry-leading brand's approach to ${ch} — what they do, why it works, and what readers can adapt`,
      `A before-and-after transformation story showing how ${ch} changed outcomes for a ${t} practitioner`,
    ];
  }

  return [...new Set(examples)].slice(0, 5);
}

function buildRecommendedFrameworks(results: TavilyResult[], chapterTitle: string): string[] {
  const frameworkKeywords = [
    "framework", "model", "matrix", "method", "approach", "system", "process", "strategy", "formula", "funnel",
  ];
  const frameworks: string[] = [];
  const titleWords = chapterTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const namedFrameworkPattern = /\b([A-Z]{2,10}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:framework|model|method|matrix|approach|system)/g;

  for (const result of results) {
    if (!titleWords.some((w) => (result.title + result.content).toLowerCase().includes(w))) continue;
    let match: RegExpExecArray | null;
    while ((match = namedFrameworkPattern.exec(result.content)) !== null) {
      const fw = match[0].trim();
      if (fw.length >= 8 && fw.length <= 60 && !frameworks.includes(fw)) {
        frameworks.push(fw);
      }
      if (frameworks.length >= 4) break;
    }
    if (frameworks.length >= 4) break;
  }

  if (frameworks.length < 2) {
    const ch = chapterTitle.replace(/\b\w/g, (c) => c.toUpperCase());
    return [
      `The Plan-Do-Check-Act (PDCA) cycle applied to ${ch} — a repeatable improvement loop`,
      `A ${ch} audit framework — assess current state, identify gaps, prioritise actions`,
      `The 80/20 principle for ${ch} — identify the 20% of efforts producing 80% of results`,
      `A ${ch} measurement framework — inputs, activities, outputs, outcomes`,
    ];
  }

  return frameworks.slice(0, 4);
}

function extractSources(results: TavilyResult[]): string[] {
  return [...new Set(results.map((r) => r.url))].slice(0, 8);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function researchChapter(
  topic: string,
  chapterTitle: string,
  targetAudience: string
): Promise<ChapterResearchResult> {
  logger.info({ topic, chapterTitle, targetAudience }, "Starting chapter research");

  const [statsData, casesData, frameworksData, crossrefItems] = await Promise.all([
    tavilySearch(`"${chapterTitle}" "${topic}" data statistics trends research`, 8),
    tavilySearch(`"${chapterTitle}" "${topic}" case study example expert insight`, 8),
    tavilySearch(`"${chapterTitle}" "${topic}" framework best practice mistake avoid`, 8),
    crossrefSearch(`${topic} ${chapterTitle}`, 6),
  ]);

  const allResults = [...statsData.results, ...casesData.results, ...frameworksData.results];

  const summary = buildSummary(chapterTitle, topic, targetAudience, [
    statsData.answer,
    casesData.answer,
  ]);

  logger.info({ topic, chapterTitle }, "Chapter research complete");

  return {
    chapter_title: chapterTitle,
    summary,
    learning_objectives: extractLearningObjectives(chapterTitle, topic, targetAudience),
    key_concepts: extractKeyConcepts(chapterTitle, allResults),
    important_subtopics: extractImportantSubtopics(chapterTitle, topic, allResults),
    industry_trends: extractIndustryTrends(allResults, chapterTitle),
    statistics: extractStatistics(allResults),
    case_studies: extractCaseStudies(chapterTitle, casesData.results),
    expert_insights: extractExpertInsights(allResults, chapterTitle),
    common_mistakes: extractCommonMistakes(allResults, chapterTitle),
    action_steps: buildActionSteps(chapterTitle, topic, targetAudience),
    recommended_examples: buildRecommendedExamples(casesData.results, chapterTitle, topic),
    recommended_frameworks: buildRecommendedFrameworks(frameworksData.results, chapterTitle),
    academic_references: crossrefItems.map(toApa),
    sources: extractSources(allResults),
  };
}
