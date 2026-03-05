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
}

export interface PriceOpportunity {
  best_range: string;
  ranges: PriceOpportunityRange[];
}

export interface PriceRange {
  range: string;
  count: number;
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
  revenue_estimate: number | null;
  median_reviews: number | null;
  prime_percentage: number | null;
  monthly_bought_percentage: number | null;
  demand_breakdown: ScoreBreakdown[];
  competition_breakdown: ScoreBreakdown[];
  price_breakdown: ScoreBreakdown[];
  quality_breakdown: ScoreBreakdown[];
  saturation: SaturationData | null;
  price_opportunity: PriceOpportunity | null;
  price_distribution: PriceRange[];
  rating_distribution: { range: string; count: number }[];
  review_distribution: { range: string; count: number }[];
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

export interface AIFinancials {
  costo_unitario_china: string;
  costo_envio_unidad: string;
  costo_amazon_fba: string;
  amazon_referral_fee: string;
  costo_total_por_unidad: string;
  precio_venta_sugerido: string;
  margen_neto_unidad: string;
  margen_porcentaje: string;
  unidades_con_10k: string;
  moq_china: string;
  breakeven_unidades: string;
  roi_6_meses: string;
  roi_12_meses: string;
  ltv_cliente_anual: string;
}

export interface AISourcing {
  tipo_proveedor: string;
  palabras_clave_alibaba: string[];
  certificaciones_necesarias: string[];
  tiempo_produccion_dias: number;
  consejo_negociacion: string;
}

export interface AIProductIdea {
  name: string;
  description: string;
  estimated_price: string;
  why: string;
  china_cost?: string;
  size_suggestion?: string;
  subscribe_save?: boolean;
  packaging_idea?: string;
  target_margin?: string;
  difficulty?: string;
  tagline?: string;
  target_price?: string;
  key_features?: string[];
  target_audience?: string;
  competitive_edge?: string;
  estimated_monthly_units?: string;
  investment_level?: string;
}

export interface AIRisk {
  risk: string;
  severity: string;
  mitigation: string;
}

export interface AIGoNoGo {
  decision: string; // "go" | "no-go" | "caution"
  margin_without_brand: boolean;
  margin_above_30: boolean;
  median_reviews_below_300: boolean;
  market_not_saturated: boolean;
  price_in_fba_range: boolean;
  no_complex_certs: boolean;
  generic_entry_viable: boolean;
  summary: string;
}

export interface AIPhaseRecommendation {
  current_phase: string;
  requires_brand_from_start: boolean;
  brand_reason: string;
  buy_box_risk?: string;
  private_label_trigger: string;
  private_label_investment: string;
}

export interface AISubNiche {
  keyword_amazon: string;
  keyword_alibaba: string;
  competition: string;
  why_viable: string;
  price_range: string;
}

export interface AIInsight {
  verdict: string;
  score_label: string;
  is_consumable?: boolean;
  repurchase_weeks?: number;
  go_no_go?: AIGoNoGo;
  phase_recommendation?: AIPhaseRecommendation;
  entry_strategy?: AIEntryStrategy;
  financials?: AIFinancials;
  sourcing?: AISourcing;
  product_ideas?: AIProductIdea[];
  risks?: AIRisk[];
  sub_niches?: AISubNiche[];
  competitive_advantages?: string[];
  market_insights?: string[];
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
export interface ScoreHistoryPoint {
  score: number;
  date: string;
}

export interface WatchlistItem {
  id: number;
  keyword: string;
  last_analysis_id: number | null;
  last_score: number | null;
  previous_score: number | null;
  score_trend: string | null;
  score_history: ScoreHistoryPoint[];
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

export interface ProductVariation {
  name: string;
  values: string[];
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
