import { logger } from "./logger";

const TAVILY_API_URL = "https://api.tavily.com/search";

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

async function tavilySearch(query: string, maxResults = 7): Promise<TavilyResponse> {
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

export interface BisacCategory {
  name: string;
  bisac_code: string;
}

export interface CompetitiveTitle {
  title: string;
  author: string;
  url: string;
  price_range: string;
}

export interface KdpPricingSuggestion {
  ebook_price: string;
  print_price: string;
  rationale: string;
}

export interface KdpResearchResult {
  topic: string;
  keywords: string[];
  categories: BisacCategory[];
  competitive_titles: CompetitiveTitle[];
  market_insights: string[];
  pricing_suggestion: KdpPricingSuggestion;
  description_hooks: string[];
  title_keywords: string[];
}

const BISAC_MAP: Record<string, BisacCategory[]> = {
  marketing: [
    { name: "Business & Economics / Marketing / General", bisac_code: "BUS043000" },
    { name: "Business & Economics / E-Commerce / Internet Marketing", bisac_code: "BUS090000" },
  ],
  business: [
    { name: "Business & Economics / General", bisac_code: "BUS000000" },
    { name: "Business & Economics / Management", bisac_code: "BUS041000" },
  ],
  technology: [
    { name: "Computers / General", bisac_code: "COM000000" },
    { name: "Computers / Internet / General", bisac_code: "COM043000" },
  ],
  health: [
    { name: "Health & Fitness / General", bisac_code: "HEA000000" },
    { name: "Medical / General", bisac_code: "MED000000" },
  ],
  finance: [
    { name: "Business & Economics / Finance / General", bisac_code: "BUS027000" },
    { name: "Business & Economics / Personal Finance / General", bisac_code: "BUS050000" },
  ],
  self_help: [
    { name: "Self-Help / General", bisac_code: "SEL000000" },
    { name: "Self-Help / Personal Growth / Success", bisac_code: "SEL027000" },
  ],
  education: [
    { name: "Education / General", bisac_code: "EDU000000" },
    { name: "Education / Teaching Methods & Materials / General", bisac_code: "EDU029000" },
  ],
};

function guessBisacCategories(topic: string): BisacCategory[] {
  const t = topic.toLowerCase();
  if (/market|advertis|brand|seo|social media/.test(t)) return BISAC_MAP.marketing;
  if (/finance|invest|money|crypto|tax|budget/.test(t)) return BISAC_MAP.finance;
  if (/tech|software|code|program|data|ai|machine/.test(t)) return BISAC_MAP.technology;
  if (/health|fitness|wellness|nutrition|diet/.test(t)) return BISAC_MAP.health;
  if (/self.help|habit|productiv|mindset|motivat/.test(t)) return BISAC_MAP.self_help;
  if (/educat|learn|teach|train|course/.test(t)) return BISAC_MAP.education;
  return BISAC_MAP.business;
}

function extractCompetitiveTitles(results: TavilyResult[]): CompetitiveTitle[] {
  const titles: CompetitiveTitle[] = [];
  const amazonResults = results.filter(
    (r) => r.url.includes("amazon.com") || r.url.includes("goodreads.com")
  );

  for (const result of amazonResults) {
    if (result.title && result.url) {
      titles.push({
        title: result.title.replace(/\s*[-|].*$/, "").trim(),
        author: extractAuthorFromContent(result.content),
        url: result.url,
        price_range: extractPrice(result.content),
      });
      if (titles.length >= 5) break;
    }
  }

  if (titles.length < 3) {
    for (const result of results) {
      if (titles.find((t) => t.url === result.url)) continue;
      titles.push({
        title: result.title.replace(/\s*[-|].*$/, "").trim(),
        author: extractAuthorFromContent(result.content),
        url: result.url,
        price_range: "$2.99–$9.99",
      });
      if (titles.length >= 5) break;
    }
  }

  return titles;
}

function extractAuthorFromContent(content: string): string {
  const match = content.match(/by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/);
  return match ? match[1] : "Unknown Author";
}

function extractPrice(content: string): string {
  const match = content.match(/\$[\d]+\.[\d]{2}/g);
  if (!match || match.length === 0) return "$2.99–$9.99";
  if (match.length === 1) return match[0];
  const prices = match.map((p) => parseFloat(p.replace("$", ""))).sort((a, b) => a - b);
  return `$${prices[0].toFixed(2)}–$${prices[prices.length - 1].toFixed(2)}`;
}

function extractKeywords(results: TavilyResult[], topic: string): string[] {
  const text = results.map((r) => r.title + " " + r.content).join(" ").toLowerCase();
  const topicWords = topic.toLowerCase().split(/\s+/);

  const candidatePhrases: string[] = [];
  const phrasePattern = /\b[a-z][a-z\s]{4,30}\b/g;
  const matches = text.match(phrasePattern) ?? [];

  const freq: Record<string, number> = {};
  for (const m of matches) {
    const trimmed = m.trim();
    if (trimmed.split(" ").length >= 2 && trimmed.split(" ").length <= 4) {
      freq[trimmed] = (freq[trimmed] ?? 0) + 1;
    }
  }

  const sorted = Object.entries(freq)
    .filter(([k]) => !topicWords.every((w) => k.includes(w)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([k]) => k.replace(/\b\w/g, (c) => c.toUpperCase()));

  const deduped = [...new Set([topic, ...sorted])].slice(0, 7);
  return deduped;
}

function extractMarketInsights(results: TavilyResult[]): string[] {
  const insightKeywords = ["demand", "market", "popular", "readers", "audience", "growing", "bestsell", "million"];
  const insights: string[] = [];

  for (const result of results) {
    const sentences = result.content.split(/[.!?]+/);
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (insightKeywords.some((k) => lower.includes(k))) {
        const trimmed = sentence.trim().replace(/\s+/g, " ");
        if (trimmed.length > 40 && trimmed.length < 200) {
          insights.push(trimmed);
          if (insights.length >= 5) return insights;
        }
      }
    }
  }

  return insights;
}

function buildPricingSuggestion(bookType: string, competitiveTitles: CompetitiveTitle[]): KdpPricingSuggestion {
  const pricingByType: Record<string, KdpPricingSuggestion> = {
    ebook: {
      ebook_price: "$4.99",
      print_price: "$12.99",
      rationale: "Priced in the $2.99–$9.99 KDP Select royalty-optimized range. $4.99 maximizes 70% royalty while undercutting the $6.99–$9.99 standard non-fiction ebook range.",
    },
    nonfiction: {
      ebook_price: "$9.99",
      print_price: "$19.99",
      rationale: "Full-length non-fiction commands a premium. $9.99 ebook sits at the top of the 70% royalty ceiling; $19.99 print reflects typical trade paperback pricing.",
    },
    training_manual: {
      ebook_price: "$14.99",
      print_price: "$29.99",
      rationale: "Training manuals carry perceived professional value. Higher price points signal authority and are standard for instructional materials and workbooks.",
    },
  };
  return pricingByType[bookType] ?? pricingByType["ebook"];
}

function buildDescriptionHooks(topic: string, targetAudience: string): string[] {
  return [
    `Are you ready to master ${topic} and transform the way you work?`,
    `What if you could learn everything about ${topic} in one comprehensive guide?`,
    `Discover the proven strategies top experts use when it comes to ${topic}.`,
    `Whether you're a complete beginner or looking to level up, this guide to ${topic} meets you where you are.`,
    `Stop guessing and start getting results — this is your definitive ${topic} resource.`,
  ];
}

function buildTitleKeywords(topic: string, results: TavilyResult[]): string[] {
  const base = topic.split(/\s+/).filter((w) => w.length > 3);
  const extras = ["guide", "complete", "essential", "beginner", "advanced", "practical", "step-by-step"];
  return [...new Set([...base, ...extras])].slice(0, 8);
}

export async function researchKdp(
  topic: string,
  bookType: string,
  targetAudience: string
): Promise<KdpResearchResult> {
  logger.info({ topic, bookType, targetAudience }, "Starting KDP research");

  const [amazonData, keywordData, marketData] = await Promise.all([
    tavilySearch(`site:amazon.com "${topic}" kindle ebook bestseller`, 7),
    tavilySearch(`best kdp keywords "${topic}" kindle publish amazon`, 7),
    tavilySearch(`"${topic}" book market demand readers 2024 2025`, 7),
  ]);

  const allResults = [...amazonData.results, ...keywordData.results, ...marketData.results];

  const keywords = extractKeywords(allResults, topic);
  const categories = guessBisacCategories(topic);
  const competitiveTitles = extractCompetitiveTitles(allResults);
  const marketInsights = extractMarketInsights(marketData.results);
  const pricingSuggestion = buildPricingSuggestion(bookType, competitiveTitles);
  const descriptionHooks = buildDescriptionHooks(topic, targetAudience);
  const titleKeywords = buildTitleKeywords(topic, allResults);

  logger.info({ topic, keywordCount: keywords.length, competitorCount: competitiveTitles.length }, "KDP research complete");

  return {
    topic,
    keywords,
    categories,
    competitive_titles: competitiveTitles,
    market_insights: marketInsights,
    pricing_suggestion: pricingSuggestion,
    description_hooks: descriptionHooks,
    title_keywords: titleKeywords,
  };
}
