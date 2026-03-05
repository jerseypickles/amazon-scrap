"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, TrendingUp, Users, DollarSign, Star, ShieldCheck, Search,
  Brain, Eye, Loader2, Lightbulb, AlertTriangle, Target, CheckCircle,
  Factory, Repeat, ExternalLink, Package, Award, BadgeCheck, Flame, RefreshCw,
  Layers, Crosshair, Zap, MessageCircle, Send, Megaphone, Truck, BarChart2,
  ChevronDown, ChevronUp, Hash,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getAnalysis, getAIAnalysis, refreshAIAnalysis, getAnalysisProducts, addToWatchlist, checkWatchlist, rescrapeAnalysis, aiChat, analyzeNiche, trackProduct } from "@/lib/api";
import type { NicheAnalysis, AIInsight, Product, ScoreBreakdown } from "@/types";

/* ─── helpers ─── */

interface ChatMessage { role: "user" | "assistant"; content: string; }

function scoreColor(s: number | null) {
  if (s === null) return "var(--text-muted)";
  if (s >= 70) return "#10b981";
  if (s >= 55) return "#84cc16";
  if (s >= 40) return "#f59e0b";
  return "#ef4444";
}

function scoreLabel(s: number | null) {
  if (s === null) return "N/A";
  if (s >= 70) return "Excelente";
  if (s >= 55) return "Bueno";
  if (s >= 40) return "Moderado";
  return "Difícil";
}

function severityColor(s: string) {
  if (s === "high") return "var(--danger)";
  if (s === "medium") return "var(--warning)";
  return "var(--success)";
}

const tooltipStyle = { background: "#111420", border: "1px solid #1e2336", borderRadius: "10px", fontSize: "12px" };

/* ─── ScoreRing: clean SVG gauge ─── */
function ScoreRing({ score, size = 120, strokeWidth = 8, label }: { score: number | null; size?: number; strokeWidth?: number; label?: string }) {
  const v = score ?? 0;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full" style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={strokeWidth} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={`${(v / 100) * circ} ${circ}`}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: "stroke-dasharray 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black" style={{ color, textShadow: `0 0 20px ${color}40` }}>{score ?? "--"}</span>
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            {scoreLabel(score)}
          </span>
        </div>
      </div>
      {label && <span className="text-[10px] font-bold mt-1.5" style={{ color: "var(--text-muted)" }}>{label}</span>}
    </div>
  );
}

/* ─── Mini gauge for sub-scores ─── */
function MiniGauge({ label, score, icon: Icon, color }: { label: string; score: number | null; icon: React.ComponentType<{ size?: number; color?: string }>; color: string }) {
  const v = score ?? 0;
  const r = 28;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: 64, height: 64 }}>
        <svg viewBox="0 0 64 64" className="w-full h-full" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
          <circle
            cx="32" cy="32" r={r} fill="none"
            stroke={scoreColor(score)} strokeWidth="5"
            strokeDasharray={`${(v / 100) * circ} ${circ}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-black" style={{ color: scoreColor(score) }}>{score ?? "--"}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Icon size={11} color={color} />
        <span className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>{label}</span>
      </div>
    </div>
  );
}

/* ─── Score Breakdown Section ─── */
function BreakdownSection({ title, icon: Icon, color, score, breakdown }: { title: string; icon: React.ComponentType<{ size?: number; color?: string }>; color: string; score: number | null; breakdown: ScoreBreakdown[] }) {
  const [open, setOpen] = useState(false);
  if (!breakdown || breakdown.length === 0) return null;
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-2">
          <Icon size={14} color={color} />
          <span className="text-xs font-bold">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-black" style={{ color: scoreColor(score) }}>{score ?? "--"}</span>
          {open ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
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
              <div className="w-full h-1 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div className="h-full rounded-full" style={{ width: `${b.score}%`, background: scoreColor(b.score), transition: "width 0.6s ease" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Product Card ─── */
function ProductCard({ p, rank, onTrack, tracking }: { p: Product; rank: number; onTrack?: (p: Product) => void; tracking?: boolean }) {
  return (
    <div
      className="rounded-xl p-3 flex gap-3 transition-all hover:bg-white/[0.02]"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
    >
      <span className="text-[10px] font-bold mt-1 w-4 flex-shrink-0" style={{ color: "var(--text-muted)" }}>{rank}</span>
      <a href={p.product_url || "#"} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
        {p.image_url ? (
          <img src={p.image_url} alt="" className="w-14 h-14 rounded-lg object-contain" style={{ background: "rgba(255,255,255,0.04)" }} />
        ) : (
          <div className="w-14 h-14 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.03)" }}>
            <Package size={18} style={{ color: "var(--text-muted)" }} />
          </div>
        )}
      </a>
      <div className="flex-1 min-w-0">
        <a href={p.product_url || "#"} target="_blank" rel="noopener noreferrer"
          className="text-xs font-semibold hover:underline line-clamp-2 leading-snug" style={{ color: "var(--text-primary)" }}>
          {p.title}
        </a>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {p.brand && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{p.brand}</span>}
          {p.is_prime && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>PRIME</span>
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
        <div className="flex items-center gap-3 mt-1.5">
          {p.price ? (
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-black" style={{ color: "var(--success)" }}>${p.price.toFixed(2)}</span>
              {p.original_price && p.original_price > p.price && (
                <span className="text-[10px] line-through" style={{ color: "var(--text-muted)" }}>${p.original_price.toFixed(2)}</span>
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
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{p.reviews_count.toLocaleString()} reviews</span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 flex-shrink-0 self-center">
        {onTrack && (
          <button onClick={() => onTrack(p)} disabled={tracking} className="p-2 rounded-lg transition-colors" style={{ background: "rgba(99,102,241,0.08)" }} title="Trackear ASIN">
            {tracking ? <Loader2 size={14} className="animate-spin" color="#6366f1" /> : <Package size={14} color="#6366f1" />}
          </button>
        )}
        {p.product_url && (
          <a href={p.product_url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg transition-colors" style={{ background: "rgba(249,115,22,0.08)" }} title="Ver en Amazon">
            <ExternalLink size={14} color="var(--accent)" />
          </a>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

export default function AnalysisDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [analysis, setAnalysis] = useState<NicheAnalysis | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAllProducts, setShowAllProducts] = useState(false);

  // AI
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState("");
  const [aiCached, setAiCached] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Sub-niche
  const [analyzingSubNiche, setAnalyzingSubNiche] = useState<string | null>(null);

  // Rescrape
  const [rescraping, setRescraping] = useState(false);

  // Watch
  const [watched, setWatched] = useState(false);

  // ASIN tracking
  const [trackingAsin, setTrackingAsin] = useState<string | null>(null);
  const [trackedAsins, setTrackedAsins] = useState<Set<string>>(new Set());

  /* ─── handlers ─── */

  async function handleTrackProduct(p: Product) {
    if (!analysis) return;
    setTrackingAsin(p.asin);
    try {
      await trackProduct({
        asin: p.asin, title: p.title, brand: p.brand || undefined,
        price: p.price || undefined, rating: p.rating || undefined,
        reviews_count: p.reviews_count || undefined, image_url: p.image_url || undefined,
        product_url: p.product_url || undefined, is_best_seller: p.is_best_seller || false,
        is_amazon_choice: p.is_amazon_choice || false, monthly_bought: p.monthly_bought || undefined,
        from_keyword: analysis.keyword, from_analysis_id: analysis.id,
      });
      setTrackedAsins((prev) => new Set(prev).add(p.asin));
    } catch { /* ignore */ }
    setTrackingAsin(null);
  }

  useEffect(() => {
    const id = Number(params.id);
    if (!id) return;
    getAnalysis(id).then(setAnalysis).catch((e) => setError(e.message)).finally(() => setLoading(false));
    getAnalysisProducts(id).then((res) => setProducts(res.products)).catch(() => {}).finally(() => setProductsLoading(false));
    getAIAnalysis(id).then((res) => { setAiInsight(res.insight); setAiCached(res.cached ?? false); })
      .catch((err) => setAiError(err instanceof Error ? err.message : "Error en análisis IA")).finally(() => setAiLoading(false));
  }, [params.id]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  useEffect(() => {
    if (!analysis?.keyword) return;
    checkWatchlist(analysis.keyword).then((res) => setWatched(res.watched)).catch(() => {});
  }, [analysis?.keyword]);

  async function handleRefreshAI() {
    if (!analysis) return;
    setAiLoading(true); setAiError(""); setAiCached(false); setChatMessages([]);
    try { const res = await getAIAnalysis(analysis.id); setAiInsight(res.insight); setAiCached(res.cached ?? false); }
    catch (err) { setAiError(err instanceof Error ? err.message : "Error al refrescar análisis IA"); }
    finally { setAiLoading(false); }
  }

  async function handleWatch() {
    if (!analysis) return;
    try { await addToWatchlist({ keyword: analysis.keyword, analysis_id: analysis.id, score: analysis.opportunity_score ?? undefined }); setWatched(true); } catch { }
  }

  async function handleRescrape() {
    if (!analysis) return;
    setRescraping(true); setProductsLoading(true); setAiLoading(true); setAiError("");
    try {
      const result = await rescrapeAnalysis(analysis.id);
      setAnalysis(result);
      const prods = await getAnalysisProducts(analysis.id);
      setProducts(prods.products);
      try { const aiRes = await refreshAIAnalysis(result.id); setAiInsight(aiRes.insight); setAiCached(false); } catch { }
    } catch { }
    finally { setRescraping(false); setProductsLoading(false); setAiLoading(false); }
  }

  async function handleAnalyzeSubNiche(keyword: string) {
    setAnalyzingSubNiche(keyword);
    try { const result = await analyzeNiche(keyword, 2, analysis?.keyword); window.location.href = `/analysis/${result.id}`; }
    catch { setAnalyzingSubNiche(null); }
  }

  async function handleChatSend() {
    if (!chatInput.trim() || !analysis || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(newMessages);
    setChatLoading(true);
    try { const res = await aiChat(analysis.id, msg, newMessages.slice(0, -1)); setChatMessages([...newMessages, { role: "assistant", content: res.reply }]); }
    catch { setChatMessages([...newMessages, { role: "assistant", content: "Error al procesar tu mensaje. Intenta de nuevo." }]); }
    finally { setChatLoading(false); }
  }

  /* ─── loading / error states ─── */

  if (loading) return <div className="flex items-center justify-center h-96"><div className="spinner" /></div>;
  if (error || !analysis) return (
    <div className="card text-center py-16">
      <p style={{ color: "var(--danger)" }}>{error || "Análisis no encontrado"}</p>
      <Link href="/history" className="btn btn-primary mt-4 inline-block">Volver al Historial</Link>
    </div>
  );

  const visibleProducts = showAllProducts ? products : products.slice(0, 15);
  const isGo = aiInsight?.entry_strategy?.recommended ?? (aiInsight?.score_label === "excellent" || aiInsight?.score_label === "good");
  const goColor = isGo ? "#10b981" : "#ef4444";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href="/history" className="inline-flex items-center gap-2 text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} /> Volver al Historial
      </Link>

      {/* ═══ HERO ═══ */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {/* Top accent line */}
        <div style={{ height: 3, background: `linear-gradient(90deg, ${scoreColor(analysis.opportunity_score)}, transparent)` }} />

        <div className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            {/* Score Ring */}
            <div className="flex-shrink-0">
              {rescraping ? (
                <div className="flex items-center justify-center" style={{ width: 130, height: 130 }}>
                  <Loader2 size={40} className="animate-spin" style={{ color: "var(--accent)" }} />
                </div>
              ) : (
                <ScoreRing score={analysis.opportunity_score} size={130} strokeWidth={9} />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h1 className="text-2xl font-black capitalize">{analysis.keyword}</h1>
                {analysis.parent_keyword && (
                  <span className="text-[9px] font-bold px-2 py-1 rounded-full flex items-center gap-1"
                    style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.2)" }}>
                    <Layers size={10} /> Sub-nicho de &ldquo;{analysis.parent_keyword}&rdquo;
                  </span>
                )}
              </div>
              <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                {analysis.created_at ? new Date(analysis.created_at).toLocaleString("es") : ""}
              </p>

              {/* Key stats strip */}
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                <span><span style={{ color: "var(--text-muted)" }}>Productos:</span> <strong>{analysis.total_products}</strong></span>
                <span><span style={{ color: "var(--text-muted)" }}>Marcas:</span> <strong>{analysis.brand_count}</strong></span>
                <span><span style={{ color: "var(--text-muted)" }}>Precio Prom:</span> <strong style={{ color: "#f59e0b" }}>{analysis.avg_price ? `$${analysis.avg_price.toFixed(2)}` : "--"}</strong></span>
                <span><span style={{ color: "var(--text-muted)" }}>Rating Prom:</span> <strong>{analysis.avg_rating?.toFixed(1) ?? "--"}</strong></span>
                <span><span style={{ color: "var(--text-muted)" }}>Reviews Prom:</span> <strong style={{ color: "#6366f1" }}>{analysis.avg_reviews?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "--"}</strong></span>
                <span><span style={{ color: "var(--text-muted)" }}>Prime:</span> <strong style={{ color: "#10b981" }}>{analysis.prime_percentage != null ? `${analysis.prime_percentage}%` : "--"}</strong></span>
                {analysis.search_result_count != null && analysis.search_result_count > 0 && (
                  <span><Search size={11} className="inline -mt-px mr-0.5" color="#6366f1" /><span style={{ color: "var(--text-muted)" }}>Resultados Amazon:</span> <strong style={{ color: "#6366f1" }}>{analysis.search_result_count.toLocaleString()}</strong></span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 flex-shrink-0">
              <button onClick={handleWatch} disabled={watched} className="btn text-xs"
                style={watched ? { background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)", cursor: "default" } : undefined}>
                <Eye size={14} /> {watched ? "Vigilando" : "Vigilar"}
              </button>
              <button onClick={handleRescrape} disabled={rescraping} className="btn btn-primary text-xs">
                {rescraping ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {rescraping ? "Recalculando..." : "Recalcular"}
              </button>
              <button onClick={handleRefreshAI} disabled={aiLoading} className="btn btn-secondary text-xs">
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
                {aiLoading ? "IA..." : "Refrescar IA"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 4 SUB-SCORES ═══ */}
      <div className="card">
        <div className="flex items-center justify-around flex-wrap gap-4">
          <MiniGauge label="Demanda" score={analysis.demand_score} icon={TrendingUp} color="#10b981" />
          <MiniGauge label="Competencia" score={analysis.competition_score} icon={Users} color="#6366f1" />
          <MiniGauge label="Precio" score={analysis.price_score} icon={DollarSign} color="#f59e0b" />
          <MiniGauge label="Calidad" score={analysis.quality_gap_score} icon={Star} color="#ef4444" />
        </div>
      </div>

      {/* ═══ EXTENDED METRICS ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { l: "Ingreso Est/Mes", v: analysis.revenue_estimate ? `$${Math.round(analysis.revenue_estimate).toLocaleString()}` : "--", c: "#10b981" },
          { l: "Reviews Mediana", v: analysis.median_reviews?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "--", c: "#6366f1" },
          { l: "BSR Promedio", v: analysis.avg_bsr ? Math.round(analysis.avg_bsr).toLocaleString() : "--", c: "#f59e0b" },
          { l: "% Con Ventas", v: analysis.monthly_bought_percentage != null ? `${analysis.monthly_bought_percentage}%` : "--", c: "#f97316" },
          { l: "Rango Precio", v: `$${analysis.min_price?.toFixed(0) ?? "?"} - $${analysis.max_price?.toFixed(0) ?? "?"}`, c: "var(--text-primary)" },
        ].map((m) => (
          <div key={m.l} className="p-3 rounded-xl" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>{m.l}</p>
            <p className="text-sm font-bold mt-0.5" style={{ color: m.c }}>{m.v}</p>
          </div>
        ))}
      </div>

      {/* ═══ AI SECTION ═══ */}
      {aiError && (
        <div className="card flex items-center gap-3" style={{ borderColor: "var(--danger)" }}>
          <AlertTriangle size={16} color="var(--danger)" />
          <p className="text-sm" style={{ color: "var(--danger)" }}>{aiError}</p>
        </div>
      )}

      {aiLoading && (
        <div className="card text-center py-10" style={{ borderColor: "var(--accent)" }}>
          <div className="spinner mx-auto mb-3" />
          <p className="text-sm font-semibold">Claude está analizando este nicho...</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Calculando costos, márgenes, ROI y estrategia</p>
        </div>
      )}

      {aiInsight && !aiInsight.error && (
        <>
          {/* ─── GO / NO-GO Verdict ─── */}
          <div className="rounded-2xl p-5 relative overflow-hidden"
            style={{ background: `${goColor}08`, border: `2px solid ${goColor}30` }}>
            <div className="flex items-center gap-5">
              <div className="flex-shrink-0 w-20 h-20 rounded-2xl flex flex-col items-center justify-center"
                style={{ background: `${goColor}12`, boxShadow: `0 0 30px ${goColor}15` }}>
                <span className="text-xl font-black" style={{ color: goColor }}>
                  {isGo ? "ENTRAR" : "NO"}
                </span>
                {!isGo && <span className="text-base font-black -mt-1" style={{ color: goColor }}>ENTRAR</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs font-black uppercase px-2 py-1 rounded-lg" style={{ background: `${goColor}15`, color: goColor }}>
                    {scoreLabel(analysis.opportunity_score)}
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
                      <Megaphone size={9} className="inline -mt-px mr-0.5" /> PPC Viable
                    </span>
                  )}
                  {aiInsight.fba_evaluation?.fba_opportunity === "alta" && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(249,115,22,0.1)", color: "#f97316" }}>
                      <Truck size={9} className="inline -mt-px mr-0.5" /> FBA Ventaja
                    </span>
                  )}
                  {aiCached && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>cache</span>
                  )}
                </div>
                {aiInsight.financials && (
                  <div className="flex items-center gap-4 mb-2 flex-wrap">
                    <span className="text-xs"><strong style={{ color: "#10b981" }}>Margen: {aiInsight.financials.margen_porcentaje}</strong></span>
                    <span className="text-xs"><strong style={{ color: "var(--accent)" }}>ROI 12M: {aiInsight.financials.roi_12_meses}</strong></span>
                    <span className="text-xs"><strong style={{ color: "#f59e0b" }}>China: {aiInsight.financials.costo_unitario_china}</strong></span>
                    <span className="text-xs"><strong style={{ color: "#6366f1" }}>Venta: {aiInsight.financials.precio_venta_sugerido}</strong></span>
                  </div>
                )}
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{aiInsight.verdict}</p>
              </div>
            </div>
          </div>

          {/* ─── VMV + FBA ─── */}
          {(aiInsight.min_viable_volume || aiInsight.fba_evaluation) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {aiInsight.min_viable_volume && (
                <div className="card">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart2 size={15} color="#10b981" />
                    <h4 className="text-sm font-bold">Volumen Mínimo Viable</h4>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: aiInsight.min_viable_volume.mvv_achievable ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: aiInsight.min_viable_volume.mvv_achievable ? "#10b981" : "#ef4444" }}>
                      {aiInsight.min_viable_volume.mvv_achievable ? "Alcanzable" : "Difícil"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      { label: "Breakeven/Mes", value: aiInsight.min_viable_volume.units_month_breakeven, color: "#f59e0b" },
                      { label: "% Mercado", value: aiInsight.min_viable_volume.market_percentage_needed, color: "#6366f1" },
                      { label: "Ventas Pos. 50-100", value: aiInsight.min_viable_volume.estimated_sales_position_50, color: "#10b981" },
                      { label: "Ventas Pos. 20-50", value: aiInsight.min_viable_volume.estimated_sales_position_20, color: "var(--accent)" },
                    ].map((m) => (
                      <div key={m.label} className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                        <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>{m.label}</p>
                        <p className="text-sm font-bold" style={{ color: m.color }}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                  {aiInsight.min_viable_volume.realistic_monthly_revenue && (
                    <div className="p-2 rounded-lg mb-2" style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)" }}>
                      <p className="text-[9px] font-bold uppercase" style={{ color: "#10b981" }}>Ingreso Mensual Realista</p>
                      <p className="text-sm font-bold">{aiInsight.min_viable_volume.realistic_monthly_revenue}</p>
                    </div>
                  )}
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{aiInsight.min_viable_volume.mvv_reasoning}</p>
                </div>
              )}

              {aiInsight.fba_evaluation && (
                <div className="card">
                  <div className="flex items-center gap-2 mb-3">
                    <Truck size={15} color="#f97316" />
                    <h4 className="text-sm font-bold">Ventaja FBA</h4>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{
                        background: aiInsight.fba_evaluation.fba_opportunity === "alta" ? "rgba(16,185,129,0.1)" : aiInsight.fba_evaluation.fba_opportunity === "media" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                        color: aiInsight.fba_evaluation.fba_opportunity === "alta" ? "#10b981" : aiInsight.fba_evaluation.fba_opportunity === "media" ? "#f59e0b" : "#ef4444",
                      }}>
                      Oportunidad {aiInsight.fba_evaluation.fba_opportunity === "alta" ? "Alta" : aiInsight.fba_evaluation.fba_opportunity === "media" ? "Media" : "Baja"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {aiInsight.fba_evaluation.prime_competitor_percentage && (
                      <div className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                        <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Competidores con Prime</p>
                        <p className="text-sm font-bold" style={{ color: "#6366f1" }}>{aiInsight.fba_evaluation.prime_competitor_percentage}</p>
                      </div>
                    )}
                    {aiInsight.fba_evaluation.buy_box_advantage && (
                      <div className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                        <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Ventaja Buy Box</p>
                        <p className="text-xs mt-0.5">{aiInsight.fba_evaluation.buy_box_advantage}</p>
                      </div>
                    )}
                    {aiInsight.fba_evaluation.conversion_impact && (
                      <div className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                        <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Impacto en Conversión</p>
                        <p className="text-xs mt-0.5">{aiInsight.fba_evaluation.conversion_impact}</p>
                      </div>
                    )}
                    {aiInsight.fba_evaluation.fbm_competitors && (
                      <div className="p-2 rounded-lg" style={{ background: "rgba(249,115,22,0.04)", border: "1px solid rgba(249,115,22,0.12)" }}>
                        <p className="text-[9px] font-bold uppercase" style={{ color: "#f97316" }}>Competidores FBM</p>
                        <p className="text-xs mt-0.5">{aiInsight.fba_evaluation.fbm_competitors}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── PPC Strategy ─── */}
          {aiInsight.ppc_strategy && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Megaphone size={15} color="#8b5cf6" />
                <h4 className="text-sm font-bold">Estrategia Amazon PPC</h4>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{ background: aiInsight.ppc_strategy.viable_with_ppc ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: aiInsight.ppc_strategy.viable_with_ppc ? "#10b981" : "#ef4444" }}>
                  {aiInsight.ppc_strategy.viable_with_ppc ? "Viable" : "No Recomendado"}
                </span>
              </div>
              <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{aiInsight.ppc_strategy.ppc_reasoning}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                {[
                  { label: "CPC Estimado", value: aiInsight.ppc_strategy.estimated_cpc, color: "#8b5cf6" },
                  { label: "ACOS Objetivo", value: aiInsight.ppc_strategy.target_acos, color: "#f59e0b" },
                  { label: "Budget/Mes", value: aiInsight.ppc_strategy.monthly_ad_budget, color: "#ef4444" },
                  { label: "Budget/Día", value: aiInsight.ppc_strategy.daily_budget_suggested, color: "#6366f1" },
                ].map((m) => (
                  <div key={m.label} className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>{m.label}</p>
                    <p className="text-sm font-bold" style={{ color: m.color }}>{m.value}</p>
                  </div>
                ))}
              </div>
              {aiInsight.ppc_strategy.long_tail_keywords?.length > 0 && (
                <div className="p-2 rounded-lg mb-3" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-[9px] font-bold uppercase mb-1.5" style={{ color: "var(--text-muted)" }}>Keywords Long-Tail</p>
                  <div className="flex flex-wrap gap-1.5">
                    {aiInsight.ppc_strategy.long_tail_keywords.map((kw, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}>{kw}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {aiInsight.ppc_strategy.launch_strategy && (
                  <div className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Lanzamiento</p>
                    <p className="text-xs mt-0.5 leading-relaxed">{aiInsight.ppc_strategy.launch_strategy}</p>
                  </div>
                )}
                {aiInsight.ppc_strategy.risk_without_ads && (
                  <div className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Sin Ads</p>
                    <p className="text-xs mt-0.5 leading-relaxed">{aiInsight.ppc_strategy.risk_without_ads}</p>
                  </div>
                )}
              </div>
              {aiInsight.ppc_strategy.breakeven_with_ads && (
                <div className="p-2 rounded-lg mt-2" style={{ background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.12)" }}>
                  <p className="text-[9px] font-bold uppercase" style={{ color: "#8b5cf6" }}>Break-even con PPC</p>
                  <p className="text-xs mt-0.5">{aiInsight.ppc_strategy.breakeven_with_ads}</p>
                </div>
              )}
            </div>
          )}

          {/* ─── Phase Recommendation ─── */}
          {aiInsight.phase_recommendation && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Target size={15} color="var(--accent)" />
                <h4 className="text-sm font-bold">Fase Recomendada</h4>
              </div>
              <div className="space-y-2">
                <div className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Fase Actual</p>
                  <p className="text-sm font-bold">{aiInsight.phase_recommendation.current_phase}</p>
                </div>
                {aiInsight.phase_recommendation.brand_reason && (
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{aiInsight.phase_recommendation.brand_reason}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Trigger Marca Privada</p>
                    <p className="text-xs mt-0.5">{aiInsight.phase_recommendation.private_label_trigger}</p>
                  </div>
                  <div className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Inversión Marca</p>
                    <p className="text-xs mt-0.5">{aiInsight.phase_recommendation.private_label_investment}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Entry Strategy + Product Ideas ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aiInsight.entry_strategy && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <Crosshair size={15} color="var(--accent)" />
                  <h4 className="text-sm font-bold">Estrategia de Entrada</h4>
                  <span className={`badge ${aiInsight.entry_strategy.recommended ? "badge-success" : "badge-danger"}`} style={{ fontSize: "10px" }}>
                    {aiInsight.entry_strategy.recommended ? "GO" : "NO-GO"}
                  </span>
                </div>
                <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>{aiInsight.entry_strategy.reasoning}</p>
                <div className="space-y-2">
                  <div className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Diferenciación</p>
                    <p className="text-xs mt-0.5">{aiInsight.entry_strategy.differentiation_angle}</p>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                      <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Precio Obj.</p>
                      <p className="text-xs mt-0.5">{aiInsight.entry_strategy.target_price}</p>
                    </div>
                    <div className="flex-1 p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                      <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Rating Obj.</p>
                      <p className="text-xs mt-0.5">{aiInsight.entry_strategy.target_rating}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {aiInsight.product_ideas && aiInsight.product_ideas.length > 0 && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb size={15} color="#f59e0b" />
                  <h4 className="text-sm font-bold">Ideas de Producto</h4>
                </div>
                <div className="space-y-2">
                  {aiInsight.product_ideas.slice(0, 3).map((idea, i) => (
                    <div key={i} className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{idea.name}</span>
                        <div className="flex items-center gap-1.5">
                          {idea.subscribe_save && (
                            <span className="text-[8px] px-1 py-0.5 rounded font-bold" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>S&S</span>
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

          {/* ─── Sourcing + Risks ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aiInsight.sourcing && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <Factory size={15} color="#f97316" />
                  <h4 className="text-sm font-bold">Sourcing China</h4>
                </div>
                <div className="space-y-2">
                  <div className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Proveedor</p>
                    <p className="text-xs mt-0.5">{aiInsight.sourcing.tipo_proveedor}</p>
                  </div>
                  {aiInsight.sourcing.palabras_clave_alibaba?.length > 0 && (
                    <div className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                      <p className="text-[9px] font-bold uppercase mb-1" style={{ color: "var(--text-muted)" }}>Keywords Alibaba</p>
                      <div className="flex flex-wrap gap-1">
                        {aiInsight.sourcing.palabras_clave_alibaba.map((kw, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(249,115,22,0.1)", color: "#f97316" }}>{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {aiInsight.sourcing.certificaciones_necesarias?.length > 0 && (
                    <div className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                      <p className="text-[9px] font-bold uppercase mb-1" style={{ color: "var(--text-muted)" }}>Certificaciones</p>
                      <div className="flex flex-wrap gap-1">
                        {aiInsight.sourcing.certificaciones_necesarias.map((c, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {aiInsight.sourcing.tiempo_produccion_dias && (
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Producción: {aiInsight.sourcing.tiempo_produccion_dias} días</p>
                  )}
                </div>
              </div>
            )}

            {aiInsight.risks && aiInsight.risks.length > 0 && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={15} color="var(--warning)" />
                  <h4 className="text-sm font-bold">Riesgos</h4>
                </div>
                <div className="space-y-2">
                  {aiInsight.risks.map((risk, i) => (
                    <div key={i} className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
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

          {/* ─── Sub-Niches ─── */}
          {aiInsight.sub_niches && aiInsight.sub_niches.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={15} color="#a855f7" />
                <h4 className="text-sm font-bold">Sub-Nichos para Explorar</h4>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7" }}>
                  {aiInsight.sub_niches.length}
                </span>
              </div>
              <div className="space-y-2">
                {aiInsight.sub_niches.map((sn, i) => (
                  <div key={i} className="p-3 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold">{sn.keyword_amazon}</span>
                      <div className="flex items-center gap-2">
                        {sn.price_range && <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>{sn.price_range}</span>}
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{
                          background: sn.competition === "baja" ? "rgba(16,185,129,0.1)" : sn.competition === "media" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                          color: sn.competition === "baja" ? "#10b981" : sn.competition === "media" ? "#f59e0b" : "#ef4444",
                        }}>
                          {sn.competition === "baja" ? "Baja" : sn.competition === "media" ? "Media" : "Alta"}
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
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                        style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.2)" }}>
                        {analyzingSubNiche === sn.keyword_amazon ? <><Loader2 size={10} className="animate-spin" /> Analizando...</> : <><Search size={10} /> Analizar</>}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Next Steps ─── */}
          {aiInsight.next_steps && aiInsight.next_steps.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={15} color="var(--success)" />
                <h4 className="text-sm font-bold">Próximos Pasos</h4>
              </div>
              <ol className="space-y-2">
                {aiInsight.next_steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                    <span className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                      style={{ background: "var(--accent-glow)", color: "var(--accent)" }}>{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      {/* ═══ AI CHAT ═══ */}
      {aiInsight && !aiInsight.error && (
        <div className="card" style={{ border: "1px solid rgba(99,102,241,0.2)" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
              <MessageCircle size={14} color="#fff" />
            </div>
            <div>
              <h3 className="text-sm font-bold">AI Chat</h3>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Pregunta lo que quieras sobre {analysis.keyword}</p>
            </div>
          </div>
          <div className="rounded-xl overflow-y-auto p-4 space-y-3 mb-4"
            style={{ background: "var(--bg-elevated)", minHeight: 80, maxHeight: 360 }}>
            {chatMessages.length === 0 && (
              <div className="text-center py-3">
                <Brain size={20} color="var(--text-muted)" className="mx-auto mb-2" />
                <div className="flex flex-wrap gap-2 justify-center">
                  {["\u00bfQu\u00e9 pasa si vendo a $25?", "\u00bfQu\u00e9 proveedores recomiendas?", "\u00bfC\u00f3mo gano el Buy Box?", "Explica los riesgos", "\u00bfCu\u00e1nto puedo ganar al mes?"].map((q) => (
                    <button key={q} onClick={() => setChatInput(q)} className="text-[11px] px-3 py-1.5 rounded-full transition-colors hover:bg-white/5"
                      style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed"
                  style={{ background: msg.role === "user" ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "rgba(0,0,0,0.3)", color: msg.role === "user" ? "#fff" : "var(--text-primary)" }}>
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
          <form onSubmit={(e) => { e.preventDefault(); handleChatSend(); }} className="flex gap-2">
            <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
              placeholder="Pregunta sobre el nicho..."
              className="flex-1 px-4 py-2 rounded-xl text-sm"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              disabled={chatLoading} />
            <button type="submit" disabled={!chatInput.trim() || chatLoading}
              className="px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold transition-colors"
              style={{ background: chatInput.trim() ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "var(--bg-elevated)", color: chatInput.trim() ? "#fff" : "var(--text-muted)" }}>
              <Send size={14} />
            </button>
          </form>
        </div>
      )}

      {/* ═══ SCORE BREAKDOWNS (collapsible) ═══ */}
      <div>
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <ShieldCheck size={15} color="var(--accent)" /> Desglose de Scores
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <BreakdownSection title="Demanda" icon={TrendingUp} color="#10b981" score={analysis.demand_score} breakdown={analysis.demand_breakdown} />
          <BreakdownSection title="Competencia" icon={Users} color="#6366f1" score={analysis.competition_score} breakdown={analysis.competition_breakdown} />
          <BreakdownSection title="Precio" icon={DollarSign} color="#f59e0b" score={analysis.price_score} breakdown={analysis.price_breakdown} />
          <BreakdownSection title="Calidad" icon={Star} color="#ef4444" score={analysis.quality_gap_score} breakdown={analysis.quality_breakdown} />
        </div>
      </div>

      {/* ═══ SATURATION ═══ */}
      {analysis.saturation && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Layers size={15} color="#6366f1" />
            <h3 className="text-sm font-bold">Saturación del Mercado</h3>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>
              {analysis.saturation.verdict}
            </span>
          </div>
          {/* Stacked bar */}
          <div className="w-full h-6 rounded-full overflow-hidden flex mb-3" style={{ background: "rgba(255,255,255,0.03)" }}>
            {[
              { pct: analysis.saturation.newcomers_pct, color: "#10b981" },
              { pct: analysis.saturation.growing_pct, color: "#6366f1" },
              { pct: analysis.saturation.established_pct, color: "#f59e0b" },
              { pct: analysis.saturation.dominant_pct, color: "#ef4444" },
            ].map((seg, i) => (
              <div key={i} style={{ width: `${seg.pct}%`, background: seg.color, transition: "width 0.6s ease" }} title={`${seg.pct.toFixed(1)}%`} />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Nuevos (<50)", count: analysis.saturation.newcomers, pct: analysis.saturation.newcomers_pct, color: "#10b981" },
              { label: "Crecimiento", count: analysis.saturation.growing, pct: analysis.saturation.growing_pct, color: "#6366f1" },
              { label: "Establecidos", count: analysis.saturation.established, pct: analysis.saturation.established_pct, color: "#f59e0b" },
              { label: "Dominantes", count: analysis.saturation.dominant, pct: analysis.saturation.dominant_pct, color: "#ef4444" },
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

      {/* ═══ PRICE OPPORTUNITY ═══ */}
      {analysis.price_opportunity && analysis.price_opportunity.ranges.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target size={15} color="#f59e0b" />
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
                  <th style={{ textAlign: "right" }}>Reviews</th>
                  <th style={{ textAlign: "right" }}>Rating</th>
                  <th style={{ textAlign: "center" }}>Demanda</th>
                  <th style={{ textAlign: "center" }}>Facilidad</th>
                </tr>
              </thead>
              <tbody>
                {analysis.price_opportunity.ranges.map((r) => (
                  <tr key={r.range} style={r.range === analysis.price_opportunity?.best_range ? { background: "rgba(16,185,129,0.04)" } : undefined}>
                    <td className="font-medium">{r.range}</td>
                    <td style={{ textAlign: "right" }}>{r.count}</td>
                    <td style={{ textAlign: "right" }}>{r.avg_reviews.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td style={{ textAlign: "right" }}>{r.avg_rating?.toFixed(1) ?? "--"}</td>
                    <td style={{ textAlign: "center" }}>
                      {r.has_demand ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>Sí</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-muted)" }}>Baja</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                        background: r.entry_ease === "Fácil" ? "rgba(16,185,129,0.1)" : r.entry_ease === "Moderado" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                        color: r.entry_ease === "Fácil" ? "#10b981" : r.entry_ease === "Moderado" ? "#f59e0b" : "#ef4444",
                      }}>
                        {r.entry_ease}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ CHARTS ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <h3 className="text-sm font-bold mb-3">Precios</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={analysis.price_distribution}>
              <XAxis dataKey="range" tick={{ fill: "#5c6380", fontSize: 10 }} />
              <YAxis tick={{ fill: "#5c6380", fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="text-sm font-bold mb-3">Reviews</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={analysis.review_distribution}>
              <XAxis dataKey="range" tick={{ fill: "#5c6380", fontSize: 10 }} />
              <YAxis tick={{ fill: "#5c6380", fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="text-sm font-bold mb-3">Ratings</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={analysis.rating_distribution}>
              <XAxis dataKey="range" tick={{ fill: "#5c6380", fontSize: 10 }} />
              <YAxis tick={{ fill: "#5c6380", fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ═══ PRODUCTS ═══ */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Package size={16} color="var(--accent)" />
            <div>
              <h2 className="text-base font-bold">Productos ({products.length})</h2>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                del nicho &ldquo;{analysis.keyword}&rdquo;
              </p>
            </div>
          </div>
          <button onClick={handleRescrape} disabled={rescraping} className="btn btn-secondary text-xs">
            {rescraping ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Re-scrapear
          </button>
        </div>

        {productsLoading ? (
          <div className="card text-center py-10">
            <div className="spinner mx-auto mb-3" />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Cargando productos...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="card text-center py-10">
            <Package size={24} style={{ color: "var(--text-muted)", margin: "0 auto 8px" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Sin productos guardados</p>
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
                <button onClick={() => setShowAllProducts(!showAllProducts)} className="btn btn-secondary text-xs">
                  {showAllProducts ? "Mostrar menos" : `Ver todos (${products.length})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ BOTTOM VERDICT ═══ */}
      {(() => {
        const sc = analysis.opportunity_score ?? 0;
        const dataGo = sc >= 55;
        const vColor = dataGo ? "#10b981" : sc >= 40 ? "#f59e0b" : "#ef4444";
        return (
          <div className="rounded-2xl p-4 flex items-center gap-4"
            style={{ background: `${vColor}06`, border: `1px solid ${vColor}25` }}>
            <div className="flex-shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center" style={{ background: `${vColor}10` }}>
              <ShieldCheck size={18} color={vColor} />
              <span className="text-[9px] font-black mt-0.5" style={{ color: vColor }}>
                {sc >= 65 ? "GO" : sc >= 40 ? "QUIZÁS" : "NO-GO"}
              </span>
            </div>
            <div className="flex-1">
              <span className="text-sm font-black" style={{ color: vColor }}>
                {sc >= 65 ? "Oportunidad fuerte" : sc >= 40 ? "Oportunidad moderada — diferenciación necesaria" : "Nicho difícil — alta competencia"}
              </span>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                {(analysis.top3_brand_share ?? 0) <= 40 && <span>Mercado fragmentado ({analysis.top3_brand_share?.toFixed(1)}% top-3)</span>}
                {(analysis.top3_brand_share ?? 0) > 60 && <span>Mercado concentrado ({analysis.top3_brand_share?.toFixed(1)}% top-3)</span>}
                {analysis.avg_price && <span>Precio: ${analysis.avg_price.toFixed(2)}</span>}
                {(analysis.avg_rating ?? 5) < 4.0 && <span>Rating bajo = oportunidad</span>}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
