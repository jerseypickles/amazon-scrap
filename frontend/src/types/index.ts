export interface Product {
  asin: string;
  title: string;
  brand: string | null;
  price: number | null;
  original_price: number | null;
  rating: number | null;
  reviews_count: number | null;
  bsr: number | null;
  bsr_category: string | null;
  image_url: string | null;
  product_url: string | null;
  category: string | null;
  is_prime: boolean | null;
  is_best_seller: boolean | null;
  is_amazon_choice: boolean | null;
  monthly_bought: string | null;
  search_keyword: string | null;
}

export interface BrandInfo {
  name: string;
  count: number;
  avg_price: number | null;
  avg_rating: number | null;
  market_share: number;
  total_reviews: number;
  best_seller_count: number;
  amazon_choice_count: number;
  has_monthly_bought: boolean;
  threat_level: string;
}

export interface ScoreBreakdown {
  signal: string;
  value: string;
  score: number;
  weight: number;
  weighted: number;
}

export interface SaturationData {
  newcomers: number;
  growing: number;
  established: number;
  dominant: number;
  newcomers_pct: number;
  growing_pct: number;
  established_pct: number;
  dominant_pct: number;
  verdict: string;
}

export interface PriceOpportunityRange {
  range: string;
  count: number;
  avg_reviews: number;
  avg_rating: number | null;
  has_demand: boolean;
  entry_ease: string;
  small_sellers?: number;
}

export interface PriceOpportunity {
  best_range: string;
  ranges: PriceOpportunityRange[];
}

export interface PriceRange {
  range: string;
  count: number;
}

export interface LaunchInvestment {
  review_target: number;
  best_range_median_reviews: number;
  vine_cost: number;
  vine_reviews: number;
  ppc_total_estimate: number;
  inventory_cost: number;
  total_investment: number;
  breakeven_months: number;
  months_to_review_target: number;
  estimated_cpc: number;
  conversion_rate_new: number;
}

export interface NicheAnalysis {
  id: number;
  keyword: string;
  parent_keyword?: string | null;
  total_products: number;
  avg_price: number | null;
  min_price: number | null;
  max_price: number | null;
  median_price: number | null;
  avg_rating: number | null;
  avg_reviews: number | null;
  avg_bsr: number | null;
  top_brands: BrandInfo[];
  brand_count: number | null;
  top3_brand_share: number | null;
  opportunity_score: number | null;
  demand_score: number | null;
  competition_score: number | null;
  price_score: number | null;
  quality_gap_score: number | null;
  entrant_viability_score: number | null;
  revenue_estimate: number | null;
  revenue_top: number | null;
  revenue_entry: number | null;
  median_reviews: number | null;
  prime_percentage: number | null;
  monthly_bought_percentage: number | null;
  best_seller_percentage: number | null;
  amazon_choice_percentage: number | null;
  estimated_margin: number | null;
  search_result_count: number | null;
  demand_breakdown: ScoreBreakdown[];
  competition_breakdown: ScoreBreakdown[];
  price_breakdown: ScoreBreakdown[];
  quality_breakdown: ScoreBreakdown[];
  entrant_viability_breakdown: ScoreBreakdown[];
  saturation: SaturationData | null;
  price_opportunity: PriceOpportunity | null;
  price_distribution: PriceRange[];
  rating_distribution: { range: string; count: number }[];
  review_distribution: { range: string; count: number }[];
  launch_investment: LaunchInvestment | null;
  created_at: string | null;
  is_cached?: boolean;
}

export interface AnalysisProductsResponse {
  analysis_id: number;
  keyword: string;
  total: number;
  products: Product[];
}

export interface DashboardSummary {
  total_analyses: number;
  total_products_tracked: number;
  top_opportunities: NicheAnalysis[];
  recent_analyses: NicheAnalysis[];
}

export interface Category {
  id: string;
  name: string;
  node: string;
  repurchase_weeks?: number;
  tip?: string;
  volume?: "high" | "medium" | "low";
  competition?: "high" | "medium" | "low";
  search_terms?: string[];
  subcategories?: Category[];
}

export interface SearchResult {
  keyword: string;
  page: number;
  total_results: number;
  products: Product[];
}

export interface AnalysisHistoryItem {
  id: number;
  keyword: string;
  total_products: number;
  avg_price: number | null;
  opportunity_score: number | null;
  parent_keyword?: string | null;
  created_at: string;
}

// AI Advisor types
export interface AIEntryStrategy {
  recommended: boolean;
  reasoning: string;
  differentiation_angle: string;
  target_price: string;
  target_rating: string;
}

export interface AIProductIdea {
  name: string;
  description: string;
  estimated_price: string;
  why: string;
  target_margin?: string;
  difficulty?: string;
}

export interface AIRisk {
  risk: string;
  severity: string;
  mitigation: string;
}

export interface AIGoNoGo {
  decision: string; // "go" | "no-go" | "caution"
  margin_above_30: boolean;
  small_sellers_active: boolean;
  entry_revenue_viable: boolean;
  price_in_fba_range: boolean;
  no_complex_certs: boolean;
  entry_viable_some_range: boolean;
  viable_with_ppc: boolean;
  mvv_achievable: boolean;
  summary: string;
}

export interface AIMinViableVolume {
  units_breakeven: string;
  achievable: boolean;
  reasoning: string;
}

export interface AIPhaseRecommendation {
  current_phase: string;
  requires_brand_from_start: boolean;
  brand_reason: string;
  private_label_trigger: string;
  private_label_investment: string;
}

export interface AIPPCStrategy {
  viable: boolean;
  reasoning: string;
  keywords: string[];
}

export interface AISubNiche {
  keyword_amazon: string;
  keyword_alibaba: string;
  why_viable: string;
  price_range: string;
}

export interface QuickCheckResult {
  keyword: string;
  total_products: number;
  difficulty: string; // "easy" | "medium" | "hard" | "unknown"
  difficulty_score: number | null;
  avg_price: number | null;
  median_reviews: number | null;
  brand_count: number | null;
  top3_brand_share: number | null;
  estimated_margin: number | null;
  monthly_bought_pct: number | null;
  search_result_count: number | null;
}

export interface AIInsight {
  verdict: string;
  score_label: string;
  is_consumable?: boolean;
  repurchase_weeks?: number;
  go_no_go?: AIGoNoGo;
  min_viable_volume?: AIMinViableVolume;
  phase_recommendation?: AIPhaseRecommendation;
  entry_strategy?: AIEntryStrategy;
  ppc_strategy?: AIPPCStrategy;
  product_ideas?: AIProductIdea[];
  risks?: AIRisk[];
  sub_niches?: AISubNiche[];
  next_steps?: string[];
  error?: string;
}

export interface AIAnalysisResponse {
  analysis_id: number;
  keyword: string;
  opportunity_score: number | null;
  insight: AIInsight;
  raw_es?: Record<string, unknown>;
  cached?: boolean;
}

export interface AIComparisonRanking {
  keyword: string;
  rank: number;
  score: number;
  reasoning: string;
}

export interface AIComparison {
  winner: string;
  ranking: AIComparisonRanking[];
  recommendation: string;
  comparison_factors?: { factor: string; best: string; analysis: string }[];
}

export interface AICompareResponse {
  niches_compared: string[];
  comparison: AIComparison;
}

// Watchlist types
export interface MetricsHistoryPoint {
  date: string;
  score: number;
  avg_price?: number | null;
  median_reviews?: number | null;
  brand_count?: number | null;
  top3_brand_share?: number | null;
  estimated_margin?: number | null;
  total_products?: number | null;
  revenue_estimate?: number | null;
  keepa_trend?: string | null;
  keepa_sellers_change?: number | null;
}

export interface WatchlistItem {
  id: number;
  keyword: string;
  last_analysis_id: number | null;
  last_score: number | null;
  previous_score: number | null;
  score_trend: string | null;
  score_history: MetricsHistoryPoint[];
  action_signal: string | null;
  last_metrics: {
    avg_price?: number | null;
    median_reviews?: number | null;
    brand_count?: number | null;
    top3_brand_share?: number | null;
    estimated_margin?: number | null;
    total_products?: number | null;
    revenue_estimate?: number | null;
  } | null;
  alerts: string[];
  check_interval_hours: number;
  is_active: boolean;
  is_paused: boolean;
  notes: string | null;
  last_checked_at: string | null;
  created_at: string | null;
}

export interface WatchlistStats {
  total: number;
  avg_score: number | null;
  trending_up: number;
  trending_down: number;
  stable: number;
  new_unchecked: number;
  paused: number;
  next_check_at: string | null;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  keyword: string | null;
  analysis_id: number | null;
  is_read: boolean;
  severity: string;
  created_at: string | null;
}

export interface SmartNiche {
  keyword: string;
  analyzed: boolean;
  analysis_id: number | null;
  opportunity_score: number | null;
  avg_price: number | null;
  avg_rating: number | null;
  total_products: number | null;
  brand_count: number | null;
  label: string; // "Oportunidad" | "Bueno" | "Competido" | "Difícil" | "Nuevo"
  created_at: string | null;
}

export interface SmartNichesResponse {
  niches: SmartNiche[];
  total: number;
  analyzed_count: number;
}

// User Profile types
export interface UserProfile {
  business_model: string; // "generic_only" | "brand_only" | "generic_then_brand"
  product_type: string; // "consumable_only" | "any" | "non_consumable_only"
  budget: number;
  experience: string; // "beginner" | "intermediate" | "advanced"
  fulfillment: string; // "fba" | "fbm" | "both"
  marketplace: string; // "US" | "MX" | "CA" | "UK" | "DE"
  updated_at?: string | null;
}

// ASIN Tracker types
export interface ProductSnapshot {
  date: string;
  price: number | null;
  bsr: number | null;
  rating: number | null;
  reviews_count: number | null;
  is_best_seller: boolean;
  is_amazon_choice: boolean;
  monthly_bought: string | null;
}

export interface ProductReview {
  stars: number | null;
  title: string | null;
  text: string | null;
  date: string | null;
  verified: boolean;
  author: string | null;
}

export interface VariationValue {
  value: string;
  asin: string | null;
  is_selected: boolean;
}

export interface ProductVariation {
  name: string;
  values: VariationValue[];
}

export interface OfferItem {
  seller_name: string;
  seller_id: string | null;
  price: number | null;
  shipping_price: string | null;
  condition: string;
  is_prime: boolean;
  is_fba: boolean;
  seller_rating: string | null;
  seller_reviews_count: number | null;
  delivery_info: string | null;
  is_buy_box_winner: boolean;
}

export interface TrackedProduct {
  id: number;
  asin: string;
  title: string;
  brand: string | null;
  image_url: string | null;
  product_url: string | null;
  category: string | null;
  current_price: number | null;
  current_bsr: number | null;
  current_bsr_category: string | null;
  current_rating: number | null;
  current_reviews: number | null;
  current_is_best_seller: boolean;
  current_is_amazon_choice: boolean;
  current_monthly_bought: string | null;
  features: string | null;
  feature_bullets: string[] | null;
  description: string | null;
  // Extended product data
  seller_name: string | null;
  seller_id: string | null;
  availability: string | null;
  has_coupon: boolean;
  has_aplus: boolean;
  rating_breakdown: Record<string, number> | null;
  dimensions: string | null;
  weight: string | null;
  manufacturer: string | null;
  date_first_available: string | null;
  model_number: string | null;
  images: string[] | null;
  variations: ProductVariation[] | null;
  top_reviews: ProductReview[] | null;
  total_ratings: number | null;
  shipping_info: string | null;
  ships_from: string | null;
  // Additional product data
  list_price: number | null;
  full_description: string | null;
  small_description: string | null;
  brand_url: string | null;
  total_answered_questions: number | null;
  product_info_extra: Record<string, string> | null;
  // Seller competition (from Offers API)
  offers: OfferItem[] | null;
  total_offers: number | null;
  buy_box_seller: string | null;
  lowest_offer_price: number | null;
  fba_seller_count: number | null;
  // Keepa historical data
  keepa_trend: {
    direction: string;
    avg_bsr_change_pct: number;
    products_improving: number;
    products_declining: number;
    products_stable: number;
  } | null;
  keepa_seasonality: {
    bsr_volatility_ratio: number;
    is_seasonal: boolean;
    verdict: string;
  } | null;
  keepa_price_stability: {
    avg_cv: number;
    volatile_pct: number;
    avg_price_change_pct: number;
    prices_declining_pct: number;
    verdict: string;
  } | null;
  keepa_seller_dynamics: {
    avg_current_sellers: number;
    avg_seller_change_pct: number;
    sellers_increasing_pct: number;
    sellers_decreasing_pct: number;
    verdict: string;
  } | null;
  keepa_rating_evolution: {
    avg_rating_change: number;
    ratings_declining_pct: number;
    verdict: string;
  } | null;
  keepa_sales_estimate: {
    median_monthly_units: number;
    avg_monthly_units: number;
    min_monthly_units: number;
    max_monthly_units: number;
    source: string;
  } | null;
  keepa_data_confidence: number | null;
  keepa_products_analyzed: number | null;
  keepa_last_updated: string | null;
  // Tracking
  snapshots: ProductSnapshot[];
  check_interval_hours: number;
  is_active: boolean;
  is_paused: boolean;
  notes: string | null;
  from_keyword: string | null;
  from_analysis_id: number | null;
  last_checked_at: string | null;
  created_at: string | null;
}

export interface TrackedProductStats {
  total: number;
  avg_bsr: number | null;
  avg_price: number | null;
  paused: number;
  best_sellers: number;
  limit: number;
}
