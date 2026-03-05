"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, TrendingUp, Users, DollarSign, Star, ShieldCheck, Search,
  Brain, Eye, Loader2, Lightbulb, AlertTriangle, Target, CheckCircle,
  Factory, Repeat, ExternalLink, Package, Award, BadgeCheck, Flame, RefreshCw,
  Layers, Crosshair, BarChart3, Zap, MessageCircle, Send, Megaphone, Truck, BarChart2,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getAnalysis, getAIAnalysis, refreshAIAnalysis, getAnalysisProducts, addToWatchlist, checkWatchlist, rescrapeAnalysis, aiChat, analyzeNiche, trackProduct } from "@/lib/api";
import type { NicheAnalysis, AIInsight, Product, ScoreBreakdown } from "@/types";

// Three.js components — dynamic import (client-side only, no SSR)
const ScoreOrb3D = dynamic(() => import("@/components/ScoreOrb3D"), { ssr: false });
const ScoreRadar3D = dynamic(() => import("@/components/ScoreRadar3D"), { ssr: false });
const SaturationRing3D = dynamic(() => import("@/components/SaturationRing3D"), { ssr: false });
const MetricPillars3D = dynamic(() => import("@/components/MetricPillars3D"), { ssr: false });

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function formatBudget(n: number) {
  return n.toLocaleString("en-US");
}

const BUDGET_PRESETS = [5000, 10000, 15000, 20000, 30000, 50000];

function scoreColor(s: number | null) {
  if (s === null) return "var(--text-muted)";
  if (s >= 70) return "#10b981";
  if (s >= 55) return "#84cc16";
  if (s >= 40) return "#f59e0b";
  return "#ef4444";
}

function ScoreGauge({ label, score, icon: Icon, desc, loading }: { label: string; score: number | null; icon: React.ElementType; desc: string; loading?: boolean }) {
  const v = score ?? 0;
  const r = 36;
  const circ = 2 * Math.PI * r;
  return (
    <div className="card text-center" style={{ transition: "all 0.3s ease" }}>
      <div className="relative w-20 h-20 mx-auto mb-3">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent)" }} />
          </div>
        ) : (
          <>
            <svg viewBox="0 0 88 88" className="w-full h-full" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
              <circle
                cx="44" cy="44" r={r} fill="none"
                stroke={scoreColor(score)} strokeWidth="6"
                strokeDasharray={`${(v / 100) * circ} ${circ}`}
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 6px ${scoreColor(score)})`, transition: "stroke-dasharray 0.8s ease, stroke 0.3s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-black" style={{ color: scoreColor(score), transition: "color 0.3s ease" }}>{score ?? "--"}</span>
            </div>
          </>
        )}
      </div>
      <p className="text-sm font-bold">{label}</p>
      <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{desc}</p>
    </div>
  );
}

const tooltipStyle = { background: "#111420", border: "1px solid #1e2336", borderRadius: "10px", fontSize: "12px" };

function BreakdownSection({ title, icon: Icon, color, score, breakdown }: { title: string; icon: React.ComponentType<{ size?: number; color?: string }>; color: string; score: number | null; breakdown: ScoreBreakdown[] }) {
  if (!breakdown || breakdown.length === 0) return null;
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon size={16} color={color} />
          <h4 className="text-sm font-bold">{title}</h4>
        </div>
        <span className="text-lg font-black" style={{ color: scoreColor(score) }}>{score ?? "--"}</span>
      </div>
      <div className="space-y-2">
        {breakdown.map((b, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] font-medium">{b.signal}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{b.value}</span>
                <span className="text-[10px] font-bold" style={{ color: scoreColor(b.score) }}>{b.score}</span>
                <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{b.weight}%</span>
              </div>
            </div>
            <div className="w-full h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${b.score}%`, background: scoreColor(b.score) }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function severityColor(s: string) {
  if (s === "high") return "var(--danger)";
  if (s === "medium") return "var(--warning)";
  return "var(--success)";
}

function ProductCard({ p, rank, onTrack, tracking }: { p: Product; rank: number; onTrack?: (p: Product) => void; tracking?: boolean }) {
  return (
    <div
      className="rounded-xl p-3 flex gap-3 transition-all hover:scale-[1.01]"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
    >
      {/* Rank */}
      <span className="text-[10px] font-bold mt-1 w-4 flex-shrink-0" style={{ color: "var(--text-muted)" }}>
        {rank}
      </span>

      {/* Image */}
      <a
        href={p.product_url || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0"
      >
        {p.image_url ? (
          <img
            src={p.image_url}
            alt=""
            className="w-16 h-16 rounded-lg object-contain"
            style={{ background: "rgba(255,255,255,0.06)" }}
          />
        ) : (
          <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)" }}>
            <Package size={20} style={{ color: "var(--text-muted)" }} />
          </div>
        )}
      </a>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <a
          href={p.product_url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold hover:underline line-clamp-2 leading-snug"
          style={{ color: "var(--text-primary)" }}
        >
          {p.title}
        </a>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {p.brand && (
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{p.brand}</span>
          )}
          {p.is_prime && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>
              PRIME
            </span>
          )}
          {p.is_best_seller && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5" style={{ background: "rgba(249,115,22,0.12)", color: "#f97316" }}>
              <Award size={8} /> BEST SELLER
            </span>
          )}
          {p.is_amazon_choice && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}>
              <BadgeCheck size={8} /> CHOICE
            </span>
          )}
          {p.monthly_bought && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
              <Flame size={8} /> {p.monthly_bought}
            </span>
          )}
        </div>
        {/* Price + Rating row */}
        <div className="flex items-center gap-3 mt-1.5">
          {p.price ? (
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-black" style={{ color: "var(--success)" }}>${p.price.toFixed(2)}</span>
              {p.original_price && p.original_price > p.price && (
                <span className="text-[10px] line-through" style={{ color: "var(--text-muted)" }}>
                  ${p.original_price.toFixed(2)}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Sin precio</span>
          )}
          {p.rating && (
            <div className="flex items-center gap-0.5">
              <Star size={10} color="#f59e0b" fill="#f59e0b" />
              <span className="text-xs font-bold">{p.rating.toFixed(1)}</span>
            </div>
          )}
          {p.reviews_count != null && (
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {p.reviews_count.toLocaleString()} reviews
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1 flex-shrink-0 self-center">
        {onTrack && (
          <button
            onClick={() => onTrack(p)}
            disabled={tracking}
            className="p-2 rounded-lg transition-colors"
            style={{ background: "rgba(99,102,241,0.08)" }}
            title="Trackear ASIN"
          >
            {tracking ? <Loader2 size={14} className="animate-spin" color="#6366f1" /> : <Package size={14} color="#6366f1" />}
          </button>
        )}
        {p.product_url && (
          <a
            href={p.product_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg transition-colors"
            style={{ background: "rgba(249,115,22,0.08)" }}
            title="Ver en Amazon"
          >
            <ExternalLink size={14} color="var(--accent)" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function AnalysisDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [analysis, setAnalysis] = useState<NicheAnalysis | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAllProducts, setShowAllProducts] = useState(false);

  // AI state
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(true); // starts true — auto-loads
  const [aiError, setAiError] = useState("");
  const [aiCached, setAiCached] = useState(false);

  // Budget
  const [budget, setBudget] = useState(10000);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Sub-niche analysis
  const [analyzingSubNiche, setAnalyzingSubNiche] = useState<string | null>(null);

  // Rescrape state
  const [rescraping, setRescraping] = useState(false);

  // Watch state
  const [watched, setWatched] = useState(false);

  // ASIN tracking state
  const [trackingAsin, setTrackingAsin] = useState<string | null>(null);
  const [trackedAsins, setTrackedAsins] = useState<Set<string>>(new Set());

  async function handleTrackProduct(p: Product) {
    if (!analysis) return;
    setTrackingAsin(p.asin);
    try {
      await trackProduct({
        asin: p.asin,
        title: p.title,
        brand: p.brand || undefined,
        price: p.price || undefined,
        rating: p.rating || undefined,
        reviews_count: p.reviews_count || undefined,
        image_url: p.image_url || undefined,
        product_url: p.product_url || undefined,
        is_best_seller: p.is_best_seller || false,
        is_amazon_choice: p.is_amazon_choice || false,
        monthly_bought: p.monthly_bought || undefined,
        from_keyword: analysis.keyword,
        from_analysis_id: analysis.id,
      });
      setTrackedAsins((prev) => new Set(prev).add(p.asin));
    } catch { /* ignore */ }
    setTrackingAsin(null);
  }

  useEffect(() => {
    const id = Number(params.id);
    if (!id) return;

    // Load analysis + products + AI insight ALL in parallel
    getAnalysis(id)
      .then(setAnalysis)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    getAnalysisProducts(id)
      .then((res) => setProducts(res.products))
      .catch(() => {})
      .finally(() => setProductsLoading(false));

    // Auto-load AI analysis (uses cache if available)
    getAIAnalysis(id)
      .then((res) => {
        setAiInsight(res.insight);
        setAiCached(res.cached ?? false);
      })
      .catch((err) => setAiError(err instanceof Error ? err.message : "Error en análisis IA"))
      .finally(() => setAiLoading(false));
  }, [params.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Check if this keyword is already in the watchlist
  useEffect(() => {
    if (!analysis?.keyword) return;
    checkWatchlist(analysis.keyword)
      .then((res) => setWatched(res.watched))
      .catch(() => {});
  }, [analysis?.keyword]);

  async function handleRefreshAI() {
    if (!analysis) return;
    setAiLoading(true);
    setAiError("");
    setAiCached(false);
    setChatMessages([]);
    try {
      const res = await getAIAnalysis(analysis.id, budget);
      setAiInsight(res.insight);
      setAiCached(res.cached ?? false);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Error al refrescar análisis IA");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleWatch() {
    if (!analysis) return;
    try {
      await addToWatchlist({
        keyword: analysis.keyword,
        analysis_id: analysis.id,
        score: analysis.opportunity_score ?? undefined,
      });
      setWatched(true);
    } catch {
      // ignore
    }
  }

  async function handleRescrape() {
    if (!analysis) return;
    setRescraping(true);
    setProductsLoading(true);
    setAiLoading(true);
    setAiError("");
    try {
      const oldScores = {
        opportunity: analysis.opportunity_score,
        demand: analysis.demand_score,
        competition: analysis.competition_score,
        price: analysis.price_score,
        quality: analysis.quality_gap_score,
      };
      const result = await rescrapeAnalysis(analysis.id);
      console.log("[Recalcular] Scores ANTES:", oldScores);
      console.log("[Recalcular] Scores DESPUÉS:", {
        opportunity: result.opportunity_score,
        demand: result.demand_score,
        competition: result.competition_score,
        price: result.price_score,
        quality: result.quality_gap_score,
      });
      setAnalysis(result);
      const prods = await getAnalysisProducts(analysis.id);
      setProducts(prods.products);
      // Re-run AI analysis with the new scores
      try {
        const aiRes = await refreshAIAnalysis(result.id);
        setAiInsight(aiRes.insight);
        setAiCached(false);
      } catch {
        // AI refresh is best-effort
      }
    } catch {
      // ignore
    } finally {
      setRescraping(false);
      setProductsLoading(false);
      setAiLoading(false);
    }
  }

  async function handleAnalyzeSubNiche(keyword: string) {
    setAnalyzingSubNiche(keyword);
    try {
      const result = await analyzeNiche(keyword, 2, analysis?.keyword);
      // Use window.location to force full page load — router.push on same
      // dynamic route pattern (/analysis/[id]) doesn't re-mount the component.
      window.location.href = `/analysis/${result.id}`;
    } catch {
      setAnalyzingSubNiche(null);
    }
  }

  async function handleChatSend() {
    if (!chatInput.trim() || !analysis || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(newMessages);
    setChatLoading(true);
    try {
      const res = await aiChat(analysis.id, msg, newMessages.slice(0, -1), budget);
      setChatMessages([...newMessages, { role: "assistant", content: res.reply }]);
    } catch {
      setChatMessages([...newMessages, { role: "assistant", content: "Error al procesar tu mensaje. Intenta de nuevo." }]);
    } finally {
      setChatLoading(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-96"><div className="spinner" /></div>;
  if (error || !analysis) return (
    <div className="card text-center py-16">
      <p style={{ color: "var(--danger)" }}>{error || "Análisis no encontrado"}</p>
      <Link href="/history" className="btn btn-primary mt-4 inline-block">Volver al Historial</Link>
    </div>
  );

  const visibleProducts = showAllProducts ? products : products.slice(0, 15);

  return (
    <div>
      {/* Breadcrumb */}
      <Link href="/history" className="inline-flex items-center gap-2 text-sm mb-4 hover:underline" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} /> Volver al Historial
      </Link>

      {/* ===== 3D HERO SECTION ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Left: 3D Score Orb */}
        <div className="card flex flex-col items-center justify-center" style={{ minHeight: 320 }}>
          <ScoreOrb3D score={analysis.opportunity_score} loading={rescraping} />
        </div>

        {/* Center: Header Info + Actions */}
        <div className="flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold capitalize">{analysis.keyword}</h1>
              {analysis.parent_keyword && (
                <span className="text-[9px] font-bold px-2 py-1 rounded-full flex items-center gap-1" style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.2)" }}>
                  <Layers size={10} /> Sub-nicho
                </span>
              )}
            </div>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              {analysis.parent_keyword && (
                <span style={{ color: "#a855f7" }}>De &ldquo;{analysis.parent_keyword}&rdquo; &middot; </span>
              )}
              {analysis.total_products} productos &middot; {analysis.brand_count} marcas
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {analysis.created_at ? new Date(analysis.created_at).toLocaleString("es") : ""}
            </p>
          </div>

          {/* Quick metrics */}
          <div className="grid grid-cols-2 gap-2 my-4">
            {[
              { l: "Precio Prom", v: analysis.avg_price ? `$${analysis.avg_price.toFixed(2)}` : "--", c: "#f59e0b" },
              { l: "Rating Prom", v: analysis.avg_rating?.toFixed(1) ?? "--", c: "#f59e0b" },
              { l: "Reviews Prom", v: analysis.avg_reviews?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "--", c: "#6366f1" },
              { l: "% Prime", v: analysis.prime_percentage != null ? `${analysis.prime_percentage}%` : "--", c: "#10b981" },
            ].map((m) => (
              <div key={m.l} className="p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>{m.l}</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: m.c }}>{m.v}</p>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button onClick={handleWatch} disabled={watched} className="btn text-xs"
              style={watched ? { background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)", cursor: "default" } : undefined}
            >
              <Eye size={14} /> {watched ? "Vigilando" : "Vigilar"}
            </button>
            <button onClick={handleRescrape} disabled={rescraping} className="btn btn-primary text-xs">
              {rescraping ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {rescraping ? "Recalculando..." : "Recalcular"}
            </button>
            <button onClick={handleRefreshAI} disabled={aiLoading} className="btn btn-secondary text-xs">
              {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
              {aiLoading ? "Analizando..." : "Refrescar IA"}
            </button>
          </div>
        </div>

        {/* Right: 3D Radar — 4 sub-scores */}
        <div className="card" style={{ minHeight: 320 }}>
          <ScoreRadar3D
            demand={analysis.demand_score}
            competition={analysis.competition_score}
            price={analysis.price_score}
            quality={analysis.quality_gap_score}
            loading={rescraping}
          />
        </div>
      </div>

      {/* Budget Selector */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-3">
          <DollarSign size={16} color="#10b981" />
          <h3 className="text-sm font-bold">Presupuesto de Inversi&oacute;n</h3>
          <span className="text-lg font-black" style={{ color: "#10b981" }}>
            ${formatBudget(budget)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {BUDGET_PRESETS.map((b) => (
            <button
              key={b}
              onClick={() => setBudget(b)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background: budget === b ? "rgba(16,185,129,0.15)" : "var(--bg-elevated)",
                color: budget === b ? "#10b981" : "var(--text-secondary)",
                border: `1px solid ${budget === b ? "rgba(16,185,129,0.3)" : "transparent"}`,
              }}
            >
              ${formatBudget(b)}
            </button>
          ))}
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(Math.max(1000, parseInt(e.target.value) || 1000))}
            className="w-28 px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            min={1000}
            step={1000}
            placeholder="Custom..."
          />
        </div>
        <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
          Haz clic en &ldquo;Refrescar IA&rdquo; para re-analizar con este presupuesto. El chat siempre usa el presupuesto actual.
        </p>
      </div>

      {/* AI Analysis Section */}
      {aiError && (
        <div className="card flex items-center gap-3 mb-6" style={{ borderColor: "var(--danger)" }}>
          <AlertTriangle size={16} color="var(--danger)" />
          <p className="text-sm" style={{ color: "var(--danger)" }}>{aiError}</p>
        </div>
      )}

      {aiLoading && (
        <div className="card text-center py-10 mb-6" style={{ borderColor: "var(--accent)" }}>
          <div className="spinner mx-auto mb-3" />
          <p className="text-sm font-semibold">Claude está analizando este nicho...</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Calculando costos China, márgenes, ROI y estrategia de entrada</p>
        </div>
      )}

      {aiInsight && !aiInsight.error && (
        <div className="space-y-4 mb-8">
          {/* AI Verdict — Bold GO / NO-GO */}
          {(() => {
            const isGo = aiInsight.entry_strategy?.recommended ?? (aiInsight.score_label === "excellent" || aiInsight.score_label === "good");
            const goColor = isGo ? "#10b981" : "#ef4444";
            const goBg = isGo ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)";
            const goBorder = isGo ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)";
            return (
              <div
                className="rounded-2xl p-5 relative overflow-hidden"
                style={{ background: goBg, border: `2px solid ${goBorder}` }}
              >
                <div className="flex items-center gap-5">
                  {/* Big GO / NO-GO badge */}
                  <div
                    className="flex-shrink-0 w-24 h-24 rounded-2xl flex flex-col items-center justify-center"
                    style={{ background: `${goColor}15`, boxShadow: `0 0 30px ${goColor}20` }}
                  >
                    <span className="text-2xl font-black" style={{ color: goColor, letterSpacing: "-0.5px" }}>
                      {isGo ? "ENTRAR" : "NO"}
                    </span>
                    {!isGo && <span className="text-lg font-black -mt-1" style={{ color: goColor }}>ENTRAR</span>}
                    <Brain size={14} color={goColor} className="mt-1" />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Tags row */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-black uppercase px-2 py-1 rounded-lg" style={{ background: `${goColor}20`, color: goColor }}>
                        {aiInsight.score_label === "excellent" ? "Excelente" : aiInsight.score_label === "good" ? "Bueno" : aiInsight.score_label === "moderate" ? "Moderado" : "Difícil"}
                      </span>
                      {aiInsight.is_consumable && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>
                          <Repeat size={9} className="inline -mt-px mr-0.5" /> Consumible
                        </span>
                      )}
                      {aiInsight.repurchase_weeks && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                          Recompra {aiInsight.repurchase_weeks} sem
                        </span>
                      )}
                      {aiInsight.min_viable_volume?.mvv_achievable && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                          <BarChart2 size={9} className="inline -mt-px mr-0.5" /> VMV Alcanzable
                        </span>
                      )}
                      {aiInsight.ppc_strategy?.viable_with_ppc && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}>
                          <Megaphone size={9} className="inline -mt-px mr-0.5" /> Viable con PPC
                        </span>
                      )}
                      {aiInsight.fba_evaluation?.fba_opportunity === "alta" && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(249,115,22,0.1)", color: "#f97316" }}>
                          <Truck size={9} className="inline -mt-px mr-0.5" /> FBA Ventaja
                        </span>
                      )}
                      {aiCached && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>
                          En caché
                        </span>
                      )}
                    </div>

                    {/* Key numbers inline */}
                    {aiInsight.financials && (
                      <div className="flex items-center gap-4 mb-2 flex-wrap">
                        <span className="text-xs"><span className="font-bold" style={{ color: "#10b981" }}>Margen: {aiInsight.financials.margen_porcentaje}</span></span>
                        <span className="text-xs"><span className="font-bold" style={{ color: "var(--accent)" }}>ROI: {aiInsight.financials.roi_12_meses}</span></span>
                        <span className="text-xs"><span className="font-bold" style={{ color: "#f59e0b" }}>China: {aiInsight.financials.costo_unitario_china}</span></span>
                        <span className="text-xs"><span className="font-bold" style={{ color: "#6366f1" }}>Venta: {aiInsight.financials.precio_venta_sugerido}</span></span>
                      </div>
                    )}

                    {/* Verdict text */}
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{aiInsight.verdict}</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Financials Summary */}
          {aiInsight.financials && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign size={16} color="#10b981" />
                <h4 className="text-sm font-bold">Análisis Financiero</h4>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>${formatBudget(budget)}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                {[
                  { label: "Costo China", value: aiInsight.financials.costo_unitario_china, color: "#f59e0b" },
                  { label: "Precio Venta", value: aiInsight.financials.precio_venta_sugerido, color: "#10b981" },
                  { label: "Margen", value: `${aiInsight.financials.margen_neto_unidad} (${aiInsight.financials.margen_porcentaje})`, color: "#10b981" },
                  { label: "ROI 12M", value: aiInsight.financials.roi_12_meses, color: "var(--accent)" },
                ].map((m) => (
                  <div key={m.label} className="p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>{m.label}</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: m.color }}>{m.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: `Unidades con $${formatBudget(budget)}`, value: aiInsight.financials.unidades_con_10k },
                  { label: "Break-even", value: aiInsight.financials.breakeven_unidades, color: "#f59e0b" },
                  { label: "LTV/Año", value: aiInsight.financials.ltv_cliente_anual, color: "#10b981" },
                ].map((m) => (
                  <div key={m.label} className="p-2.5 rounded-xl text-center" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>{m.label}</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: m.color }}>{m.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Minimum Viable Volume + FBA Evaluation */}
          {(aiInsight.min_viable_volume || aiInsight.fba_evaluation) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {aiInsight.min_viable_volume && (
                <div className="card">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart2 size={16} color="#10b981" />
                    <h4 className="text-sm font-bold">Volumen M&iacute;nimo Viable</h4>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{
                        background: aiInsight.min_viable_volume.mvv_achievable ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                        color: aiInsight.min_viable_volume.mvv_achievable ? "#10b981" : "#ef4444",
                      }}
                    >
                      {aiInsight.min_viable_volume.mvv_achievable ? "Alcanzable" : "Dif\u00edcil"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {[
                      { label: "Breakeven/Mes", value: aiInsight.min_viable_volume.units_month_breakeven, color: "#f59e0b" },
                      { label: "% Mercado Necesario", value: aiInsight.min_viable_volume.market_percentage_needed, color: "#6366f1" },
                      { label: "Ventas Pos. 50-100", value: aiInsight.min_viable_volume.estimated_sales_position_50, color: "#10b981" },
                      { label: "Ventas Pos. 20-50", value: aiInsight.min_viable_volume.estimated_sales_position_20, color: "var(--accent)" },
                    ].map((m) => (
                      <div key={m.label} className="p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                        <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>{m.label}</p>
                        <p className="text-sm font-bold mt-0.5" style={{ color: m.color }}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                  {aiInsight.min_viable_volume.realistic_monthly_revenue && (
                    <div className="p-2.5 rounded-xl mb-3" style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)" }}>
                      <p className="text-[10px] font-bold uppercase" style={{ color: "#10b981" }}>Ingreso Mensual Realista</p>
                      <p className="text-sm font-bold mt-0.5">{aiInsight.min_viable_volume.realistic_monthly_revenue}</p>
                    </div>
                  )}
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {aiInsight.min_viable_volume.mvv_reasoning}
                  </p>
                </div>
              )}

              {aiInsight.fba_evaluation && (
                <div className="card">
                  <div className="flex items-center gap-2 mb-3">
                    <Truck size={16} color="#f97316" />
                    <h4 className="text-sm font-bold">Ventaja FBA</h4>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{
                        background: aiInsight.fba_evaluation.fba_opportunity === "alta" ? "rgba(16,185,129,0.1)" : aiInsight.fba_evaluation.fba_opportunity === "media" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                        color: aiInsight.fba_evaluation.fba_opportunity === "alta" ? "#10b981" : aiInsight.fba_evaluation.fba_opportunity === "media" ? "#f59e0b" : "#ef4444",
                      }}
                    >
                      Oportunidad {aiInsight.fba_evaluation.fba_opportunity === "alta" ? "Alta" : aiInsight.fba_evaluation.fba_opportunity === "media" ? "Media" : "Baja"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {aiInsight.fba_evaluation.prime_competitor_percentage && (
                      <div className="p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                        <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Competidores con Prime</p>
                        <p className="text-sm font-bold mt-0.5" style={{ color: "#6366f1" }}>{aiInsight.fba_evaluation.prime_competitor_percentage}</p>
                      </div>
                    )}
                    {aiInsight.fba_evaluation.buy_box_advantage && (
                      <div className="p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                        <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Ventaja Buy Box</p>
                        <p className="text-xs mt-0.5 leading-relaxed">{aiInsight.fba_evaluation.buy_box_advantage}</p>
                      </div>
                    )}
                    {aiInsight.fba_evaluation.conversion_impact && (
                      <div className="p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                        <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Impacto en Conversi&oacute;n</p>
                        <p className="text-xs mt-0.5 leading-relaxed">{aiInsight.fba_evaluation.conversion_impact}</p>
                      </div>
                    )}
                    {aiInsight.fba_evaluation.fbm_competitors && (
                      <div className="p-2.5 rounded-xl" style={{ background: "rgba(249,115,22,0.05)", border: "1px solid rgba(249,115,22,0.15)" }}>
                        <p className="text-[10px] font-bold uppercase" style={{ color: "#f97316" }}>Competidores FBM</p>
                        <p className="text-xs mt-0.5">{aiInsight.fba_evaluation.fbm_competitors}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PPC / Amazon Ads Strategy */}
          {aiInsight.ppc_strategy && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Megaphone size={16} color="#8b5cf6" />
                <h4 className="text-sm font-bold">Estrategia Amazon PPC</h4>
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{
                    background: aiInsight.ppc_strategy.viable_with_ppc ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                    color: aiInsight.ppc_strategy.viable_with_ppc ? "#10b981" : "#ef4444",
                  }}
                >
                  {aiInsight.ppc_strategy.viable_with_ppc ? "Viable con PPC" : "PPC No Recomendado"}
                </span>
              </div>

              {/* PPC Reasoning */}
              <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {aiInsight.ppc_strategy.ppc_reasoning}
              </p>

              {/* PPC Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                {[
                  { label: "CPC Estimado", value: aiInsight.ppc_strategy.estimated_cpc, color: "#8b5cf6" },
                  { label: "ACOS Objetivo", value: aiInsight.ppc_strategy.target_acos, color: "#f59e0b" },
                  { label: "Presupuesto/Mes", value: aiInsight.ppc_strategy.monthly_ad_budget, color: "#ef4444" },
                  { label: "Presupuesto/Día", value: aiInsight.ppc_strategy.daily_budget_suggested, color: "#6366f1" },
                ].map((m) => (
                  <div key={m.label} className="p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>{m.label}</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: m.color }}>{m.value}</p>
                  </div>
                ))}
              </div>

              {/* Long-tail Keywords */}
              {aiInsight.ppc_strategy.long_tail_keywords?.length > 0 && (
                <div className="p-2.5 rounded-xl mb-3" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-[10px] font-bold uppercase mb-1.5" style={{ color: "var(--text-muted)" }}>Keywords Long-Tail (menor CPC)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {aiInsight.ppc_strategy.long_tail_keywords.map((kw, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Launch Strategy + Risk without ads */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {aiInsight.ppc_strategy.launch_strategy && (
                  <div className="p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Estrategia de Lanzamiento</p>
                    <p className="text-xs mt-0.5 leading-relaxed">{aiInsight.ppc_strategy.launch_strategy}</p>
                  </div>
                )}
                {aiInsight.ppc_strategy.risk_without_ads && (
                  <div className="p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Sin Ads</p>
                    <p className="text-xs mt-0.5 leading-relaxed">{aiInsight.ppc_strategy.risk_without_ads}</p>
                  </div>
                )}
              </div>

              {/* Break-even with ads */}
              {aiInsight.ppc_strategy.breakeven_with_ads && (
                <div className="p-2.5 rounded-xl mt-3" style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.15)" }}>
                  <p className="text-[10px] font-bold uppercase" style={{ color: "#8b5cf6" }}>Break-even con PPC</p>
                  <p className="text-xs mt-0.5">{aiInsight.ppc_strategy.breakeven_with_ads}</p>
                </div>
              )}
            </div>
          )}

          {/* Entry Strategy + Product Ideas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aiInsight.entry_strategy && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <Target size={16} color="var(--accent)" />
                  <h4 className="text-sm font-bold">Estrategia de Entrada</h4>
                  <span className={`badge ${aiInsight.entry_strategy.recommended ? "badge-success" : "badge-danger"}`} style={{ fontSize: "10px" }}>
                    {aiInsight.entry_strategy.recommended ? "GO" : "NO-GO"}
                  </span>
                </div>
                <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>{aiInsight.entry_strategy.reasoning}</p>
                <div className="space-y-2">
                  <div className="p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Diferenciación</p>
                    <p className="text-xs mt-0.5">{aiInsight.entry_strategy.differentiation_angle}</p>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                      <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Precio Objetivo</p>
                      <p className="text-xs mt-0.5">{aiInsight.entry_strategy.target_price}</p>
                    </div>
                    <div className="flex-1 p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                      <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Rating Obj.</p>
                      <p className="text-xs mt-0.5">{aiInsight.entry_strategy.target_rating}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {aiInsight.product_ideas && aiInsight.product_ideas.length > 0 && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb size={16} color="#f59e0b" />
                  <h4 className="text-sm font-bold">Ideas de Producto</h4>
                </div>
                <div className="space-y-2">
                  {aiInsight.product_ideas.slice(0, 3).map((idea, i) => (
                    <div key={i} className="p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{idea.name}</span>
                        <div className="flex items-center gap-1.5">
                          {idea.subscribe_save && (
                            <span className="text-[8px] px-1 py-0.5 rounded font-bold" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>S&amp;S</span>
                          )}
                          <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>{idea.estimated_price}</span>
                        </div>
                      </div>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{idea.description}</p>
                      {idea.china_cost && (
                        <p className="text-[10px] mt-1" style={{ color: "#f59e0b" }}>
                          China: {idea.china_cost} &middot; Margen: {idea.target_margin}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sourcing China + Risks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aiInsight.sourcing && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <Factory size={16} color="#f97316" />
                  <h4 className="text-sm font-bold">Sourcing China</h4>
                </div>
                <div className="space-y-2">
                  <div className="p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Proveedor</p>
                    <p className="text-xs mt-0.5">{aiInsight.sourcing.tipo_proveedor}</p>
                  </div>
                  {aiInsight.sourcing.palabras_clave_alibaba?.length > 0 && (
                    <div className="p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                      <p className="text-[10px] font-bold uppercase mb-1" style={{ color: "var(--text-muted)" }}>Keywords Alibaba</p>
                      <div className="flex flex-wrap gap-1">
                        {aiInsight.sourcing.palabras_clave_alibaba.map((kw, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(249,115,22,0.1)", color: "#f97316" }}>
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {aiInsight.sourcing.certificaciones_necesarias?.length > 0 && (
                    <div className="p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                      <p className="text-[10px] font-bold uppercase mb-1" style={{ color: "var(--text-muted)" }}>Certificaciones</p>
                      <div className="flex flex-wrap gap-1">
                        {aiInsight.sourcing.certificaciones_necesarias.map((c, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {aiInsight.sourcing.tiempo_produccion_dias && (
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Producción: {aiInsight.sourcing.tiempo_produccion_dias} días
                    </p>
                  )}
                </div>
              </div>
            )}

            {aiInsight.risks && aiInsight.risks.length > 0 && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={16} color="var(--warning)" />
                  <h4 className="text-sm font-bold">Riesgos</h4>
                </div>
                <div className="space-y-2">
                  {aiInsight.risks.map((risk, i) => (
                    <div key={i} className="p-2.5 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: severityColor(risk.severity) }} />
                        <span className="text-xs font-bold">{risk.risk}</span>
                      </div>
                      <p className="text-[11px] mt-0.5 ml-3.5" style={{ color: "var(--text-muted)" }}>{risk.mitigation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sub-Niches */}
          {aiInsight.sub_niches && aiInsight.sub_niches.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={16} color="#a855f7" />
                <h4 className="text-sm font-bold">Sub-Nichos para Explorar</h4>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7" }}>
                  {aiInsight.sub_niches.length} opciones
                </span>
              </div>
              <div className="space-y-2">
                {aiInsight.sub_niches.map((sn, i) => (
                  <div key={i} className="p-3 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold">{sn.keyword_amazon}</span>
                      <div className="flex items-center gap-2">
                        {sn.price_range && (
                          <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>{sn.price_range}</span>
                        )}
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{
                          background: sn.competition === "baja" ? "rgba(16,185,129,0.1)" : sn.competition === "media" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                          color: sn.competition === "baja" ? "#10b981" : sn.competition === "media" ? "#f59e0b" : "#ef4444",
                        }}>
                          {sn.competition === "baja" ? "Baja comp." : sn.competition === "media" ? "Media comp." : "Alta comp."}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] mb-1.5" style={{ color: "var(--text-muted)" }}>{sn.why_viable}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(249,115,22,0.1)", color: "#f97316" }}>
                        Alibaba: {sn.keyword_alibaba}
                      </span>
                      <button
                        onClick={() => handleAnalyzeSubNiche(sn.keyword_amazon)}
                        disabled={analyzingSubNiche !== null}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:scale-[1.03]"
                        style={{
                          background: analyzingSubNiche === sn.keyword_amazon ? "rgba(168,85,247,0.2)" : "rgba(168,85,247,0.1)",
                          color: "#a855f7",
                          border: "1px solid rgba(168,85,247,0.2)",
                        }}
                      >
                        {analyzingSubNiche === sn.keyword_amazon ? (
                          <><Loader2 size={10} className="animate-spin" /> Analizando...</>
                        ) : (
                          <><Search size={10} /> Analizar</>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next Steps */}
          {aiInsight.next_steps && aiInsight.next_steps.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={16} color="var(--success)" />
                <h4 className="text-sm font-bold">Próximos Pasos</h4>
              </div>
              <ol className="space-y-2">
                {aiInsight.next_steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                    <span className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--accent-glow)", color: "var(--accent)" }}>
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* AI Brain Chat */}
      {aiInsight && !aiInsight.error && (
        <div className="card mb-8" style={{ border: "1px solid rgba(99,102,241,0.2)" }}>
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              <MessageCircle size={16} color="#fff" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold">AI Brain Chat</h3>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Pregunta lo que quieras sobre {analysis.keyword} &middot; ${formatBudget(budget)}
              </p>
            </div>
          </div>

          <div
            className="rounded-xl overflow-y-auto p-4 space-y-3 mb-4"
            style={{ background: "var(--bg-elevated)", minHeight: "100px", maxHeight: "400px" }}
          >
            {chatMessages.length === 0 && (
              <div className="text-center py-4">
                <Brain size={24} color="var(--text-muted)" className="mx-auto mb-2" />
                <p className="text-xs font-semibold mb-3" style={{ color: "var(--text-muted)" }}>
                  Pregunta lo que quieras sobre este nicho
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    "\u00bfQu\u00e9 pasa si vendo a $25?",
                    "\u00bfQu\u00e9 proveedores recomiendas?",
                    "\u00bfC\u00f3mo gano el Buy Box?",
                    "Explica los riesgos",
                    "\u00bfCu\u00e1nto puedo ganar al mes?",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => setChatInput(q)}
                      className="text-[11px] px-3 py-1.5 rounded-full transition-colors hover:bg-white/5"
                      style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed"
                  style={{
                    background: msg.role === "user"
                      ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                      : "rgba(0,0,0,0.3)",
                    color: msg.role === "user" ? "#fff" : "var(--text-primary)",
                  }}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-xl" style={{ background: "rgba(0,0,0,0.3)" }}>
                  <Loader2 size={14} className="animate-spin" style={{ color: "var(--accent)" }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); handleChatSend(); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Pregunta sobre el nicho..."
              className="flex-1 px-4 py-2.5 rounded-xl text-sm"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              disabled={chatLoading}
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || chatLoading}
              className="px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs font-bold transition-colors"
              style={{
                background: chatInput.trim() ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "var(--bg-elevated)",
                color: chatInput.trim() ? "#fff" : "var(--text-muted)",
              }}
            >
              <Send size={14} />
              Enviar
            </button>
          </form>
        </div>
      )}

      {/* 3D Key Metrics Pillars */}
      <div className="card mb-8">
        <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
          <BarChart3 size={16} color="var(--accent)" /> Pilares del Nicho
        </h3>
        <MetricPillars3D metrics={[
          { label: "Precio Prom", value: analysis.avg_price ? `$${analysis.avg_price.toFixed(0)}` : "--", normalizedHeight: Math.min(1, (analysis.avg_price ?? 0) / 100), color: "#f59e0b" },
          { label: "Reviews Med", value: analysis.median_reviews?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "--", normalizedHeight: Math.min(1, (analysis.median_reviews ?? 0) / 2000), color: "#6366f1" },
          { label: "BSR Prom", value: analysis.avg_bsr ? `${(analysis.avg_bsr / 1000).toFixed(0)}K` : "--", normalizedHeight: Math.min(1, 1 - (analysis.avg_bsr ?? 0) / 500000), color: "#10b981" },
          { label: "Revenue Est", value: analysis.revenue_estimate ? `$${(analysis.revenue_estimate / 1000).toFixed(0)}K` : "--", normalizedHeight: Math.min(1, (analysis.revenue_estimate ?? 0) / 50000), color: "#ef4444" },
        ]} />
      </div>

      {/* Score Breakdowns — 4-card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <BreakdownSection title="Demanda" icon={TrendingUp} color="#10b981" score={analysis.demand_score} breakdown={analysis.demand_breakdown} />
        <BreakdownSection title="Competencia" icon={Users} color="#6366f1" score={analysis.competition_score} breakdown={analysis.competition_breakdown} />
        <BreakdownSection title="Precio" icon={DollarSign} color="#f59e0b" score={analysis.price_score} breakdown={analysis.price_breakdown} />
        <BreakdownSection title="Calidad" icon={Star} color="#ef4444" score={analysis.quality_gap_score} breakdown={analysis.quality_breakdown} />
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {[
          { l: "Precio Prom", v: analysis.avg_price ? `$${analysis.avg_price.toFixed(2)}` : "--" },
          { l: "Precio Mediana", v: analysis.median_price ? `$${analysis.median_price.toFixed(2)}` : "--" },
          { l: "Rating Prom", v: analysis.avg_rating ?? "--" },
          { l: "Reviews Prom", v: analysis.avg_reviews?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "--" },
        ].map((m) => (
          <div key={m.l} className="metric-tile">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{m.l}</p>
            {rescraping ? (
              <div className="mt-2"><Loader2 size={16} className="animate-spin" style={{ color: "var(--text-muted)" }} /></div>
            ) : (
              <p className="text-lg font-bold mt-1" style={{ transition: "all 0.3s ease" }}>{m.v}</p>
            )}
          </div>
        ))}
      </div>

      {/* Extended Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {[
          { l: "Ingreso Est/Mes", v: analysis.revenue_estimate ? `$${Math.round(analysis.revenue_estimate).toLocaleString()}` : "--", color: "#10b981" },
          { l: "Reviews Mediana", v: analysis.median_reviews?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "--", color: "#6366f1" },
          { l: "% Prime", v: analysis.prime_percentage != null ? `${analysis.prime_percentage}%` : "--", color: "#6366f1" },
          { l: "% Con Ventas", v: analysis.monthly_bought_percentage != null ? `${analysis.monthly_bought_percentage}%` : "--", color: "#f97316" },
          { l: "BSR Promedio", v: analysis.avg_bsr ? Math.round(analysis.avg_bsr).toLocaleString() : "--", color: "#f59e0b" },
        ].map((m) => (
          <div key={m.l} className="metric-tile">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{m.l}</p>
            {rescraping ? (
              <div className="mt-2"><Loader2 size={16} className="animate-spin" style={{ color: "var(--text-muted)" }} /></div>
            ) : (
              <p className="text-lg font-bold mt-1" style={{ color: m.color, transition: "all 0.3s ease" }}>{m.v}</p>
            )}
          </div>
        ))}
      </div>

      {/* 3D Market Saturation Ring */}
      {analysis.saturation && (
        <div className="card mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Layers size={16} color="#6366f1" />
            <h3 className="text-sm font-bold">Saturación del Mercado</h3>
          </div>
          <SaturationRing3D
            newcomers={analysis.saturation.newcomers}
            growing={analysis.saturation.growing}
            established={analysis.saturation.established}
            dominant={analysis.saturation.dominant}
            newcomersPct={analysis.saturation.newcomers_pct}
            growingPct={analysis.saturation.growing_pct}
            establishedPct={analysis.saturation.established_pct}
            dominantPct={analysis.saturation.dominant_pct}
            verdict={analysis.saturation.verdict}
          />
          {/* Legend row */}
          <div className="grid grid-cols-4 gap-2 mt-2">
            {[
              { label: "Nuevos (<50 rev)", count: analysis.saturation.newcomers, pct: analysis.saturation.newcomers_pct, color: "#10b981" },
              { label: "Crecimiento (50-200)", count: analysis.saturation.growing, pct: analysis.saturation.growing_pct, color: "#6366f1" },
              { label: "Establecidos (200-1K)", count: analysis.saturation.established, pct: analysis.saturation.established_pct, color: "#f59e0b" },
              { label: "Dominantes (1K+)", count: analysis.saturation.dominant, pct: analysis.saturation.dominant_pct, color: "#ef4444" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-[10px] font-bold" style={{ color: s.color }}>{s.count}</span>
                </div>
                <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                <p className="text-[10px] font-bold">{s.pct.toFixed(1)}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Price Opportunity Window */}
      {analysis.price_opportunity && analysis.price_opportunity.ranges.length > 0 && (
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Crosshair size={16} color="#f59e0b" />
              <h3 className="text-sm font-bold">Ventana de Oportunidad de Precio</h3>
            </div>
            {analysis.price_opportunity.best_range && (
              <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                Mejor: {analysis.price_opportunity.best_range}
              </span>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rango</th>
                  <th style={{ textAlign: "right" }}>Productos</th>
                  <th style={{ textAlign: "right" }}>Reviews Prom</th>
                  <th style={{ textAlign: "right" }}>Rating Prom</th>
                  <th style={{ textAlign: "center" }}>Demanda</th>
                  <th style={{ textAlign: "center" }}>Facilidad</th>
                </tr>
              </thead>
              <tbody>
                {analysis.price_opportunity.ranges.map((r) => (
                  <tr key={r.range} style={r.range === analysis.price_opportunity?.best_range ? { background: "rgba(16,185,129,0.05)" } : undefined}>
                    <td className="font-medium">{r.range}</td>
                    <td style={{ textAlign: "right" }}>{r.count}</td>
                    <td style={{ textAlign: "right" }}>{r.avg_reviews.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td style={{ textAlign: "right" }}>{r.avg_rating?.toFixed(1) ?? "--"}</td>
                    <td style={{ textAlign: "center" }}>
                      {r.has_demand ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>S&iacute;</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-muted)" }}>Baja</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                        background: r.entry_ease === "F\u00e1cil" ? "rgba(16,185,129,0.1)" : r.entry_ease === "Moderado" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                        color: r.entry_ease === "F\u00e1cil" ? "#10b981" : r.entry_ease === "Moderado" ? "#f59e0b" : "#ef4444",
                      }}>
                        {r.entry_ease === "F\u00e1cil" ? "F\u00e1cil" : r.entry_ease === "Moderado" ? "Moderado" : "Dif\u00edcil"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ====== PRODUCTS TABLE ====== */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(249,115,22,0.1)" }}>
              <Package size={16} color="var(--accent)" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Productos Encontrados</h2>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {products.length} productos del nicho &ldquo;{analysis.keyword}&rdquo; en Amazon US
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {products.length > 0 && (
              <span className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>
                Precio: ${analysis.min_price?.toFixed(0) ?? "?"} - ${analysis.max_price?.toFixed(0) ?? "?"}
              </span>
            )}
            <button
              onClick={handleRescrape}
              disabled={rescraping}
              className="btn btn-secondary text-xs"
              title="Re-scrapear con datos frescos"
            >
              {rescraping ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {rescraping ? "Scrapeando..." : "Re-scrapear"}
            </button>
          </div>
        </div>

        {productsLoading ? (
          <div className="card text-center py-10">
            <div className="spinner mx-auto mb-3" />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Cargando productos...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="card text-center py-10">
            <Package size={24} style={{ color: "var(--text-muted)", margin: "0 auto 8px" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No se encontraron productos guardados para este análisis</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {visibleProducts.map((p, i) => (
                <ProductCard key={p.asin} p={p} rank={i + 1} onTrack={trackedAsins.has(p.asin) ? undefined : handleTrackProduct} tracking={trackingAsin === p.asin} />
              ))}
            </div>
            {products.length > 15 && (
              <div className="text-center mt-4">
                <button
                  onClick={() => setShowAllProducts(!showAllProducts)}
                  className="btn btn-secondary text-xs"
                >
                  {showAllProducts ? "Mostrar menos" : `Ver todos (${products.length} productos)`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="text-sm font-bold mb-4">Distribución de Precios</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={analysis.price_distribution}>
              <XAxis dataKey="range" tick={{ fill: "#5c6380", fontSize: 11 }} />
              <YAxis tick={{ fill: "#5c6380", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-sm font-bold mb-4">Distribución de Reviews</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={analysis.review_distribution}>
              <XAxis dataKey="range" tick={{ fill: "#5c6380", fontSize: 11 }} />
              <YAxis tick={{ fill: "#5c6380", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Ratings Distribution */}
      <div className="grid grid-cols-1 gap-6 mb-8">
        <div className="card">
          <h3 className="text-sm font-bold mb-4">Distribución de Ratings</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={analysis.rating_distribution}>
              <XAxis dataKey="range" tick={{ fill: "#5c6380", fontSize: 11 }} />
              <YAxis tick={{ fill: "#5c6380", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>


      {/* Summary — data-based quick verdict */}
      {(() => {
        const sc = analysis.opportunity_score ?? 0;
        const dataGo = sc >= 55;
        const vColor = dataGo ? "#10b981" : sc >= 40 ? "#f59e0b" : "#ef4444";
        return (
          <div
            className="rounded-2xl p-5 flex items-center gap-5"
            style={{ background: `${vColor}08`, border: `2px solid ${vColor}30` }}
          >
            <div
              className="flex-shrink-0 w-16 h-16 rounded-xl flex flex-col items-center justify-center"
              style={{ background: `${vColor}15` }}
            >
              <ShieldCheck size={20} color={vColor} />
              <span className="text-[10px] font-black mt-0.5" style={{ color: vColor }}>
                {sc >= 65 ? "GO" : sc >= 40 ? "QUIZÁS" : "NO-GO"}
              </span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <span className="text-sm font-black" style={{ color: vColor }}>
                  {sc >= 65 ? "Oportunidad fuerte para marca privada consumible" : sc >= 40 ? "Oportunidad moderada — requiere diferenciación" : "Nicho difícil — alta competencia o márgenes bajos"}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                {(analysis.top3_brand_share ?? 0) <= 40 && <span>Mercado fragmentado ({analysis.top3_brand_share?.toFixed(1)}% top-3)</span>}
                {(analysis.top3_brand_share ?? 0) > 60 && <span>Mercado concentrado ({analysis.top3_brand_share?.toFixed(1)}% top-3)</span>}
                {analysis.avg_price && <span>Precio prom: ${analysis.avg_price.toFixed(2)}</span>}
                {(analysis.avg_rating ?? 5) < 4.0 && <span>Rating bajo ({analysis.avg_rating}) = oportunidad</span>}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
