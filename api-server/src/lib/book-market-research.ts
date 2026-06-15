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

export interface BookMarketResearchResult {
  market_demand: string;
  competition_level: string;
  target_audiences: string[];
  popular_subtopics: string[];
  content_gaps: string[];
  positioning_recommendations: string[];
  keyword_opportunities: string[];
  monetization_potential: string;
  recommended_positioning: string;
  recommended_angles: string[];
}

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

// ── market_demand ─────────────────────────────────────────────────────────────

function assessMarketDemand(results: TavilyResult[], answer?: string): string {
  const text = ((answer ?? "") + " " + results.map((r) => r.content).join(" ")).toLowerCase();

  const highSignals = ["growing demand", "increasing interest", "millions of readers", "bestseller", "trending", "high demand", "widely read", "large market", "billion dollar"];
  const lowSignals = ["niche", "limited audience", "small market", "declining", "outdated"];

  const high = highSignals.filter((s) => text.includes(s)).length;
  const low = lowSignals.filter((s) => text.includes(s)).length;

  // Try to pull a concrete market-size figure
  const sizeMatch = text.match(/[\d,.]+\s*(?:million|billion)\s+(?:copies|books|readers|market|dollars|revenue)/i);
  const sizeFact = sizeMatch ? ` Research references a market of ${sizeMatch[0].trim()}.` : "";

  if (high >= 3) return `High — strong, growing reader interest with a wide addressable audience.${sizeFact} Multiple established publishers compete in this space, confirming proven commercial demand.`;
  if (high >= 1 || low === 0) return `Moderate — steady interest from an engaged audience.${sizeFact} The topic has consistent search volume and reader activity without being oversaturated.`;
  return `Emerging — currently a niche or early-stage topic.${sizeFact} Demand exists but is building; an authoritative early entry could capture first-mover advantage.`;
}

// ── competition_level ─────────────────────────────────────────────────────────

function assessCompetition(amazonResults: TavilyResult[], topic: string): string {
  const topicLower = topic.toLowerCase();
  const directHits = amazonResults.filter(
    (r) =>
      (r.url.includes("amazon.com") || r.url.includes("goodreads.com")) &&
      r.title.toLowerCase().includes(topicLower)
  ).length;

  const indirectHits = amazonResults.filter(
    (r) =>
      r.url.includes("amazon.com") || r.url.includes("goodreads.com")
  ).length;

  const score = directHits * 2 + indirectHits;
  if (score >= 6) return "High — numerous established books cover this topic directly. Standing out requires a sharply differentiated angle, a specific sub-audience, or a stronger results-driven promise.";
  if (score >= 2) return "Moderate — some well-known books exist but the space is not saturated. Room for a differentiated approach, especially targeting an under-served reader segment.";
  return "Low — few books directly address this topic. Strong first-mover opportunity; a comprehensive, authoritative guide could quickly become the go-to resource.";
}

// ── target_audiences ──────────────────────────────────────────────────────────

function extractTargetAudiences(results: TavilyResult[], topic: string): string[] {
  const text = results.map((r) => r.content + " " + r.title).join(" ");

  const audiencePatterns: [RegExp, string][] = [
    [/beginner|new to|getting started|no experience|novice/i, `Beginners and newcomers exploring ${topic} for the first time`],
    [/professional|practitioner|working|career|job|employed/i, `Working professionals looking to deepen or formalise their ${topic} skills`],
    [/entrepreneur|founder|solopreneur|small business|startup/i, `Entrepreneurs and small business owners applying ${topic} to grow their ventures`],
    [/student|university|college|graduate|academic/i, `Students and academics studying ${topic} as part of their education`],
    [/manager|leader|executive|director|senior/i, `Managers and leaders wanting to apply ${topic} strategically within their organisations`],
    [/freelancer|consultant|independent|self.employed/i, `Freelancers and consultants using ${topic} to serve clients or market their services`],
    [/hobbyist|enthusiast|passion|personal|interest/i, `Hobbyists and enthusiasts pursuing ${topic} for personal growth or enjoyment`],
  ];

  const found: string[] = [];
  for (const [pattern, label] of audiencePatterns) {
    if (pattern.test(text)) found.push(label);
  }

  // Always guarantee at least 3 audiences
  const fallbacks = [
    `Beginners who want a clear, structured introduction to ${topic}`,
    `Intermediate practitioners looking to fill knowledge gaps in ${topic}`,
    `Professionals seeking a practical, results-focused ${topic} resource`,
    `Anyone making a career change or pivot that involves ${topic}`,
  ];

  const merged = [...new Set([...found, ...fallbacks])];
  return merged.slice(0, 6);
}

// ── popular_subtopics ─────────────────────────────────────────────────────────

function extractPopularSubtopics(results: TavilyResult[], topic: string): string[] {
  const topicWords = new Set(topic.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const freq: Record<string, number> = {};

  for (const result of results) {
    const text = (result.title + " " + result.content).toLowerCase();
    const phrases = text.match(/\b[a-z][a-z\s]{6,35}\b/g) ?? [];
    for (const phrase of phrases) {
      const trimmed = phrase.trim().replace(/\s+/g, " ");
      const words = trimmed.split(" ");
      if (words.length < 2 || words.length > 5) continue;
      if (words.some((w) => topicWords.has(w))) continue; // exclude topic itself
      freq[trimmed] = (freq[trimmed] ?? 0) + 1;
    }
  }

  const candidates = Object.entries(freq)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([phrase]) => phrase.replace(/\b\w/g, (c) => c.toUpperCase()))
    .filter((p) => p.split(" ").length >= 2);

  const unique = [...new Set(candidates)].slice(0, 8);

  if (unique.length >= 4) return unique;

  // Fallback structured subtopics
  const t = topic.replace(/\b\w/g, (c) => c.toUpperCase());
  return [
    `${t} Fundamentals and Core Principles`,
    `${t} Tools and Software`,
    `${t} Strategy and Planning`,
    `${t} Case Studies and Real-World Examples`,
    `${t} Metrics and Performance Measurement`,
    `${t} Common Mistakes and Pitfalls`,
    `${t} Advanced Techniques`,
    `${t} Trends and Future Outlook`,
  ].slice(0, 8);
}

// ── content_gaps ──────────────────────────────────────────────────────────────

function identifyContentGaps(
  demandResults: TavilyResult[],
  competitionResults: TavilyResult[],
  topic: string
): string[] {
  const t = topic.replace(/\b\w/g, (c) => c.toUpperCase());
  const competitionText = competitionResults.map((r) => r.content + r.title).join(" ").toLowerCase();
  const demandText = demandResults.map((r) => r.content + r.title).join(" ").toLowerCase();

  const gaps: string[] = [];

  // Check what existing books don't appear to cover well
  if (!/case stud|real.world example|practical example/i.test(competitionText)) {
    gaps.push(`Lack of real-world case studies and worked examples — most existing books on ${t} stay theoretical`);
  }
  if (!/beginner|start from scratch|no experience|absolute beginner/i.test(competitionText)) {
    gaps.push(`No truly beginner-friendly entry point — existing books assume prior knowledge of ${t}`);
  }
  if (!/2024|2025|2026|current|latest|up.to.date|modern/i.test(competitionText)) {
    gaps.push(`Outdated content — existing resources haven't been updated to reflect the latest developments in ${t}`);
  }
  if (!/action|exercise|worksheet|template|checklist|tool/i.test(competitionText)) {
    gaps.push(`No actionable frameworks or tools — readers lack templates, checklists, or exercises they can apply immediately`);
  }
  if (!/small business|solopreneur|freelancer|independent/i.test(competitionText)) {
    gaps.push(`Underserved solo and small business audience — existing ${t} books focus on enterprise contexts`);
  }
  if (!/measur|metric|KPI|track|result|ROI/i.test(competitionText)) {
    gaps.push(`Missing measurement guidance — no clear framework for tracking ${t} results or ROI`);
  }
  if (!/mistake|pitfall|avoid|wrong|common error/i.test(competitionText)) {
    gaps.push(`No failure-prevention content — readers have no guide to avoiding the most common ${t} mistakes`);
  }
  if (!/step.by.step|how to|practical guide|walkthrough/i.test(demandText)) {
    gaps.push(`Demand for step-by-step practical guidance that existing books haven't met`);
  }

  // Always return at least 4 gaps
  const fallbacks = [
    `Beginner-to-advanced pathway — no single book takes a reader from zero to confident practitioner in ${t}`,
    `Industry-specific applications — no book tailors ${t} advice to specific sectors or roles`,
    `Short, focused format — most ${t} books are long-winded; demand exists for a concise, actionable guide`,
    `Community and support component — no book on ${t} connects readers to a peer group or ongoing resources`,
  ];

  const merged = [...new Set([...gaps, ...fallbacks])];
  return merged.slice(0, 6);
}

// ── positioning_recommendations ───────────────────────────────────────────────

function buildPositioningRecommendations(
  topic: string,
  marketDemand: string,
  competitionLevel: string,
  targetAudiences: string[]
): string[] {
  const t = topic.replace(/\b\w/g, (c) => c.toUpperCase());
  const isHighDemand = marketDemand.startsWith("High");
  const isHighComp = competitionLevel.startsWith("High");
  const isLowComp = competitionLevel.startsWith("Low");
  const firstAudience = targetAudiences[0] ?? `readers new to ${t}`;

  const recommendations: string[] = [];

  if (isHighDemand && isHighComp) {
    recommendations.push(
      `Niche down hard — instead of "The Complete Guide to ${t}", target a specific audience segment (e.g. "${t} for Freelancers" or "${t} for Non-Technical Founders") to stand out from generic competitors`,
      `Lead with outcomes, not content — frame the book around a concrete result readers will achieve (e.g. "Land your first ${t} client in 30 days") rather than topics covered`,
      `Use social proof and case studies as a differentiator — readers in saturated markets trust books backed by real success stories over theoretical frameworks`
    );
  } else if (isHighDemand && isLowComp) {
    recommendations.push(
      `Move fast and position as the definitive resource — low competition and high demand means the first comprehensive, authoritative book on ${t} will own the category`,
      `Prioritise breadth and depth — readers have limited existing options, so a thorough A-to-Z guide will be more valuable than a niche-specific take`,
      `Use "The Complete Guide" or "The Definitive Guide" framing — category-defining language resonates when there is no established leader`
    );
  } else if (isLowComp) {
    recommendations.push(
      `Establish authority early — publish quickly and build a platform around the book to become the go-to name in ${t} before competition increases`,
      `Educate the market — readers may not yet know they need this book; position around the problem you solve, not the topic itself`,
      `Price at a premium — low competition allows higher price points; position as a specialist resource rather than a mass-market guide`
    );
  } else {
    recommendations.push(
      `Find the underserved sub-audience — research which reader type is poorly served by existing ${t} books and make them your primary target`,
      `Differentiate on format — if competitors write long, comprehensive guides, write a shorter, more actionable one (or vice versa)`,
      `Partner positioning — position the book alongside a course, community, or toolkit to increase perceived value beyond the book itself`
    );
  }

  recommendations.push(
    `Target "${firstAudience}" as the primary reader persona in all marketing copy, cover design, and subtitle framing`,
    `Use reader language, not expert language — mirror the exact words your target audience uses when they search for ${t} help online`
  );

  return recommendations.slice(0, 5);
}

// ── monetization_potential ────────────────────────────────────────────────────

function scoreMonetizationPotential(
  results: TavilyResult[],
  topic: string,
  competitionLevel: string
): string {
  const text = results.map((r) => r.content).join(" ").toLowerCase();
  const monetizationKeywords = [
    "high income", "salary", "revenue", "profitable", "career", "job",
    "certification", "course", "training", "business", "roi", "investment",
  ];
  const hits = monetizationKeywords.filter((k) => text.includes(k)).length;
  const isHighComp = competitionLevel.startsWith("High");

  if (hits >= 5 && !isHighComp)
    return "High — strong willingness to pay; topic has direct career, business, or financial value. Readers treat books on this topic as investments, supporting premium pricing ($20–$40+).";
  if (hits >= 3)
    return "Moderate — engaged audience with proven spending on learning materials. Standard ebook and print pricing ($10–$25) will be well-received; bundling with a course or toolkit increases revenue potential.";
  return "Niche — passionate community with targeted buying intent. Best monetised through premium pricing, a focused series, or pairing with coaching or community access rather than competing on price.";
}

// ── recommended_positioning ───────────────────────────────────────────────────

function buildRecommendedPositioning(
  topic: string,
  marketDemand: string,
  competitionLevel: string,
  targetAudiences: string[]
): string {
  const t = topic.replace(/\b\w/g, (c) => c.toUpperCase());
  const isHighDemand = marketDemand.startsWith("High");
  const isHighComp = competitionLevel.startsWith("High");
  const isLowComp = competitionLevel.startsWith("Low");
  const primaryAudience = targetAudiences[0] ?? `readers new to ${t}`;

  if (isHighDemand && isHighComp)
    return `${t} is a proven, high-demand category with significant competition. Position with a unique angle — a specific sub-niche, audience segment, or a results-driven framework competitors don't offer. Target "${primaryAudience}" explicitly in the subtitle and marketing copy. Emphasise practical outcomes over theory.`;
  if (isHighDemand && isLowComp)
    return `${t} shows strong demand with little direct competition — a strong first-mover opportunity. Move quickly with a comprehensive, authoritative guide. Focus on being the definitive resource and use category-owning language ("The Complete Guide", "The Definitive Playbook") to establish authority early.`;
  if (isHighComp)
    return `${t} is a saturated space. Differentiate sharply by targeting "${primaryAudience}" — an underserved segment — or combining ${t} with a complementary skill. A narrow, hyper-specific positioning will outperform a broad approach and avoid direct head-to-head competition with established titles.`;
  return `${t} is an emerging topic with room to establish authority early. Lead with education and credibility — position as the accessible, expert-authored entry point into this space. Target "${primaryAudience}" as the core reader and pair publication with a content marketing strategy to build an audience alongside the book.`;
}

// ── keyword_opportunities ─────────────────────────────────────────────────────

function extractKeywordOpportunities(results: TavilyResult[], topic: string): string[] {
  const base = topic.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const topicWords = topic.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

  // Modifiers that signal buyer/learner intent
  const modifiers = [
    "for beginners",
    "guide",
    "how to",
    "tips",
    "best practices",
    "step by step",
    "course",
    "training",
    "tutorial",
    "strategies",
    "tools",
    "examples",
    "2025",
  ];

  const generated = modifiers.map((mod) => `${base} ${mod}`);

  // Pull long-tail phrases from result titles that contain the topic
  const fromTitles = results
    .map((r) => r.title.replace(/\s*[-|:].*/g, "").trim())
    .filter((t) => topicWords.some((w) => t.toLowerCase().includes(w)))
    .map((t) => t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()))
    .filter((t) => t.length > topic.length + 4 && t.length < 80);

  return [...new Set([...generated, ...fromTitles])].slice(0, 12);
}

// ── recommended_angles ────────────────────────────────────────────────────────

function buildRecommendedAngles(results: TavilyResult[], topic: string): string[] {
  const t = topic.replace(/\b\w/g, (c) => c.toUpperCase());
  const text = results.map((r) => r.title + " " + r.content).join(" ");

  const hasPractical = /practical|hands.on|step.by.step|how.to/i.test(text);
  const hasStory = /story|case|success|journey|from zero/i.test(text);
  const hasData = /data|research|study|statistic|evidence|proven/i.test(text);
  const hasSystem = /system|framework|method|process|blueprint/i.test(text);

  return [
    hasPractical
      ? `The Practical Playbook: A step-by-step ${t} system with exercises, templates, and real-world application`
      : `The Step-by-Step Blueprint: A beginners' roadmap from zero to confident practitioner in ${t}`,
    hasStory
      ? `The Case Study Collection: Learn ${t} through documented real-world success stories and failures`
      : `The Beginner's Fast Track: Everything a newcomer needs to know about ${t} — without the jargon`,
    hasSystem
      ? `The ${t} Framework: A repeatable, structured system for getting consistent results`
      : `The ${t} Playbook: The strategies, tools, and tactics used by top practitioners`,
    hasData
      ? `The Evidence-Based Guide to ${t}: Research-backed principles and proven techniques`
      : `The Truth About ${t}: Cutting through the noise to what actually works`,
    `${t} for [Specific Audience]: A targeted guide for a single well-defined reader segment`,
    `The Contrarian Take on ${t}: Challenge conventional wisdom with a fresh perspective backed by results`,
    `${t} in 90 Days: A structured, time-bound programme that takes readers from beginner to competent`,
  ];
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function analyzeBookMarket(topic: string): Promise<BookMarketResearchResult> {
  logger.info({ topic }, "Starting book market research");

  const [demandData, competitionData, audienceData] = await Promise.all([
    tavilySearch(`"${topic}" book readers market demand interest 2024 2025`, 8),
    tavilySearch(`site:amazon.com OR site:goodreads.com "${topic}" books`, 8),
    tavilySearch(`"${topic}" who reads audience professionals beginners`, 8),
  ]);

  const allResults = [...demandData.results, ...competitionData.results, ...audienceData.results];

  const marketDemand = assessMarketDemand(demandData.results, demandData.answer);
  const competitionLevel = assessCompetition(competitionData.results, topic);
  const targetAudiences = extractTargetAudiences(allResults, topic);
  const popularSubtopics = extractPopularSubtopics(allResults, topic);
  const contentGaps = identifyContentGaps(demandData.results, competitionData.results, topic);
  const positioningRecommendations = buildPositioningRecommendations(topic, marketDemand, competitionLevel, targetAudiences);
  const keywordOpportunities = extractKeywordOpportunities(allResults, topic);
  const monetizationPotential = scoreMonetizationPotential(allResults, topic, competitionLevel);
  const recommendedPositioning = buildRecommendedPositioning(topic, marketDemand, competitionLevel, targetAudiences);
  const recommendedAngles = buildRecommendedAngles(allResults, topic);

  logger.info({ topic }, "Book market research complete");

  return {
    market_demand: marketDemand,
    competition_level: competitionLevel,
    target_audiences: targetAudiences,
    popular_subtopics: popularSubtopics,
    content_gaps: contentGaps,
    positioning_recommendations: positioningRecommendations,
    keyword_opportunities: keywordOpportunities,
    monetization_potential: monetizationPotential,
    recommended_positioning: recommendedPositioning,
    recommended_angles: recommendedAngles,
  };
}
