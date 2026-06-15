import { logger } from "./logger";

const TAVILY_API_URL = "https://api.tavily.com/search";

// ── Types ─────────────────────────────────────────────────────────────────────

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

export type BookLength = "5000-10000" | "10000-20000" | "20000-50000" | "50000-75000" | "75000+";
export type BookType = "ebook" | "nonfiction" | "training_manual";

export interface OutlineChapter {
  chapter_number: number;
  chapter_title: string;
  objective: string;
  key_topics: string[];
  estimated_words: number;
}

export interface OutlineResult {
  topic: string;
  recommended_title: string;
  subtitle_options: string[];
  recommended_structure: string;
  reader_transformation: string;
  book_promise: string;
  chapters: OutlineChapter[];
  total_estimated_words: number;
  recommended_resources: string[];
}

// ── Length config ─────────────────────────────────────────────────────────────

interface LengthConfig {
  target: number;
  chapterCount: number;
  introWords: number;
  coreWords: number;
  conclusionWords: number;
}

const LENGTH_CONFIG: Record<BookLength, LengthConfig> = {
  "5000-10000":  { target: 7500,  chapterCount: 6,  introWords: 600,  coreWords: 1100, conclusionWords: 600  },
  "10000-20000": { target: 15000, chapterCount: 10, introWords: 900,  coreWords: 1600, conclusionWords: 800  },
  "20000-50000": { target: 35000, chapterCount: 14, introWords: 1500, coreWords: 2600, conclusionWords: 1200 },
  "50000-75000": { target: 62500, chapterCount: 20, introWords: 2000, coreWords: 3200, conclusionWords: 1500 },
  "75000+":      { target: 85000, chapterCount: 26, introWords: 2500, coreWords: 3400, conclusionWords: 2000 },
};

// ── Tavily ────────────────────────────────────────────────────────────────────

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

// ── Title ─────────────────────────────────────────────────────────────────────

function buildRecommendedTitle(
  topic: string,
  bookType: BookType,
  targetAudience: string,
  results: TavilyResult[]
): string {
  const t = topic.replace(/\b\w/g, (c) => c.toUpperCase());
  const isBeginner = /beginner|starter|novice|new to|introduc/i.test(targetAudience);
  const isExpert   = /advanced|expert|professional|senior/i.test(targetAudience);
  const hasStrategy = results.some((r) => /strateg|blueprint|framework|system/i.test(r.title));
  const hasPractical = results.some((r) => /practical|hands.on|step.by.step/i.test(r.title));

  if (bookType === "training_manual") return `The Complete ${t} Training Program`;
  if (bookType === "nonfiction" && hasStrategy) return `The ${t} Advantage`;
  if (bookType === "nonfiction") return `Rethinking ${t}`;
  if (isBeginner) return `${t} for Beginners`;
  if (isExpert && hasPractical) return `Mastering ${t}`;
  if (hasPractical) return `The Practical ${t} Guide`;
  return `The Complete Guide to ${t}`;
}

// ── Subtitles ─────────────────────────────────────────────────────────────────

function buildSubtitleOptions(
  topic: string,
  bookType: BookType,
  targetAudience: string,
  length: BookLength
): string[] {
  const t = topic.replace(/\b\w/g, (c) => c.toUpperCase());
  const aud = targetAudience.replace(/\b\w/g, (c) => c.toUpperCase());
  const depthWord = ["50000-75000", "75000+"].includes(length) ? "Comprehensive" : ["20000-50000"].includes(length) ? "Complete" : "Essential";
  const depth = depthWord;
  const aOrAn = /^[AEIOU]/i.test(depth) ? "An" : "A";

  if (bookType === "training_manual") {
    return [
      `${aOrAn} Structured ${depth} Learning Program for ${aud}`,
      `Skills, Exercises, and Real-World Application for ${aud}`,
      `From Foundations to Mastery — A Practical Program for ${aud}`,
      `${depth} Training with Exercises, Assessments, and Actionable Frameworks`,
      `The Step-by-Step ${t} Program for ${aud}`,
    ];
  }
  if (bookType === "nonfiction") {
    return [
      `What Every ${aud} Needs to Know About ${t}`,
      `The Research-Backed Guide to ${t} for ${aud}`,
      `Proven Strategies, Expert Insights, and Real-World Frameworks for ${aud}`,
      `How ${aud} Are Using ${t} to Get Better Results`,
      `The ${depth} ${t} Resource for Ambitious ${aud}`,
    ];
  }
  return [
    `${aOrAn} ${depth} Step-by-Step Guide for ${aud}`,
    `Everything ${aud} Need to Know to Get Results with ${t}`,
    `Proven Strategies, Tools, and Frameworks for ${aud}`,
    `From Zero to Confident: The ${t} Roadmap for ${aud}`,
    `The No-Fluff ${t} Guide for Busy ${aud}`,
  ];
}

// ── Structure ─────────────────────────────────────────────────────────────────

function buildRecommendedStructure(
  bookType: BookType,
  length: BookLength,
  chapterCount: number
): string {
  const core = chapterCount - 2; // subtract intro + conclusion

  if (bookType === "training_manual") {
    const modules = core;
    return `Program Overview (1 chapter) + ${modules} Training Modules + Capstone Assessment + Appendix. Each module builds on the last, with exercises and reflection prompts throughout. Designed for linear progression from foundational skills to advanced application.`;
  }

  if (bookType === "nonfiction") {
    if (chapterCount >= 18) {
      const partA = Math.ceil(core / 2);
      const partB = core - partA;
      return `Introduction + Part I: Foundations (${partA} chapters) + Part II: Advanced Application (${partB} chapters) + Conclusion. Each part opens with a brief overview and closes with a summary of key insights.`;
    }
    return `Introduction + ${core} Content Chapters + Conclusion. Structured as a logical argument — each chapter builds the case for the book's central thesis with evidence, examples, and expert perspectives.`;
  }

  // ebook
  if (chapterCount <= 8) {
    return `Introduction + ${core} Core Chapters + Conclusion. Lean, practical structure — each chapter covers one actionable concept the reader can implement immediately.`;
  }
  return `Introduction + ${core} Content Chapters + Conclusion. Progressive structure — early chapters build foundational knowledge, middle chapters go deep on tactics and tools, final chapters focus on optimisation and next steps.`;
}

// ── Transformation & Promise ──────────────────────────────────────────────────

function buildReaderTransformation(
  topic: string,
  bookType: BookType,
  targetAudience: string
): string {
  const t = topic.toLowerCase();
  const aud = targetAudience.toLowerCase();

  if (bookType === "training_manual") {
    return `Before this program, ${aud} lack the structured skills and confidence to apply ${t} in professional settings. After completing it, they will have hands-on competency, a repeatable framework, and the ability to execute ${t} independently from day one.`;
  }
  const isBeginner = /beginner|starter|novice|new to/i.test(aud);
  if (isBeginner) {
    return `Before reading, ${aud} feel overwhelmed by ${t} and unsure where to start. After reading, they will have a clear mental model, practical first steps, and the confidence to take action without second-guessing themselves.`;
  }
  return `Before reading, ${aud} understand ${t} at a surface level but lack a consistent, results-driven approach. After reading, they will have a proven system they can apply immediately to get measurable outcomes.`;
}

function buildBookPromise(topic: string, bookType: BookType, targetAudience: string): string {
  const t = topic.toLowerCase();
  const aud = targetAudience.toLowerCase();

  if (bookType === "training_manual") {
    return `This program gives ${aud} a structured, step-by-step path to mastering ${t} — with the skills, exercises, and real-world application needed to perform confidently from day one.`;
  }
  return `This book gives ${aud} a clear, research-backed roadmap for ${t} — so they can stop guessing and start getting consistent, measurable results.`;
}

// ── Chapter titles ────────────────────────────────────────────────────────────

function generateChapterTitles(
  topic: string,
  bookType: BookType,
  targetAudience: string,
  count: number
): string[] {
  const t = topic.replace(/\b\w/g, (c) => c.toUpperCase());
  const isBeginner = /beginner|starter|novice|new to/i.test(targetAudience);

  const ebook = [
    isBeginner ? `What Is ${t}? A Beginner's Introduction` : `Introduction: Why ${t} Matters Now`,
    `The Fundamentals of ${t}`,
    isBeginner ? `Your First Steps in ${t}: No Experience Needed` : `Getting Started with ${t}`,
    `Core Concepts and Terminology`,
    `Building Your ${t} Strategy`,
    `Essential Tools and Resources`,
    `Common Mistakes and How to Avoid Them`,
    `Putting It Into Practice`,
    `Advanced Techniques for Better Results`,
    `Measuring and Optimising Your ${t} Efforts`,
    `Real-World Examples and Case Studies`,
    `Scaling Your Approach`,
    `Troubleshooting and Problem Solving`,
    `Expert Tips and Insider Knowledge`,
    `The Future of ${t}`,
    `Your ${t} Action Plan`,
    `Next Steps and Continued Learning`,
    `Conclusion: The Road Ahead`,
    `Appendix: Key Resources and References`,
    `Appendix: Quick Reference Checklist`,
    `Appendix: Glossary of Key Terms`,
    `Appendix: Recommended Reading`,
    `Appendix: Tools and Templates`,
    `Appendix: Worksheets`,
    `Appendix: FAQs`,
    `Appendix: Index`,
  ];

  const nonfiction = [
    `Introduction: The Case for ${t}`,
    `Defining ${t}: What It Really Means`,
    `The Origins and Evolution of ${t}`,
    `The Research Behind ${t}`,
    `Key Principles That Drive Success`,
    `The Human Element: Who Excels and Why`,
    `Frameworks for Thinking About ${t}`,
    `Myths, Misconceptions, and Hard Truths`,
    `What Experts Know That Others Don't`,
    `Case Studies: Lessons from the Field`,
    `Applying ${t} in Practice`,
    `Challenges, Controversies, and Edge Cases`,
    `Measuring What Matters`,
    `${t} Across Industries and Contexts`,
    `The Bigger Picture: ${t} and Society`,
    `Common Mistakes and How to Avoid Them`,
    `The Future of ${t}: Trends and Predictions`,
    `A Roadmap for What Comes Next`,
    `Conclusion: The Bigger Takeaway`,
    `Appendix: Key Data and Research`,
    `Appendix: Further Reading`,
    `Appendix: Expert Interviews`,
    `Appendix: Glossary`,
    `Appendix: Notes and References`,
    `Appendix: Index`,
    `Appendix: About the Research`,
  ];

  const training = [
    `Program Overview and Learning Outcomes`,
    `Module 1: Foundations of ${t}`,
    `Module 2: Core Concepts and Terminology`,
    `Module 3: Essential Skills — Part I`,
    `Module 4: Essential Skills — Part II`,
    `Module 5: Practical Application`,
    `Module 6: Hands-On Exercises and Drills`,
    `Module 7: Advanced Techniques`,
    `Module 8: Real-World Scenarios`,
    `Module 9: Common Errors and Quality Control`,
    `Module 10: Integration and Workflow`,
    `Module 11: Performance Review and Feedback`,
    `Module 12: Capstone Project`,
    `Module 13: Specialisation — Track A`,
    `Module 14: Specialisation — Track B`,
    `Module 15: Leadership and Strategy`,
    `Module 16: Scaling and Systems`,
    `Module 17: Advanced Problem Solving`,
    `Module 18: Peer Review and Collaboration`,
    `Module 19: Final Assessment Preparation`,
    `Capstone Assessment and Certification Guidelines`,
    `Appendix A: Quick Reference Guide`,
    `Appendix B: Glossary`,
    `Appendix C: Worksheets and Templates`,
    `Appendix D: Recommended Reading`,
    `Appendix E: Tools and Software Guide`,
  ];

  const pool = bookType === "training_manual" ? training : bookType === "nonfiction" ? nonfiction : ebook;
  return pool.slice(0, count);
}

// ── Key topics per chapter ────────────────────────────────────────────────────

function buildKeyTopics(
  chapterTitle: string,
  topic: string,
  results: TavilyResult[],
  chapterIndex: number,
  totalChapters: number
): string[] {
  const titleWords = chapterTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  const topicWords = topic.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

  // Pull phrases from research that overlap with this chapter title
  const phrases: string[] = [];
  for (const result of results) {
    const text = (result.title + " " + result.content).toLowerCase();
    const found = text.match(/\b[a-z][a-z\s-]{6,35}\b/g) ?? [];
    for (const phrase of found) {
      const trimmed = phrase.trim().replace(/\s+/g, " ");
      const words = trimmed.split(" ");
      if (
        words.length >= 2 &&
        words.length <= 5 &&
        (titleWords.some((w) => trimmed.includes(w)) || topicWords.some((w) => trimmed.includes(w)))
      ) {
        phrases.push(trimmed.replace(/\b\w/g, (c) => c.toUpperCase()));
      }
    }
    if (phrases.length >= 10) break;
  }

  const unique = [...new Set(phrases)].slice(0, 4);
  if (unique.length >= 3) return unique;

  // Structural fallback
  const ch = chapterTitle.replace(/\b\w/g, (c) => c.toUpperCase());
  const t = topic.replace(/\b\w/g, (c) => c.toUpperCase());
  const isFirst = chapterIndex === 0;
  const isLast = chapterIndex === totalChapters - 1;

  if (isFirst) return [`Why ${t} Matters`, `What This Book Covers`, `How to Get the Most From This Guide`, `Setting Expectations`];
  if (isLast) return [`Key Takeaways`, `Your Action Plan`, `Next Steps`, `Further Learning Resources`];
  return [`${ch} Fundamentals`, `Key Principles`, `Common Approaches`, `Practical Application`];
}

// ── Chapter objective ─────────────────────────────────────────────────────────

function buildObjective(
  chapterTitle: string,
  topic: string,
  chapterIndex: number,
  totalChapters: number
): string {
  const ch = chapterTitle.toLowerCase().replace(/^(module \d+:?\s*|appendix [a-z]:?\s*)/i, "").trim();
  const t = topic.toLowerCase();
  const isFirst = chapterIndex === 0;
  const isLast = chapterIndex === totalChapters - 1;

  if (isFirst) return `Establish why ${t} matters, introduce the book's structure, and give readers a clear picture of what they will know and be able to do by the end.`;
  if (isLast) return `Consolidate everything covered in the book, give readers a concrete action plan to implement, and map out their path forward in ${t}.`;
  return `By the end of this chapter, readers will be able to apply ${ch} concepts confidently within their ${t} practice and understand how this topic connects to the book's broader framework.`;
}

// ── Word count per chapter ────────────────────────────────────────────────────

function distributeWords(config: LengthConfig, totalChapters: number): number[] {
  const { introWords, coreWords, conclusionWords } = config;
  const coreCount = totalChapters - 2;
  const words: number[] = [];

  words.push(introWords);
  for (let i = 0; i < coreCount; i++) {
    // vary slightly around coreWords so chapters don't look identical
    const variance = Math.round((((i % 3) - 1) * coreWords) / 12);
    words.push(coreWords + variance);
  }
  words.push(conclusionWords);

  return words;
}

// ── Recommended resources ─────────────────────────────────────────────────────

function buildRecommendedResources(
  topic: string,
  bookType: BookType,
  results: TavilyResult[]
): string[] {
  const t = topic.replace(/\b\w/g, (c) => c.toUpperCase());

  // Pull book/resource titles from research
  const fromResearch: string[] = [];
  const bookPattern = /(?:book|guide|handbook|manual|resource):\s*"?([^".]{10,80})"?/gi;
  for (const result of results) {
    let match: RegExpExecArray | null;
    while ((match = bookPattern.exec(result.content)) !== null) {
      const title = match[1]?.trim();
      if (title && fromResearch.length < 3) fromResearch.push(`"${title}" — referenced in research`);
    }
    if (fromResearch.length >= 3) break;
  }

  const structural: string[] = [];

  if (bookType === "training_manual") {
    structural.push(
      `Industry certification body or professional association for ${t} — for standards, terminology, and credentialing information`,
      `Learning management system (LMS) documentation — for understanding how training content is consumed and assessed`,
      `Bloom's Taxonomy — for writing clear, measurable learning objectives for each module`,
      `Kirkpatrick's Four Levels of Training Evaluation — for designing assessments and measuring learning outcomes`,
      `Subject-matter experts in ${t} — interview practitioners for real-world examples and current best practices`
    );
  } else if (bookType === "nonfiction") {
    structural.push(
      `Academic databases (Google Scholar, JSTOR, PubMed) — for peer-reviewed research and data on ${t}`,
      `Industry reports from Statista, IBISWorld, or McKinsey — for market-size data and trend analysis`,
      `Biographies and interviews of leading ${t} practitioners — for first-person insight and case study material`,
      `Government or NGO publications relevant to ${t} — for regulatory context and authoritative statistics`,
      `Podcast episodes and conference talks by ${t} experts — for contemporary expert opinion`
    );
  } else {
    structural.push(
      `Top 3-5 bestselling books on ${t} on Amazon — study their structure, tone, and reader reviews for positioning insights`,
      `Subreddits and online communities focused on ${t} — for understanding exactly how your audience talks about their problems`,
      `YouTube tutorials on ${t} — identify the most-watched topics to prioritise in your chapter structure`,
      `Free tools and software relevant to ${t} — readers will expect a curated toolkit section`,
      `Industry blogs and newsletters on ${t} — for current data, examples, and quotable expert commentary`
    );
  }

  return [...fromResearch, ...structural].slice(0, 7);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function buildOutline(
  topic: string,
  bookType: BookType,
  targetAudience: string,
  length: BookLength
): Promise<OutlineResult> {
  logger.info({ topic, bookType, targetAudience, length }, "Building book outline");

  const config = LENGTH_CONFIG[length];

  const [structureData, depthData] = await Promise.all([
    tavilySearch(`"${topic}" book outline table of contents ${bookType} structure`, 8),
    tavilySearch(`${topic} ${bookType} guide ${targetAudience} chapters topics`, 8),
  ]);

  const allResults = [...structureData.results, ...depthData.results];
  const chapterCount = config.chapterCount;
  const titles = generateChapterTitles(topic, bookType, targetAudience, chapterCount);
  const wordDistribution = distributeWords(config, chapterCount);

  const chapters: OutlineChapter[] = titles.map((title, idx) => ({
    chapter_number: idx + 1,
    chapter_title: title,
    objective: buildObjective(title, topic, idx, chapterCount),
    key_topics: buildKeyTopics(title, topic, allResults, idx, chapterCount),
    estimated_words: wordDistribution[idx] ?? config.coreWords,
  }));

  const totalEstimatedWords = chapters.reduce((sum, ch) => sum + ch.estimated_words, 0);

  logger.info({ topic, chapterCount, totalEstimatedWords }, "Outline complete");

  return {
    topic,
    recommended_title: buildRecommendedTitle(topic, bookType, targetAudience, allResults),
    subtitle_options: buildSubtitleOptions(topic, bookType, targetAudience, length),
    recommended_structure: buildRecommendedStructure(bookType, length, chapterCount),
    reader_transformation: buildReaderTransformation(topic, bookType, targetAudience),
    book_promise: buildBookPromise(topic, bookType, targetAudience),
    chapters,
    total_estimated_words: totalEstimatedWords,
    recommended_resources: buildRecommendedResources(topic, bookType, allResults),
  };
}
