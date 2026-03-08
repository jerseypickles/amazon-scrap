"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, TrendingUp, Users, DollarSign, Star, ShieldCheck, Search,
  Brain, Eye, Loader2, Lightbulb, AlertTriangle, Target, CheckCircle,
  Repeat, ExternalLink, Package, Award, BadgeCheck, Flame, RefreshCw,
  Layers, Crosshair, Zap, MessageCircle, Send, Megaphone,
  ChevronDown, ChevronUp, BarChart2,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getAnalysis, getAIAnalysis, refreshAIAnalysis, getAnalysisProducts, addToWatchlist, checkWatchlist, rescrapeAnalysis, aiChat, analyzeNiche, trackProduct, quickCheck } from "@/lib/api";
import type { NicheAnalysis, AIInsight, Product, ScoreBreakdown, QuickCheckResult } from "@/types";

/* ─── helpers ─── */

interface ChatMessage { role: "user" | "assistant"; content: string; }

/** Parse "10K+ bought in past month" → 10000, "500+" → 500, etc. */
function parseMonthlyBought(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/([\d,.]+)\s*[Kk]\+?/);
  if (m) return Math.round(parseFloat(m[1].replace(",", "")) * 1000);
  const n = raw.match(/([\d,.]+)\+?/);
  if (n) return Math.round(parseFloat(n[1].replace(",", "")));
  return null;
}

function formatRevenue(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

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

function decisionColor(d?: string) {
  if (d === "go") return "#10b981";
  if (d === "caution") return "#f59e0b";
  return "#ef4444";
}

const tooltipStyle = { background: "#111420", border: "1px solid #1e2336", borderRadius: "10px", fontSize: "12px" };

/* ─── ScoreRing ─── */
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
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={`${(v / 100) * circ} ${circ}`} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: "stroke-dasharray 0.8s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black" style={{ color, textShadow: `0 0 20px ${color}40` }}>{score ?? "--"}</span>
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{scoreLabel(score)}</span>
        </div>
      </div>
      {label && <span className="text-[10px] font-bold mt-1.5" style={{ color: "var(--text-muted)" }}>{label}</span>}
    </div>
  );
}

/* ─── Mini gauge ─── */
function MiniGauge({ label, score, icon: Icon, color }: { label: string; score: number | null; icon: React.ComponentType<{ size?: number; color?: string }>; color: string }) {
  const v = score ?? 0;
  const r = 28;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: 64, height: 64 }}>
        <svg viewBox="0 0 64 64" className="w-full h-full" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={scoreColor(score)} strokeWidth="5"
            strokeDasharray={`${(v / 100) * circ} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s ease" }} />
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

/* ─── Breakdown ─── */
function BreakdownSection({ title, icon: Icon, color, score, breakdown }: { title: string; icon: React.ComponentType<{ size?: number; color?: string }>; color: string; score: number | null; breakdown: ScoreBreakdown[] }) {
  const [open, setOpen] = useState(false);
  if (!breakdown || breakdown.length === 0) return null;
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-3 text-left transition-colors hover:bg-white/[0.02]">
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
    <div className="rounded-xl p-3 flex gap-3 transition-all hover:bg-white/[0.02]" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <span className="text-[10px] font-bold mt-1 w-4 flex-shrink-0" style={{ color: "var(--text-muted)" }}>{rank}</span>
      <a href={p.product_url || "#"} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
        {p.image_url ? (
          <img src={p.image_url} alt="" className="w-14 h-14 rounded-lg object-contain" style={{ background: "rgba(255,255,255,0.04)" }} />
        ) : (
          <div className="w-14 h-14 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.03)" }}><Package size={18} style={{ color: "var(--text-muted)" }} /></div>
        )}
      </a>
      <div className="flex-1 min-w-0">
        <a href={p.product_url || "#"} target="_blank" rel="noopener noreferrer"
          className="text-xs font-semibold hover:underline line-clamp-2 leading-snug" style={{ color: "var(--text-primary)" }}>{p.title}</a>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {p.brand && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{p.brand}</span>}
          {p.is_prime && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>PRIME</span>}
          {p.is_best_seller && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5" style={{ background: "rgba(249,115,22,0.12)", color: "#f97316" }}><Award size={8} /> BEST SELLER</span>}
          {p.is_amazon_choice && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}><BadgeCheck size={8} /> CHOICE</span>}
          {p.monthly_bought && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}><Flame size={8} /> {p.monthly_bought}</span>}
          {(() => { const units = parseMonthlyBought(p.monthly_bought); const rev = units && p.price ? units * p.price : null; return rev ? <span className="text-[8px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}><DollarSign size={8} /> ~{formatRevenue(rev)}/mes (listado)</span> : null; })()}
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          {p.price ? (
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-black" style={{ color: "var(--success)" }}>${p.price.toFixed(2)}</span>
              {p.original_price && p.original_price > p.price && <span className="text-[10px] line-through" style={{ color: "var(--text-muted)" }}>${p.original_price.toFixed(2)}</span>}
            </div>
          ) : <span className="text-xs" style={{ color: "var(--text-muted)" }}>Sin precio</span>}
          {p.rating && <div className="flex items-center gap-0.5"><Star size={10} color="#f59e0b" fill="#f59e0b" /><span className="text-xs font-bold">{p.rating.toFixed(1)}</span></div>}
          {p.reviews_count != null && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{p.reviews_count.toLocaleString()} reviews</span>}
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
   MAIN PAGE — TABS LAYOUT
   ═══════════════════════════════════════════════════════════ */

type TabId = "decision" | "mercado" | "producto" | "productos";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
  { id: "decision", label: "Decisión", icon: ShieldCheck },
  { id: "mercado", label: "Mercado", icon: BarChart2 },
  { id: "producto", label: "Producto", icon: Lightbulb },
  { id: "productos", label: "Productos", icon: Package },
];

export default function AnalysisDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [analysis, setAnalysis] = useState<NicheAnalysis | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("decision");

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
  const [subNicheChecks, setSubNicheChecks] = useState<Record<string, QuickCheckResult>>({});
  const [checkingSubNiches, setCheckingSubNiches] = useState(false);

  // Rescrape / Watch / Track
  const [rescraping, setRescraping] = useState(false);
  const [watched, setWatched] = useState(false);
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

  // Auto quick-check sub-niches when AI insight loads
  useEffect(() => {
    if (!aiInsight?.sub_niches || aiInsight.sub_niches.length === 0) return;
    if (checkingSubNiches || Object.keys(subNicheChecks).length > 0) return;
    setCheckingSubNiches(true);
    const keywords = aiInsight.sub_niches.map((sn) => sn.keyword_amazon);
    Promise.all(
      keywords.map((kw) => quickCheck(kw).catch(() => null))
    ).then((results) => {
      const checks: Record<string, QuickCheckResult> = {};
      results.forEach((r) => { if (r) checks[r.keyword] = r; });
      setSubNicheChecks(checks);
    }).finally(() => setCheckingSubNiches(false));
  }, [aiInsight?.sub_niches]);

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

  /* ─── loading / error ─── */

  if (loading) return <div className="flex items-center justify-center h-96"><div className="spinner" /></div>;
  if (error || !analysis) return (
    <div className="card text-center py-16">
      <p style={{ color: "var(--danger)" }}>{error || "Análisis no encontrado"}</p>
      <Link href="/history" className="btn btn-primary mt-4 inline-block">Volver al Historial</Link>
    </div>
  );

  const visibleProducts = showAllProducts ? products : products.slice(0, 15);
  const goDecision = aiInsight?.go_no_go?.decision;
  const goColor = decisionColor(goDecision);
  const goLabel = goDecision === "go" ? "GO" : goDecision === "caution" ? "CAUTELA" : goDecision === "no-go" ? "NO-GO" : null;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <Link href="/history" className="inline-flex items-center gap-2 text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} /> Volver al Historial
      </Link>

      {/* ═══ HEADER ═══ */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ height: 3, background: `linear-gradient(90deg, ${scoreColor(analysis.opportunity_score)}, transparent)` }} />
        <div className="p-5">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-5">
            {/* Score Ring */}
            <div className="flex-shrink-0">
              {rescraping ? (
                <div className="flex items-center justify-center" style={{ width: 110, height: 110 }}><Loader2 size={36} className="animate-spin" style={{ color: "var(--accent)" }} /></div>
              ) : (
                <ScoreRing score={analysis.opportunity_score} size={110} strokeWidth={8} />
              )}
            </div>

            {/* Info + Verdict */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h1 className="text-xl font-black capitalize">{analysis.keyword}</h1>
                {analysis.parent_keyword && (
                  <span className="text-[9px] font-bold px-2 py-1 rounded-full flex items-center gap-1"
                    style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.2)" }}>
                    <Layers size={10} /> Sub-nicho de &ldquo;{analysis.parent_keyword}&rdquo;
                  </span>
                )}
                {goLabel && (
                  <span className="text-sm font-black px-3 py-1 rounded-lg" style={{ background: `${goColor}15`, color: goColor, border: `1px solid ${goColor}30` }}>
                    {goLabel}
                  </span>
                )}
                {aiCached && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>cache</span>}
              </div>

              {/* Verdict text */}
              {aiInsight?.verdict && (
                <p className="text-sm mb-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{aiInsight.verdict}</p>
              )}

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {aiInsight?.is_consumable && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>
                    <Repeat size={9} className="inline -mt-px mr-0.5" /> Consumible
                  </span>
                )}
                {aiInsight?.repurchase_weeks && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                    Recompra {aiInsight.repurchase_weeks} sem
                  </span>
                )}
                {aiInsight?.min_viable_volume?.achievable && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                    <BarChart2 size={9} className="inline -mt-px mr-0.5" /> VMV Alcanzable
                  </span>
                )}
                {aiInsight?.ppc_strategy?.viable && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}>
                    <Megaphone size={9} className="inline -mt-px mr-0.5" /> PPC Viable
                  </span>
                )}
              </div>

              {/* Key stats */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span><span style={{ color: "var(--text-muted)" }}>Productos:</span> <strong>{analysis.total_products}</strong></span>
                <span><span style={{ color: "var(--text-muted)" }}>Precio:</span> <strong style={{ color: "#f59e0b" }}>{analysis.avg_price ? `$${analysis.avg_price.toFixed(2)}` : "--"}</strong></span>
                <span><span style={{ color: "var(--text-muted)" }}>Reviews Med:</span> <strong style={{ color: "#6366f1" }}>{analysis.median_reviews?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "--"}</strong></span>
                <span><span style={{ color: "var(--text-muted)" }}>Prime:</span> <strong style={{ color: "#10b981" }}>{analysis.prime_percentage != null ? `${analysis.prime_percentage}%` : "--"}</strong></span>
                {analysis.estimated_margin != null && (
                  <span><span style={{ color: "var(--text-muted)" }}>Margen:</span> <strong style={{ color: analysis.estimated_margin >= 30 ? "#10b981" : analysis.estimated_margin >= 20 ? "#f59e0b" : "#ef4444" }}>~{analysis.estimated_margin}%</strong></span>
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
                {rescraping ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {rescraping ? "Recalculando..." : "Recalcular"}
              </button>
              <button onClick={handleRefreshAI} disabled={aiLoading} className="btn btn-secondary text-xs">
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />} {aiLoading ? "IA..." : "Refrescar IA"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ AI loading/error ═══ */}
      {aiError && (
        <div className="card flex items-center gap-3" style={{ borderColor: "var(--danger)" }}>
          <AlertTriangle size={16} color="var(--danger)" />
          <p className="text-sm" style={{ color: "var(--danger)" }}>{aiError}</p>
        </div>
      )}
      {aiLoading && (
        <div className="card text-center py-8" style={{ borderColor: "var(--accent)" }}>
          <div className="spinner mx-auto mb-3" />
          <p className="text-sm font-semibold">Claude está analizando este nicho...</p>
        </div>
      )}

      {/* ═══ TABS ═══ */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-bold transition-all"
              style={active
                ? { background: "var(--accent)", color: "#fff", boxShadow: "0 2px 8px rgba(249,115,22,0.3)" }
                : { color: "var(--text-muted)" }
              }>
              <Icon size={14} />
              {tab.label}
              {tab.id === "productos" && products.length > 0 && (
                <span className="text-[9px] px-1 rounded" style={{ background: active ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)" }}>
                  {products.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══ TAB CONTENT ═══ */}

      {/* ── Tab: Decisión ── */}
      {activeTab === "decision" && (
        <div className="space-y-4">
          {/* Go/No-Go Checklist */}
          {aiInsight?.go_no_go && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={15} color={goColor} />
                <h4 className="text-sm font-bold">Checklist Go/No-Go</h4>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: "Margen >30%", ok: aiInsight.go_no_go.margin_above_30 },
                  { label: "Reviews <300 med", ok: aiInsight.go_no_go.median_reviews_below_300 },
                  { label: "No saturado", ok: aiInsight.go_no_go.market_not_saturated },
                  { label: "Precio FBA", ok: aiInsight.go_no_go.price_in_fba_range },
                  { label: "Sin cert. complejas", ok: aiInsight.go_no_go.no_complex_certs },
                  { label: "Entrada genérica", ok: aiInsight.go_no_go.generic_entry_viable },
                  { label: "PPC viable", ok: aiInsight.go_no_go.viable_with_ppc },
                  { label: "VMV alcanzable", ok: aiInsight.go_no_go.mvv_achievable },
                  { label: "Margen sin marca", ok: aiInsight.go_no_go.margin_without_brand },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-1.5 text-[11px]">
                    <span className="w-4 h-4 rounded flex items-center justify-center text-[10px] flex-shrink-0"
                      style={{ background: item.ok ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: item.ok ? "#10b981" : "#ef4444" }}>
                      {item.ok ? "✓" : "✗"}
                    </span>
                    {item.label}
                  </div>
                ))}
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{aiInsight.go_no_go.summary}</p>
            </div>
          )}

          {/* Cost Estimate + VMV side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aiInsight?.cost_estimate && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign size={15} color="#10b981" />
                  <h4 className="text-sm font-bold">Estimación de Costos</h4>
                </div>
                <div className="space-y-2">
                  {[
                    { label: "Margen Estimado", value: aiInsight.cost_estimate.margin_range, color: "#10b981" },
                    { label: "Inversión Mínima", value: aiInsight.cost_estimate.min_investment, color: "#f59e0b" },
                    { label: "Breakeven", value: aiInsight.cost_estimate.breakeven_months, color: "#6366f1" },
                  ].map((m) => (
                    <div key={m.label} className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                      <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>{m.label}</p>
                      <p className="text-sm font-bold" style={{ color: m.color }}>{m.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiInsight?.min_viable_volume && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart2 size={15} color="#f59e0b" />
                  <h4 className="text-sm font-bold">Volumen Mínimo Viable</h4>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                    style={{ background: aiInsight.min_viable_volume.achievable ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: aiInsight.min_viable_volume.achievable ? "#10b981" : "#ef4444" }}>
                    {aiInsight.min_viable_volume.achievable ? "Alcanzable" : "Difícil"}
                  </span>
                </div>
                <div className="p-2 rounded-lg mb-3" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Breakeven</p>
                  <p className="text-sm font-bold" style={{ color: "#f59e0b" }}>{aiInsight.min_viable_volume.units_breakeven}</p>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{aiInsight.min_viable_volume.reasoning}</p>
              </div>
            )}
          </div>

          {/* Entry Strategy */}
          {aiInsight?.entry_strategy && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Crosshair size={15} color="var(--accent)" />
                <h4 className="text-sm font-bold">Estrategia de Entrada</h4>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full`}
                  style={{ background: aiInsight.entry_strategy.recommended ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: aiInsight.entry_strategy.recommended ? "#10b981" : "#ef4444" }}>
                  {aiInsight.entry_strategy.recommended ? "Recomendado" : "No Recomendado"}
                </span>
              </div>
              <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{aiInsight.entry_strategy.reasoning}</p>
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

          {/* Phase Recommendation */}
          {aiInsight?.phase_recommendation && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Target size={15} color="var(--accent)" />
                <h4 className="text-sm font-bold">Fase Recomendada</h4>
              </div>
              <div className="p-2 rounded-lg mb-2" style={{ background: "var(--bg-elevated)" }}>
                <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Fase</p>
                <p className="text-sm font-bold">{aiInsight.phase_recommendation.current_phase}</p>
              </div>
              {aiInsight.phase_recommendation.brand_reason && (
                <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>{aiInsight.phase_recommendation.brand_reason}</p>
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
          )}

          {/* Risks */}
          {aiInsight?.risks && aiInsight.risks.length > 0 && (
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

          {/* Next Steps */}
          {aiInsight?.next_steps && aiInsight.next_steps.length > 0 && (
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
        </div>
      )}

      {/* ── Tab: Mercado ── */}
      {activeTab === "mercado" && (
        <div className="space-y-4">
          {/* 4 Sub-scores */}
          <div className="card">
            <div className="flex items-center justify-around flex-wrap gap-4">
              <MiniGauge label="Demanda" score={analysis.demand_score} icon={TrendingUp} color="#10b981" />
              <MiniGauge label="Competencia" score={analysis.competition_score} icon={Users} color="#6366f1" />
              <MiniGauge label="Precio" score={analysis.price_score} icon={DollarSign} color="#f59e0b" />
              <MiniGauge label="Calidad" score={analysis.quality_gap_score} icon={Star} color="#ef4444" />
            </div>
          </div>

          {/* Extended metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { l: "Ingreso Est/Mes", v: analysis.revenue_estimate ? `$${Math.round(analysis.revenue_estimate).toLocaleString()}` : "--", c: "#10b981" },
              { l: "Margen Estimado", v: analysis.estimated_margin != null ? `${analysis.estimated_margin}%` : "--", c: analysis.estimated_margin != null && analysis.estimated_margin >= 30 ? "#10b981" : analysis.estimated_margin != null && analysis.estimated_margin >= 20 ? "#f59e0b" : "#ef4444" },
              { l: "Reviews Mediana", v: analysis.median_reviews?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "--", c: "#6366f1" },
              { l: "Rango Precio", v: `$${analysis.min_price?.toFixed(0) ?? "?"} - $${analysis.max_price?.toFixed(0) ?? "?"}`, c: "var(--text-primary)" },
              { l: "% Con Ventas", v: analysis.monthly_bought_percentage != null ? `${analysis.monthly_bought_percentage}%` : "--", c: "#f97316" },
              { l: "% Best Seller", v: analysis.best_seller_percentage != null ? `${analysis.best_seller_percentage}%` : "--", c: "#f97316" },
              { l: "% Amazon Choice", v: analysis.amazon_choice_percentage != null ? `${analysis.amazon_choice_percentage}%` : "--", c: "#10b981" },
              { l: "Resultados Amazon", v: analysis.search_result_count ? analysis.search_result_count.toLocaleString() : "--", c: "var(--text-primary)" },
            ].map((m) => (
              <div key={m.l} className="p-3 rounded-xl" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>{m.l}</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: m.c }}>{m.v}</p>
              </div>
            ))}
          </div>

          {/* Top Brands Table */}
          {analysis.top_brands && analysis.top_brands.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Users size={15} color="#6366f1" />
                  <h3 className="text-sm font-bold">Top Marcas</h3>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>{analysis.brand_count} marcas</span>
                </div>
                {analysis.top3_brand_share != null && (
                  <span className="text-[10px] font-bold" style={{ color: analysis.top3_brand_share > 50 ? "#ef4444" : analysis.top3_brand_share > 35 ? "#f59e0b" : "#10b981" }}>
                    Top 3: {analysis.top3_brand_share.toFixed(1)}% del mercado
                  </span>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Marca</th>
                    <th style={{ textAlign: "right" }}>Productos</th>
                    <th style={{ textAlign: "right" }}>Share</th>
                    <th style={{ textAlign: "right" }}>Precio</th>
                    <th style={{ textAlign: "right" }}>Rating</th>
                    <th style={{ textAlign: "right" }}>Reviews</th>
                    <th style={{ textAlign: "center" }}>Amenaza</th>
                  </tr></thead>
                  <tbody>
                    {analysis.top_brands.map((brand) => (
                      <tr key={brand.name}>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold">{brand.name}</span>
                            {brand.best_seller_count > 0 && <Award size={10} color="#f97316" />}
                            {brand.amazon_choice_count > 0 && <BadgeCheck size={10} color="#10b981" />}
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>{brand.count}</td>
                        <td style={{ textAlign: "right" }}>{brand.market_share.toFixed(1)}%</td>
                        <td style={{ textAlign: "right" }}>{brand.avg_price != null ? `$${brand.avg_price.toFixed(2)}` : "--"}</td>
                        <td style={{ textAlign: "right" }}>{brand.avg_rating?.toFixed(1) ?? "--"}</td>
                        <td style={{ textAlign: "right" }}>{brand.total_reviews.toLocaleString()}</td>
                        <td style={{ textAlign: "center" }}>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{
                            background: brand.threat_level === "high" ? "rgba(239,68,68,0.1)" : brand.threat_level === "medium" ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.1)",
                            color: brand.threat_level === "high" ? "#ef4444" : brand.threat_level === "medium" ? "#f59e0b" : "#10b981",
                          }}>{brand.threat_level === "high" ? "Alta" : brand.threat_level === "medium" ? "Media" : "Baja"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Score Breakdowns */}
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

          {/* Saturation */}
          {analysis.saturation && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Layers size={15} color="#6366f1" />
                <h3 className="text-sm font-bold">Saturación del Mercado</h3>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>{analysis.saturation.verdict}</span>
              </div>
              <div className="w-full h-6 rounded-full overflow-hidden flex mb-3" style={{ background: "rgba(255,255,255,0.03)" }}>
                {[
                  { pct: analysis.saturation.newcomers_pct, color: "#10b981" },
                  { pct: analysis.saturation.growing_pct, color: "#6366f1" },
                  { pct: analysis.saturation.established_pct, color: "#f59e0b" },
                  { pct: analysis.saturation.dominant_pct, color: "#ef4444" },
                ].map((seg, i) => (
                  <div key={i} style={{ width: `${seg.pct}%`, background: seg.color, transition: "width 0.6s ease" }} />
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

          {/* Price Opportunity */}
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
                  <thead><tr>
                    <th>Rango</th><th style={{ textAlign: "right" }}>Productos</th><th style={{ textAlign: "right" }}>Reviews</th>
                    <th style={{ textAlign: "right" }}>Rating</th><th style={{ textAlign: "center" }}>Demanda</th><th style={{ textAlign: "center" }}>Facilidad</th>
                  </tr></thead>
                  <tbody>
                    {analysis.price_opportunity.ranges.map((r) => (
                      <tr key={r.range} style={r.range === analysis.price_opportunity?.best_range ? { background: "rgba(16,185,129,0.04)" } : undefined}>
                        <td className="font-medium">{r.range}</td>
                        <td style={{ textAlign: "right" }}>{r.count}</td>
                        <td style={{ textAlign: "right" }}>{r.avg_reviews.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td style={{ textAlign: "right" }}>{r.avg_rating?.toFixed(1) ?? "--"}</td>
                        <td style={{ textAlign: "center" }}>
                          {r.has_demand
                            ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>Sí</span>
                            : <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-muted)" }}>Baja</span>}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                            background: r.entry_ease === "Fácil" ? "rgba(16,185,129,0.1)" : r.entry_ease === "Moderado" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                            color: r.entry_ease === "Fácil" ? "#10b981" : r.entry_ease === "Moderado" ? "#f59e0b" : "#ef4444",
                          }}>{r.entry_ease}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: "Precios", data: analysis.price_distribution, color: "#6366f1" },
              { title: "Reviews", data: analysis.review_distribution, color: "#10b981" },
              { title: "Ratings", data: analysis.rating_distribution, color: "#f59e0b" },
            ].map((chart) => (
              <div key={chart.title} className="card">
                <h3 className="text-sm font-bold mb-3">{chart.title}</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chart.data}>
                    <XAxis dataKey="range" tick={{ fill: "#5c6380", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#5c6380", fontSize: 10 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" fill={chart.color} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Producto ── */}
      {activeTab === "producto" && (
        <div className="space-y-4">
          {/* Product Ideas */}
          {aiInsight?.product_ideas && aiInsight.product_ideas.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb size={15} color="#f59e0b" />
                <h4 className="text-sm font-bold">Ideas de Producto</h4>
              </div>
              <div className="space-y-2">
                {aiInsight.product_ideas.map((idea, i) => (
                  <div key={i} className="p-3 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold">{idea.name}</span>
                      <div className="flex items-center gap-2">
                        {idea.difficulty && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{
                            background: idea.difficulty === "fácil" ? "rgba(16,185,129,0.1)" : idea.difficulty === "medio" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                            color: idea.difficulty === "fácil" ? "#10b981" : idea.difficulty === "medio" ? "#f59e0b" : "#ef4444",
                          }}>{idea.difficulty}</span>
                        )}
                        <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>{idea.estimated_price}</span>
                      </div>
                    </div>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{idea.description}</p>
                    {idea.why && <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{idea.why}</p>}
                    {idea.target_margin && <p className="text-[10px] mt-1" style={{ color: "#10b981" }}>Margen: {idea.target_margin}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sub-Niches with real data */}
          {aiInsight?.sub_niches && aiInsight.sub_niches.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={15} color="#a855f7" />
                <h4 className="text-sm font-bold">Sub-Nichos para Explorar</h4>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7" }}>{aiInsight.sub_niches.length}</span>
                {checkingSubNiches && <Loader2 size={12} className="animate-spin" color="#a855f7" />}
              </div>
              <div className="space-y-3">
                {aiInsight.sub_niches.map((sn, i) => {
                  const check = subNicheChecks[sn.keyword_amazon];
                  const diffColor = check?.difficulty === "easy" ? "#10b981" : check?.difficulty === "medium" ? "#f59e0b" : check?.difficulty === "hard" ? "#ef4444" : "var(--text-muted)";
                  const diffLabel = check?.difficulty === "easy" ? "Fácil" : check?.difficulty === "medium" ? "Moderado" : check?.difficulty === "hard" ? "Difícil" : "...";
                  return (
                    <div key={i} className="p-3 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold">{sn.keyword_amazon}</span>
                        <div className="flex items-center gap-2">
                          {sn.price_range && <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>{sn.price_range}</span>}
                          {check ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{
                              background: `${diffColor}15`, color: diffColor,
                            }}>{diffLabel} ({check.difficulty_score})</span>
                          ) : checkingSubNiches ? (
                            <Loader2 size={10} className="animate-spin" color="var(--text-muted)" />
                          ) : null}
                        </div>
                      </div>

                      {/* Real data from quick-check */}
                      {check && check.total_products > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1.5">
                          <span className="text-[10px]"><span style={{ color: "var(--text-muted)" }}>Productos:</span> <strong>{check.total_products}</strong></span>
                          {check.avg_price != null && <span className="text-[10px]"><span style={{ color: "var(--text-muted)" }}>Precio:</span> <strong style={{ color: "#f59e0b" }}>${check.avg_price.toFixed(2)}</strong></span>}
                          {check.median_reviews != null && <span className="text-[10px]"><span style={{ color: "var(--text-muted)" }}>Reviews med:</span> <strong style={{ color: check.median_reviews < 100 ? "#10b981" : check.median_reviews < 300 ? "#f59e0b" : "#ef4444" }}>{check.median_reviews.toLocaleString()}</strong></span>}
                          {check.brand_count != null && <span className="text-[10px]"><span style={{ color: "var(--text-muted)" }}>Marcas:</span> <strong>{check.brand_count}</strong></span>}
                          {check.estimated_margin != null && <span className="text-[10px]"><span style={{ color: "var(--text-muted)" }}>Margen:</span> <strong style={{ color: check.estimated_margin >= 30 ? "#10b981" : check.estimated_margin >= 20 ? "#f59e0b" : "#ef4444" }}>~{check.estimated_margin}%</strong></span>}
                          {check.top3_brand_share != null && <span className="text-[10px]"><span style={{ color: "var(--text-muted)" }}>Top3:</span> <strong style={{ color: check.top3_brand_share > 50 ? "#ef4444" : "#10b981" }}>{check.top3_brand_share}%</strong></span>}
                        </div>
                      )}
                      {check && check.total_products === 0 && (
                        <p className="text-[10px] mb-1.5" style={{ color: "var(--warning)" }}>Sin resultados en Amazon para esta keyword</p>
                      )}

                      <p className="text-[11px] mb-1.5" style={{ color: "var(--text-muted)" }}>{sn.why_viable}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(249,115,22,0.1)", color: "#f97316" }}>Alibaba: {sn.keyword_alibaba}</span>
                        <button onClick={() => handleAnalyzeSubNiche(sn.keyword_amazon)} disabled={analyzingSubNiche !== null}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                          style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.2)" }}>
                          {analyzingSubNiche === sn.keyword_amazon ? <><Loader2 size={10} className="animate-spin" /> Analizando...</> : <><Search size={10} /> Análisis Completo</>}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PPC (simplified) */}
          {aiInsight?.ppc_strategy && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Megaphone size={15} color="#8b5cf6" />
                <h4 className="text-sm font-bold">PPC</h4>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{ background: aiInsight.ppc_strategy.viable ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: aiInsight.ppc_strategy.viable ? "#10b981" : "#ef4444" }}>
                  {aiInsight.ppc_strategy.viable ? "Viable" : "No Recomendado"}
                </span>
              </div>
              <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{aiInsight.ppc_strategy.reasoning}</p>
              {aiInsight.ppc_strategy.keywords?.length > 0 && (
                <div className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-[9px] font-bold uppercase mb-1.5" style={{ color: "var(--text-muted)" }}>Keywords Sugeridas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {aiInsight.ppc_strategy.keywords.map((kw, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}>{kw}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Productos ── */}
      {activeTab === "productos" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Package size={16} color="var(--accent)" />
              <div>
                <h2 className="text-base font-bold">Productos ({products.length})</h2>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>del nicho &ldquo;{analysis.keyword}&rdquo;</p>
              </div>
            </div>
            <button onClick={handleRescrape} disabled={rescraping} className="btn btn-secondary text-xs">
              {rescraping ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Re-scrapear
            </button>
          </div>
          {productsLoading ? (
            <div className="card text-center py-10"><div className="spinner mx-auto mb-3" /><p className="text-sm" style={{ color: "var(--text-muted)" }}>Cargando productos...</p></div>
          ) : products.length === 0 ? (
            <div className="card text-center py-10"><Package size={24} style={{ color: "var(--text-muted)", margin: "0 auto 8px" }} /><p className="text-sm" style={{ color: "var(--text-muted)" }}>Sin productos guardados</p></div>
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
      )}

      {/* ═══ AI CHAT (always visible) ═══ */}
      {aiInsight && !aiInsight.error && (
        <div className="card" style={{ border: "1px solid rgba(99,102,241,0.2)" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
              <MessageCircle size={14} color="#fff" />
            </div>
            <div>
              <h3 className="text-sm font-bold">AI Chat</h3>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Pregunta lo que quieras sobre {analysis.keyword}</p>
            </div>
          </div>
          <div className="rounded-xl overflow-y-auto p-4 space-y-3 mb-4" style={{ background: "var(--bg-elevated)", minHeight: 80, maxHeight: 360 }}>
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
                <div className="px-3 py-2 rounded-xl" style={{ background: "rgba(0,0,0,0.3)" }}><Loader2 size={14} className="animate-spin" style={{ color: "var(--accent)" }} /></div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); handleChatSend(); }} className="flex gap-2">
            <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
              placeholder="Pregunta sobre el nicho..." className="flex-1 px-4 py-2 rounded-xl text-sm"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }} disabled={chatLoading} />
            <button type="submit" disabled={!chatInput.trim() || chatLoading}
              className="px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold transition-colors"
              style={{ background: chatInput.trim() ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "var(--bg-elevated)", color: chatInput.trim() ? "#fff" : "var(--text-muted)" }}>
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
