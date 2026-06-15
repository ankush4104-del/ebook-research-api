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

export interface KdpKeywordsResult {
  topic: string;
  primary_keywords: string[];
  long_tail_keywords: string[];
  buyer_intent_keywords: string[];
  category_keywords: string[];
  subtitle_suggestions: string[];
  recommended_categories: string[];
  target_audiences: string[];
  keyword_difficulty: string;
  discoverability_score: string;
  positioning_suggestions: string[];
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

// ── primary_keywords ──────────────────────────────────────────────────────────
// Short (1-3 word) exact-match and broad phrases a reader types into KDP/Amazon.

function buildPrimaryKeywords(topic: string, results: TavilyResult[]): string[] {
  const base = topic.toLowerCase();
  const t = topic.replace(/\b\w/g, (c) => c.toUpperCase());

  const generated = [
    base,
    `${base} book`,
    `${base} guide`,
    `${base} for beginners`,
    `${base} handbook`,
    `learn ${base}`,
    `${base} 101`,
  ];

  // Pull short phrases from result titles that contain a topic word
  const topicWords = base.split(/\s+/).filter((w) => w.length > 3);
  const fromTitles = results
    .map((r) => r.title.replace(/\s*[-|:].*/g, "").trim().toLowerCase())
    .filter((t) => topicWords.some((w) => t.includes(w)) && t.length <= base.length + 12)
    .map((t) => t.replace(/\b\w/g, (c) => c.toLowerCase()));

  return [...new Set([...generated, ...fromTitles])].slice(0, 8);
}

// ── long_tail_keywords ────────────────────────────────────────────────────────
// 4-8 word search phrases that target specific reader intent.

function buildLongTailKeywords(topic: string, results: TavilyResult[]): string[] {
  const base = topic.toLowerCase();

  const generated = [
    `${base} for beginners step by step`,
    `how to learn ${base} from scratch`,
    `${base} complete guide for beginners`,
    `best ${base} book for beginners`,
    `${base} tips and strategies for success`,
    `${base} for small business owners`,
    `${base} strategies for entrepreneurs`,
    `getting started with ${base} no experience`,
    `${base} quick start guide`,
    `${base} for non-technical beginners`,
  ];

  // Extract long phrases from research titles
  const topicWords = base.split(/\s+/).filter((w) => w.length > 3);
  const fromTitles = results
    .map((r) => r.title.replace(/\s*[-|:].*/g, "").trim().toLowerCase())
    .filter(
      (t) =>
        topicWords.some((w) => t.includes(w)) &&
        t.split(/\s+/).length >= 4 &&
        t.split(/\s+/).length <= 9
    );

  return [...new Set([...generated, ...fromTitles])].slice(0, 10);
}

// ── buyer_intent_keywords ─────────────────────────────────────────────────────
// Phrases used by readers actively looking to buy/learn — high purchase signal.

function buildBuyerIntentKeywords(topic: string, results: TavilyResult[]): string[] {
  const base = topic.toLowerCase();

  const generated = [
    `${base} training`,
    `${base} course book`,
    `${base} certification guide`,
    `${base} mastery`,
    `${base} crash course`,
    `${base} bootcamp guide`,
    `${base} workbook`,
    `${base} self study guide`,
    `${base} professional development`,
    `${base} skills training book`,
  ];

  // Look for buyer-intent signals in research content
  const buyerTerms = ["buy", "purchase", "learn", "course", "training", "certification", "master", "study"];
  const topicWords = base.split(/\s+/).filter((w) => w.length > 3);

  const fromContent: string[] = [];
  for (const result of results) {
    const lower = result.content.toLowerCase();
    for (const term of buyerTerms) {
      const pattern = new RegExp(`${term}\\s+${topicWords[0]}[a-z\\s]{0,30}`, "i");
      const match = lower.match(pattern);
      if (match) {
        const phrase = match[0].trim().replace(/\s+/g, " ").slice(0, 50);
        if (phrase.split(/\s+/).length >= 2 && phrase.split(/\s+/).length <= 6) {
          fromContent.push(phrase);
        }
      }
    }
    if (fromContent.length >= 3) break;
  }

  return [...new Set([...generated, ...fromContent])].slice(0, 10);
}

// ── category_keywords ─────────────────────────────────────────────────────────
// Broader topic terms that help KDP match the book to category browse pages.

function buildCategoryKeywords(topic: string, results: TavilyResult[]): string[] {
  const base = topic.toLowerCase();

  // Domain inference for category-adjacent terms
  const domainMap: [RegExp, string[]][] = [
    [/marketing|seo|social media|content|branding|advertising/i, ["digital marketing", "online business", "marketing strategy", "brand building", "content creation"]],
    [/finance|investing|money|budget|wealth|stock|crypto/i, ["personal finance", "financial literacy", "investing for beginners", "money management", "financial freedom"]],
    [/programming|coding|software|developer|python|javascript/i, ["software development", "coding for beginners", "programming fundamentals", "tech career", "computer science"]],
    [/health|fitness|nutrition|diet|exercise|wellness/i, ["health and wellness", "fitness guide", "healthy living", "weight loss", "mental health"]],
    [/business|entrepreneur|startup|leadership|management/i, ["entrepreneurship", "business strategy", "small business", "leadership skills", "business growth"]],
    [/writing|author|publish|blog|copywriting|content/i, ["creative writing", "self publishing", "book writing", "copywriting skills", "author platform"]],
    [/design|graphic|ux|ui|visual|creative/i, ["graphic design", "visual communication", "UI design", "creative skills", "design thinking"]],
    [/photography|video|film|youtube|media/i, ["photography guide", "video production", "content creation", "visual storytelling", "media skills"]],
    [/mindset|productivity|habits|self.help|motivation/i, ["personal development", "productivity systems", "mindset training", "self improvement", "habit building"]],
  ];

  for (const [pattern, terms] of domainMap) {
    if (pattern.test(base)) return terms;
  }

  // Fallback: extract co-occurring category terms from research
  const topicWords = base.split(/\s+/).filter((w) => w.length > 3);
  const categoryTerms: string[] = [];
  for (const result of results) {
    const lower = result.content.toLowerCase();
    const phrases = lower.match(/\b[a-z][a-z\s]{5,25}\b/g) ?? [];
    for (const phrase of phrases) {
      const words = phrase.trim().split(/\s+/);
      if (
        words.length >= 2 &&
        words.length <= 4 &&
        !topicWords.some((w) => phrase.includes(w)) &&
        categoryTerms.length < 5
      ) {
        categoryTerms.push(phrase.trim().replace(/\b\w/g, (c) => c.toLowerCase()));
      }
    }
    if (categoryTerms.length >= 5) break;
  }

  return [...new Set([`${base} fundamentals`, `${base} essentials`, `${base} overview`, ...categoryTerms])].slice(0, 6);
}

// ── subtitle_suggestions ──────────────────────────────────────────────────────

function buildSubtitleSuggestions(topic: string, results: TavilyResult[]): string[] {
  const t = topic.replace(/\b\w/g, (c) => c.toUpperCase());
  const hasPractical = results.some((r) => /practical|hands.on|step.by.step/i.test(r.title + r.content));
  const hasCase = results.some((r) => /case stud|real.world|example/i.test(r.title + r.content));
  const hasStrategy = results.some((r) => /strateg|framework|system|blueprint/i.test(r.title + r.content));

  return [
    `A Practical Step-by-Step Guide for Beginners`,
    hasStrategy
      ? `The Complete Blueprint for Entrepreneurs and Professionals`
      : `The Complete Guide to Getting Started with ${t}`,
    hasPractical
      ? `Hands-On Techniques and Real-World Strategies That Actually Work`
      : `Everything You Need to Know to Get Results Fast`,
    `From Zero to Confident: A Beginner's Roadmap to ${t}`,
    hasCase
      ? `Proven Frameworks, Case Studies, and Actionable Tools`
      : `Proven Strategies, Essential Tools, and Actionable Frameworks`,
    `The No-Fluff Guide to ${t} for Busy Professionals`,
  ];
}

// ── recommended_categories ────────────────────────────────────────────────────
// Amazon KDP browse categories based on topic signals.

function buildRecommendedCategories(topic: string, results: TavilyResult[]): string[] {
  const text = (topic + " " + results.map((r) => r.title).join(" ")).toLowerCase();

  const categoryRules: [RegExp, string[]][] = [
    [
      /marketing|seo|social media|content marketing|advertising|branding/i,
      ["Business & Money > Marketing & Sales", "Computers & Technology > Internet & Social Media > Social Media", "Business & Money > Entrepreneurship"],
    ],
    [
      /digital marketing|online marketing|email marketing/i,
      ["Business & Money > Marketing & Sales > Marketing", "Computers & Technology > Internet & Social Media", "Business & Money > Small Business & Entrepreneurship"],
    ],
    [
      /personal finance|money|investing|budget|wealth|financial/i,
      ["Business & Money > Personal Finance", "Business & Money > Investing", "Self-Help > Personal Transformation"],
    ],
    [
      /programming|coding|software|python|javascript|developer/i,
      ["Computers & Technology > Programming", "Computers & Technology > Software Design & Engineering", "Education & Teaching > Higher Education"],
    ],
    [
      /business|entrepreneur|startup|management|leadership/i,
      ["Business & Money > Entrepreneurship", "Business & Money > Business Management", "Business & Money > Small Business & Entrepreneurship"],
    ],
    [
      /health|fitness|nutrition|diet|exercise|wellness/i,
      ["Health, Fitness & Dieting > Exercise & Fitness", "Health, Fitness & Dieting > Nutrition", "Self-Help > Stress Management"],
    ],
    [
      /writing|copywriting|author|publish|self.publish/i,
      ["Reference > Writing, Research & Publishing Guides > Writing > Authorship", "Business & Money > Marketing & Sales > Copywriting", "Biographies & Memoirs > Arts & Literature"],
    ],
    [
      /design|graphic|ux|ui|visual|creative/i,
      ["Arts & Photography > Graphic Design", "Computers & Technology > Graphics & Design", "Business & Money > Marketing & Sales"],
    ],
    [
      /photography|video|youtube|filmmaking/i,
      ["Arts & Photography > Photography & Video", "Computers & Technology > Digital Audio, Video & Photography", "Business & Money > Marketing & Sales"],
    ],
    [
      /productivity|habits|mindset|self.help|motivation|personal development/i,
      ["Self-Help > Personal Transformation", "Self-Help > Time Management", "Business & Money > Business Culture"],
    ],
    [
      /ai|artificial intelligence|machine learning|data science/i,
      ["Computers & Technology > Computer Science > AI & Machine Learning", "Computers & Technology > Programming", "Business & Money > Industries & Professions"],
    ],
  ];

  for (const [pattern, categories] of categoryRules) {
    if (pattern.test(text)) return categories;
  }

  return [
    "Business & Money > Business Culture",
    "Reference > Writing, Research & Publishing Guides",
    "Education & Teaching > Higher Education",
  ];
}

// ── target_audiences ──────────────────────────────────────────────────────────

function extractTargetAudiences(topic: string, results: TavilyResult[]): string[] {
  const text = results.map((r) => r.content + " " + r.title).join(" ");
  const base = topic.toLowerCase();

  const audiencePatterns: [RegExp, string][] = [
    [/beginner|new to|getting started|no experience|novice/i, `Beginners and newcomers with no prior ${base} experience`],
    [/professional|practitioner|working|career|job/i, `Working professionals who want to upskill in ${base}`],
    [/entrepreneur|founder|solopreneur|small business|startup/i, `Entrepreneurs and small business owners using ${base} to grow`],
    [/student|university|college|graduate/i, `Students studying ${base} as part of their education or career prep`],
    [/manager|leader|executive|director/i, `Managers and leaders applying ${base} to their teams and organisations`],
    [/freelancer|consultant|self.employed/i, `Freelancers and consultants offering ${base} services to clients`],
  ];

  const found: string[] = [];
  for (const [pattern, label] of audiencePatterns) {
    if (pattern.test(text)) found.push(label);
  }

  const fallbacks = [
    `Anyone wanting a clear, practical introduction to ${base}`,
    `Career-changers looking to enter a field that requires ${base} knowledge`,
    `Professionals seeking a structured ${base} resource to fill skill gaps`,
  ];

  return [...new Set([...found, ...fallbacks])].slice(0, 6);
}

// ── keyword_difficulty ────────────────────────────────────────────────────────

function assessKeywordDifficulty(topic: string, results: TavilyResult[]): string {
  const text = results.map((r) => r.title + " " + r.content).join(" ").toLowerCase();
  const topicLower = topic.toLowerCase();

  const amazonHits = results.filter(
    (r) => r.url.includes("amazon.com") || r.url.includes("goodreads.com")
  ).length;

  const directTitleMatches = results.filter((r) =>
    r.title.toLowerCase().includes(topicLower)
  ).length;

  const bigPublishers = /penguin|random house|wiley|mcgraw|pearson|harvard business|o'reilly|manning/i.test(text);

  const score = amazonHits * 2 + directTitleMatches + (bigPublishers ? 3 : 0);

  if (score >= 8)
    return "High — well-established books from major publishers dominate this keyword. New titles need strong differentiation, reviews, and an author platform to compete for visibility.";
  if (score >= 4)
    return "Moderate — some established competition exists but indie and self-published titles rank well. A well-optimised title, subtitle, and 7 backend keywords can achieve strong visibility.";
  return "Low — limited competition for this keyword. A clearly titled, well-described book can rank quickly with minimal launch effort. First-mover advantage is available.";
}

// ── discoverability_score ─────────────────────────────────────────────────────

function assessDiscoverability(
  topic: string,
  keywordDifficulty: string,
  primaryKeywords: string[],
  recommendedCategories: string[]
): string {
  const isLow = keywordDifficulty.startsWith("Low");
  const isHigh = keywordDifficulty.startsWith("High");
  const categoryCount = recommendedCategories.length;
  const keywordCount = primaryKeywords.length;

  if (isLow)
    return `Strong (7/10) — low keyword competition and ${categoryCount} viable KDP categories give this book excellent organic discoverability. Optimising the subtitle with a primary keyword and selecting all 7 backend KDP keywords will maximise visibility from day one.`;
  if (isHigh)
    return `Challenging (4/10) — high competition means organic ranking requires sustained review velocity and a launch strategy. Prioritise a niche subcategory (e.g. "New Releases" within a sub-category) for initial rank, then build to the main keyword over time.`;
  return `Moderate (6/10) — ${keywordCount} primary keyword opportunities and ${categoryCount} relevant categories provide a solid discoverability foundation. A keyword-rich subtitle, backend keyword optimisation, and 15–20 early reviews will push the book into the first page of results.`;
}

// ── positioning_suggestions ───────────────────────────────────────────────────

function buildPositioningSuggestions(
  topic: string,
  keywordDifficulty: string,
  results: TavilyResult[]
): string[] {
  const t = topic.replace(/\b\w/g, (c) => c.toUpperCase());
  const base = topic.toLowerCase();
  const isHighDiff = keywordDifficulty.startsWith("High");
  const isLowDiff = keywordDifficulty.startsWith("Low");
  const hasBeginner = results.some((r) => /beginner|getting started|introduction/i.test(r.title));
  const hasAdvanced = results.some((r) => /advanced|expert|mastery|pro/i.test(r.title));

  const suggestions: string[] = [];

  suggestions.push(
    `Include your primary keyword ("${base}") in the book title itself — KDP weights title matches most heavily in its search algorithm`
  );

  suggestions.push(
    `Use the subtitle to add a long-tail keyword — e.g. "A Step-by-Step Guide for Beginners" targets a lower-competition phrase while reinforcing the main topic`
  );

  if (isHighDiff) {
    suggestions.push(
      `Compete in a KDP sub-niche rather than the top-level category — new books rank faster in "New Releases" within a sub-category before climbing the main keyword`
    );
    suggestions.push(
      `Target a specific audience in the subtitle to carve out a sub-niche (e.g. "${t} for Freelancers") rather than competing head-to-head with established titles`
    );
  } else if (isLowDiff) {
    suggestions.push(
      `Move quickly to establish category ownership — publish a comprehensive, authoritative guide and collect early reviews to lock in first-page ranking before competition increases`
    );
  }

  if (!hasBeginner) {
    suggestions.push(
      `"For Beginners" is a high-volume, lower-competition modifier — consider including it in the subtitle if the content supports a beginner audience`
    );
  }

  if (!hasAdvanced) {
    suggestions.push(
      `An "Advanced" or "Mastery" edition is an unmet opportunity — most existing ${t} books target beginners, leaving experienced readers underserved`
    );
  }

  suggestions.push(
    `Use all 7 Amazon KDP backend keyword slots with distinct long-tail phrases — never repeat words already in your title or subtitle, as KDP indexes those automatically`
  );

  suggestions.push(
    `Select the most specific KDP browse categories available for this topic — ranking #1 in a sub-category (e.g. "Hot New Releases in Social Media Marketing") is more achievable than a top-level category and generates a "bestseller" badge faster`
  );

  return suggestions.slice(0, 7);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function researchKdpKeywords(topic: string): Promise<KdpKeywordsResult> {
  logger.info({ topic }, "Starting KDP keyword research");

  const [searchData, amazonData] = await Promise.all([
    tavilySearch(`"${topic}" book guide readers search popular keywords`, 8),
    tavilySearch(`site:amazon.com "${topic}" books bestseller kindle`, 8),
  ]);

  const allResults = [...searchData.results, ...amazonData.results];

  const primaryKeywords = buildPrimaryKeywords(topic, allResults);
  const longTailKeywords = buildLongTailKeywords(topic, allResults);
  const buyerIntentKeywords = buildBuyerIntentKeywords(topic, allResults);
  const categoryKeywords = buildCategoryKeywords(topic, allResults);
  const subtitleSuggestions = buildSubtitleSuggestions(topic, allResults);
  const recommendedCategories = buildRecommendedCategories(topic, allResults);
  const targetAudiences = extractTargetAudiences(topic, allResults);
  const keywordDifficulty = assessKeywordDifficulty(topic, amazonData.results);
  const discoverabilityScore = assessDiscoverability(topic, keywordDifficulty, primaryKeywords, recommendedCategories);
  const positioningSuggestions = buildPositioningSuggestions(topic, keywordDifficulty, allResults);

  logger.info({ topic }, "KDP keyword research complete");

  return {
    topic,
    primary_keywords: primaryKeywords,
    long_tail_keywords: longTailKeywords,
    buyer_intent_keywords: buyerIntentKeywords,
    category_keywords: categoryKeywords,
    subtitle_suggestions: subtitleSuggestions,
    recommended_categories: recommendedCategories,
    target_audiences: targetAudiences,
    keyword_difficulty: keywordDifficulty,
    discoverability_score: discoverabilityScore,
    positioning_suggestions: positioningSuggestions,
  };
}
