import type {
  DashboardSummary,
  NicheAnalysis,
  SearchResult,
  Category,
  AnalysisHistoryItem,
  AnalysisProductsResponse,
  AIAnalysisResponse,
  AICompareResponse,
  WatchlistItem,
  WatchlistStats,
  AppNotification,
  SmartNichesResponse,
  TrackedProduct,
  TrackedProductStats,
  UserProfile,
  QuickCheckResult,
} from "@/types";

const API_BASE = "/api";
const MAX_RETRIES = 2;
const RETRY_DELAY = 1500;

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: "Request failed" }));
        throw new Error(error.detail || `HTTP ${res.status}`);
      }
      return res.json();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Only retry on network/connection errors, not HTTP errors from the server
      const isNetworkError = lastError.message === "Failed to fetch" || lastError.message.includes("fetch");
      if (!isNetworkError || attempt === MAX_RETRIES) break;
      await new Promise((r) => setTimeout(r, RETRY_DELAY * (attempt + 1)));
    }
  }

  throw lastError!;
}

export async function searchProducts(
  keyword: string,
  page = 1
): Promise<SearchResult> {
  return fetchAPI(`/search?q=${encodeURIComponent(keyword)}&page=${page}`);
}

export async function analyzeNiche(
  keyword: string,
  pages = 2,
  parentKeyword?: string
): Promise<NicheAnalysis> {
  return fetchAPI("/analysis/niche", {
    method: "POST",
    body: JSON.stringify({ keyword, pages, parent_keyword: parentKeyword || null }),
  });
}

export async function getAnalysis(id: number): Promise<NicheAnalysis> {
  return fetchAPI(`/analysis/${id}`);
}

export async function getAnalysisProducts(analysisId: number): Promise<AnalysisProductsResponse> {
  return fetchAPI(`/analysis/${analysisId}/products`);
}

export async function quickCheck(keyword: string): Promise<QuickCheckResult> {
  return fetchAPI("/analysis/quick-check", {
    method: "POST",
    body: JSON.stringify({ keyword }),
  });
}

export async function rescrapeAnalysis(analysisId: number): Promise<NicheAnalysis> {
  return fetchAPI(`/analysis/${analysisId}/rescrape`, { method: "POST" });
}

export async function getAnalysisHistory(): Promise<{
  total: number;
  analyses: AnalysisHistoryItem[];
}> {
  return fetchAPI("/analysis/history");
}

export async function getDashboard(): Promise<DashboardSummary> {
  return fetchAPI("/analysis/dashboard");
}

export async function getCategories(): Promise<{
  categories: Category[];
  total: number;
}> {
  return fetchAPI("/categories");
}

export async function getPopularNiches(): Promise<{ niches: string[] }> {
  return fetchAPI("/categories/popular-niches");
}

export async function getSmartNiches(): Promise<SmartNichesResponse> {
  return fetchAPI("/categories/smart-niches");
}

// AI Advisor
export async function getAIAnalysis(analysisId: number, budget?: number): Promise<AIAnalysisResponse> {
  return fetchAPI("/ai/analyze", {
    method: "POST",
    body: JSON.stringify({ analysis_id: analysisId, budget: budget || null }),
  });
}

export async function refreshAIAnalysis(analysisId: number): Promise<AIAnalysisResponse> {
  return fetchAPI(`/ai/refresh/${analysisId}`, { method: "POST" });
}

export async function compareNiches(analysisIds: number[], budget?: number): Promise<AICompareResponse> {
  return fetchAPI("/ai/compare", {
    method: "POST",
    body: JSON.stringify({ analysis_ids: analysisIds, budget: budget || null }),
  });
}

export async function getProductIdeas(analysisId: number): Promise<{ niche: string; product_ideas: Array<Record<string, unknown>>; cached: boolean }> {
  return fetchAPI("/ai/product-ideas", {
    method: "POST",
    body: JSON.stringify({ analysis_id: analysisId }),
  });
}

export async function aiChat(
  analysisId: number,
  message: string,
  history?: { role: string; content: string }[],
  budget?: number
): Promise<{ reply: string; analysis_id: number; keyword: string }> {
  return fetchAPI("/ai/chat", {
    method: "POST",
    body: JSON.stringify({
      analysis_id: analysisId,
      message,
      history: history || [],
      budget: budget || null,
    }),
  });
}

// Watchlist
export async function getWatchlist(): Promise<{ total: number; items: WatchlistItem[] }> {
  return fetchAPI("/watchlist");
}

export async function checkWatchlist(keyword: string): Promise<{ watched: boolean; item_id: number | null }> {
  return fetchAPI(`/watchlist/check/${encodeURIComponent(keyword)}`);
}

export async function addToWatchlist(data: {
  keyword: string;
  analysis_id?: number;
  score?: number;
  interval_hours?: number;
  notes?: string;
}): Promise<WatchlistItem> {
  return fetchAPI("/watchlist", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function removeFromWatchlist(itemId: number): Promise<void> {
  return fetchAPI(`/watchlist/${itemId}`, { method: "DELETE" });
}

export async function getWatchlistStats(): Promise<WatchlistStats> {
  return fetchAPI("/watchlist/stats");
}

export async function forceReanalyze(itemId: number): Promise<WatchlistItem> {
  return fetchAPI(`/watchlist/${itemId}/reanalyze`, { method: "POST" });
}

export async function togglePauseWatchlist(itemId: number): Promise<WatchlistItem> {
  return fetchAPI(`/watchlist/${itemId}/pause`, { method: "PUT" });
}

// Notifications
export async function getNotifications(unreadOnly = false): Promise<{
  total: number;
  unread_count: number;
  notifications: AppNotification[];
}> {
  return fetchAPI(`/watchlist/notifications?unread_only=${unreadOnly}`);
}

export async function getUnreadCount(): Promise<{ count: number }> {
  return fetchAPI("/watchlist/notifications/unread-count");
}

export async function markNotificationRead(id: number): Promise<void> {
  return fetchAPI(`/watchlist/notifications/${id}/read`, { method: "PUT" });
}

export async function markAllNotificationsRead(): Promise<void> {
  return fetchAPI("/watchlist/notifications/read-all", { method: "PUT" });
}

// ASIN Tracker
export async function getTrackedProducts(): Promise<{ total: number; items: TrackedProduct[] }> {
  return fetchAPI("/tracked-products");
}

export async function trackProduct(data: {
  asin: string;
  title?: string;
  brand?: string;
  price?: number;
  rating?: number;
  reviews_count?: number;
  bsr?: number;
  bsr_category?: string;
  image_url?: string;
  product_url?: string;
  is_best_seller?: boolean;
  is_amazon_choice?: boolean;
  monthly_bought?: string;
  from_keyword?: string;
  from_analysis_id?: number;
  notes?: string;
  interval_hours?: number;
}): Promise<TrackedProduct> {
  return fetchAPI("/tracked-products", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getTrackedProductStats(): Promise<TrackedProductStats> {
  return fetchAPI("/tracked-products/stats");
}

export async function checkTrackedProduct(asin: string): Promise<{ tracked: boolean; item_id: number | null }> {
  return fetchAPI(`/tracked-products/check/${encodeURIComponent(asin)}`);
}

export async function getTrackedProduct(productId: number): Promise<TrackedProduct> {
  return fetchAPI(`/tracked-products/${productId}`);
}

export async function refreshTrackedProduct(productId: number): Promise<TrackedProduct> {
  return fetchAPI(`/tracked-products/${productId}/refresh`, { method: "POST" });
}

export async function togglePauseTracked(productId: number): Promise<TrackedProduct> {
  return fetchAPI(`/tracked-products/${productId}/pause`, { method: "PUT" });
}

export async function removeTrackedProduct(productId: number): Promise<void> {
  return fetchAPI(`/tracked-products/${productId}`, { method: "DELETE" });
}

// User Profile
export async function getUserProfile(): Promise<UserProfile> {
  return fetchAPI("/profile");
}

export async function updateUserProfile(profile: Omit<UserProfile, "updated_at">): Promise<UserProfile> {
  return fetchAPI("/profile", {
    method: "PUT",
    body: JSON.stringify(profile),
  });
}
