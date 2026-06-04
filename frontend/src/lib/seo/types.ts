// Shared types for the SEO content pipeline (mirrors directus/schema/010_seo_pipeline.sql).

export type ContextType =
  | "service"
  | "service_category"
  | "equipment_type"
  | "task"
  | "region"
  | "customer_segment"
  | "restriction"
  | "advantage"
  | "faq"
  | "case"
  | "forbidden_topic";

export type CompanyContext = {
  id: number;
  context_type: ContextType;
  name: string;
  slug: string | null;
  description: string | null;
  attributes: Record<string, unknown>;
  is_active: boolean;
  is_allowed_for_seo: boolean;
};

export type SeedTerm = {
  id: number;
  source_context_id: number | null;
  seed_term: string;
  seed_type: string | null;
  region: string | null;
  priority: "high" | "medium" | "low" | "seasonal";
  status: "active" | "paused" | "excluded" | "needs_review" | "error";
};

export type RawKeyword = {
  id: number;
  source: string;
  seed_term: string | null;
  keyword: string;
  frequency: number | null;
  region: string | null;
  period: string | null;
};

export type Intent =
  | "commercial_service"
  | "commercial_local"
  | "commercial_price"
  | "commercial_comparison"
  | "informational_how_to"
  | "informational_selection"
  | "informational_cost_estimation"
  | "faq"
  | "case_or_example"
  | "brand"
  | "competitor"
  | "irrelevant"
  | "unknown";

export type RecommendedAction =
  | "create_new_page"
  | "update_existing_page"
  | "add_faq_to_existing_page"
  | "add_section_to_existing_page"
  | "merge_with_existing_cluster"
  | "no_action"
  | "manual_review";

export type PageType =
  | "service"
  | "article"
  | "faq"
  | "local_page"
  | "comparison"
  | "update"
  | "case"
  | "hub";

export type ClusterScores = {
  business_fit: number;
  seo_opportunity: number;
  content_readiness: number;
  risk: number;
  priority: number;
};

export type KeywordCluster = {
  id: number;
  cluster_name: string | null;
  main_intent: Intent | null;
  cluster_type: PageType | null;
  primary_keyword: string | null;
  total_frequency: number;
  region: string | null;
  business_fit_score: number | null;
  seo_opportunity_score: number | null;
  content_readiness_score: number | null;
  risk_score: number | null;
  content_priority_score: number | null;
  recommended_action: RecommendedAction | null;
  target_existing_url: string | null;
  proposed_url: string | null;
  decision_log: Record<string, unknown>;
  status: string;
};

export type ContentPlanItem = {
  id: number;
  cluster_id: number;
  page_type: PageType | null;
  recommended_action: RecommendedAction | null;
  status: string;
  priority: number;
  confidence_score: number | null;
  risk_score: number | null;
  reason: string | null;
  missing_data: string[];
  proposed_title: string | null;
  proposed_url: string | null;
  target_existing_url: string | null;
  reviewer_comment: string | null;
};

export type ContentBrief = {
  page_goal: string;
  page_type: string;
  search_intent: string;
  target_user: string;
  business_goal: string;
  primary_keyword: string;
  secondary_keywords: string[];
  questions_to_answer: string[];
  required_blocks: string[];
  forbidden_claims: string[];
  source_facts: string[];
  missing_data: string[];
  internal_link_targets: string[];
  cta_requirements: string[];
  meta_requirements: { title_rule: string; description_rule: string };
  schema_requirements: string[];
  quality_requirements: string[];
};

export type GeneratedArticle = {
  title: string;
  slug: string;
  seo_title: string;
  meta_description: string;
  body_html: string;
  body_markdown: string;
  faq: { question: string; answer: string }[];
};

export type SitePage = {
  source: string;
  url_path: string;
  title: string;
  seo_title: string | null;
  meta_description: string | null;
  body: string | null;
};

export type ScoringConfig = {
  weights: { business_fit: number; seo_opportunity: number; content_readiness: number; risk: number };
  thresholds: {
    include_business_fit: number;
    include_seo: number;
    include_readiness: number;
    max_risk: number;
    intent_confidence: number;
    min_frequency: number;
  };
};

export type WordstatConfig = {
  mode: "api" | "csv";
  regions: string[];
  min_frequency: number;
  max_keywords_per_seed: number;
};

export type SemanticsCleaningConfig = {
  min_frequency: number;
  require_business_fit: boolean;
  junk_words: string[];
};
