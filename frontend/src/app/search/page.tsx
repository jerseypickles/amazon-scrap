"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Loader2,
  AlertCircle,
  TrendingUp,
  DollarSign,
  Star,
  Users,
  ArrowRight,
  ShieldCheck,
  Repeat,
  Package,
  Zap,
  Brain,
  Sparkles,
} from "lucide-react";
import { analyzeNiche, getSmartNiches } from "@/lib/api";
import type { NicheAnalysis, SmartNiche } from "@/types";

function scoreColor(s: number | null) {
  if (s === null) return "var(--text-muted)";
  if (s >= 70) return "#10b981";
  if (s >= 55) return "#84cc16";
  if (s >= 40) return "#f59e0b";
  return "#ef4444";
}

function scoreBadge(s: number | null) {
  if (s === null) return { cls: "badge-info", text: "N/A" };
  if (s >= 70) return { cls: "badge-success", text: "Excelente" };
  if (s >= 55) return { cls: "badge-warning", text: "Bueno" };
  if (s >= 40) return { cls: "badge-warning", text: "Moderado" };
  return { cls: "badge-danger", text: "Difícil" };
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-96"><div className="spinner" /></div>}>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const [keyword, setKeyword] = useState("");
  const [pages, setPages] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<NicheAnalysis | null>(null);
  const [niches, setNiches] = useState<SmartNiche[]>([]);
  const [nichesLoading, setNichesLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    getSmartNiches()
      .then((d) => setNiches(d.niches))
      .catch(() => {})
      .finally(() => setNichesLoading(false));
    const q = searchParams.get("q");
    if (q) setKeyword(q);
  }, [searchParams]);

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await analyzeNiche(keyword.trim(), pages);
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error en el análisis");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold">Analizar Nicho</h1>
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
            style={{ background: "var(--accent-glow)", color: "var(--accent)", border: "1px solid rgba(249,115,22,0.2)" }}
          >
            Consumibles
          </span>
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Busca un producto consumible para descubrir oportunidades de marca privada en Amazon US
        </p>
      </div>

      {/* Search box */}
      <div
        className="card mb-6"
        style={{
          padding: "1.5rem",
          background: "linear-gradient(145deg, rgba(12,16,28,0.9), rgba(18,24,42,0.6))",
          boxShadow: "var(--shadow-elevated), 0 0 60px rgba(249,115,22,0.04)",
        }}
      >
        <form onSubmit={handleAnalyze}>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Buscar nicho... ej: detergente, proteína whey, café cápsulas"
                className="input"
                style={{ paddingLeft: "2.75rem" }}
              />
            </div>
            <select value={pages} onChange={(e) => setPages(Number(e.target.value))} className="select">
              <option value={1}>1 pág (~20 productos)</option>
              <option value={2}>2 págs (~40 productos)</option>
              <option value={3}>3 págs (~60 productos)</option>
            </select>
            <button type="submit" disabled={loading || !keyword.trim()} className="btn btn-primary">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {loading ? "Analizando..." : "Analizar"}
            </button>
          </div>
        </form>
      </div>

      {/* Smart Niche Suggestions */}
      {!result && !loading && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(168,85,247,0.15)", boxShadow: "0 0 12px rgba(168,85,247,0.1)" }}
              >
                <Brain size={14} color="#a855f7" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Nichos Inteligentes
              </p>
              <Sparkles size={12} color="#a855f7" style={{ opacity: 0.6 }} />
            </div>
            {niches.length > 0 && (
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {niches.filter((n) => n.analyzed).length} analizados de {niches.length}
              </p>
            )}
          </div>

          {nichesLoading ? (
            <div className="flex items-center gap-2 py-4">
              <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-muted)" }} />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Cargando nichos...</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {niches.map((n) => (
                <button
                  key={n.keyword}
                  onClick={() => setKeyword(n.keyword)}
                  className="group relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 hover:scale-[1.03]"
                  style={{
                    background: n.analyzed
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(255,255,255,0.02)",
                    border: `1px solid ${
                      n.label === "Oportunidad" ? "rgba(16,185,129,0.3)" :
                      n.label === "Bueno" ? "rgba(132,204,22,0.3)" :
                      n.label === "Competido" ? "rgba(245,158,11,0.25)" :
                      n.label === "Difícil" ? "rgba(239,68,68,0.25)" :
                      "rgba(255,255,255,0.08)"
                    }`,
                    color: n.analyzed ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  {n.keyword}
                  {n.analyzed && n.opportunity_score !== null && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-0.5"
                      style={{
                        background:
                          n.label === "Oportunidad" ? "rgba(16,185,129,0.15)" :
                          n.label === "Bueno" ? "rgba(132,204,22,0.15)" :
                          n.label === "Competido" ? "rgba(245,158,11,0.12)" :
                          "rgba(239,68,68,0.12)",
                        color:
                          n.label === "Oportunidad" ? "#10b981" :
                          n.label === "Bueno" ? "#84cc16" :
                          n.label === "Competido" ? "#f59e0b" :
                          "#ef4444",
                      }}
                    >
                      {Math.round(n.opportunity_score)}
                    </span>
                  )}
                  {n.analyzed && (
                    <span
                      className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                      style={{
                        background:
                          n.label === "Oportunidad" ? "rgba(16,185,129,0.15)" :
                          n.label === "Bueno" ? "rgba(132,204,22,0.15)" :
                          n.label === "Competido" ? "rgba(245,158,11,0.12)" :
                          "rgba(239,68,68,0.12)",
                        color:
                          n.label === "Oportunidad" ? "#10b981" :
                          n.label === "Bueno" ? "#84cc16" :
                          n.label === "Competido" ? "#f59e0b" :
                          "#ef4444",
                      }}
                    >
                      {n.label}
                    </span>
                  )}
                  {!n.analyzed && (
                    <span
                      className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                      style={{ background: "rgba(148,163,184,0.1)", color: "var(--text-muted)" }}
                    >
                      Nuevo
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="card text-center py-20" style={{ background: "linear-gradient(145deg, rgba(12,16,28,0.9), rgba(18,24,42,0.5))" }}>
          <div className="spinner mx-auto mb-5" />
          <h3 className="text-lg font-bold mb-2">Analizando &ldquo;{keyword}&rdquo;</h3>
          <p className="text-sm max-w-sm mx-auto" style={{ color: "var(--text-secondary)" }}>
            Escaneando productos Amazon US y calculando oportunidad. Esto toma 30-60 segundos...
          </p>
          <div className="flex items-center justify-center gap-6 mt-6">
            {["Buscando productos", "Parseando datos", "Calculando scores"].map((step) => (
              <div key={step} className="flex items-center gap-2">
                <div className="pulse-dot" style={{ color: "var(--accent)" }} />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card flex items-center gap-3 mb-6" style={{ borderColor: "var(--danger)" }}>
          <AlertCircle size={18} color="var(--danger)" />
          <p className="text-sm font-medium" style={{ color: "var(--danger)" }}>{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div>
          {/* Cached indicator */}
          {result.is_cached && (
            <div
              className="card flex items-center gap-3 mb-4"
              style={{ borderColor: "rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.05)" }}
            >
              <Repeat size={16} color="var(--info)" />
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--info)" }}>
                  Este nicho ya fue analizado recientemente
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Mostrando análisis existente ({result.created_at ? new Date(result.created_at).toLocaleString("es") : ""}). Se actualiza automáticamente cada 24h.
                </p>
              </div>
            </div>
          )}

          {/* Hero Score */}
          <div
            className="card-premium rounded-2xl p-6 mb-6"
            style={{
              background: "linear-gradient(145deg, rgba(12,16,28,0.9), rgba(18,24,42,0.6))",
              boxShadow: `var(--shadow-elevated), 0 0 40px ${scoreColor(result.opportunity_score)}10`,
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-2xl font-bold capitalize">{result.keyword}</h2>
                  <span className={`badge ${scoreBadge(result.opportunity_score).cls}`}>
                    {scoreBadge(result.opportunity_score).text}
                  </span>
                  {result.is_cached && (
                    <span className="badge badge-info" style={{ fontSize: "9px" }}>Existente</span>
                  )}
                </div>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {result.total_products} productos analizados · {result.brand_count} marcas detectadas
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                  Score Oportunidad
                </p>
                <div
                  className="text-5xl font-black stat-glow"
                  style={{ color: scoreColor(result.opportunity_score) }}
                >
                  {result.opportunity_score ?? "--"}
                </div>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>de 100</p>
              </div>
            </div>
          </div>

          {/* Score Breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Demanda", score: result.demand_score, icon: TrendingUp, desc: "Tamaño del mercado" },
              { label: "Competencia", score: result.competition_score, icon: Users, desc: "Menor = más fácil" },
              { label: "Precio", score: result.price_score, icon: DollarSign, desc: "Potencial de margen" },
              { label: "Calidad", score: result.quality_gap_score, icon: Star, desc: "Espacio de mejora" },
            ].map((s) => (
              <div key={s.label} className="card text-center">
                <div
                  className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center"
                  style={{
                    background: `${scoreColor(s.score)}12`,
                    boxShadow: `0 0 15px ${scoreColor(s.score)}08`,
                  }}
                >
                  <s.icon size={18} color={scoreColor(s.score)} />
                </div>
                <p className="text-2xl font-black" style={{ color: scoreColor(s.score) }}>{s.score ?? "--"}</p>
                <p className="text-xs font-bold mt-1">{s.label}</p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{s.desc}</p>
                <div className="progress mt-3">
                  <div className="progress-fill" style={{ width: `${s.score ?? 0}%`, background: scoreColor(s.score) }} />
                </div>
              </div>
            ))}
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {[
              { label: "Precio Promedio", value: result.avg_price ? `$${result.avg_price.toFixed(2)}` : "--", sub: `$${result.min_price?.toFixed(0) ?? "?"} - $${result.max_price?.toFixed(0) ?? "?"}` },
              { label: "Precio Mediana", value: result.median_price ? `$${result.median_price.toFixed(2)}` : "--" },
              { label: "Rating Promedio", value: result.avg_rating ? `${result.avg_rating} / 5` : "--" },
              { label: "Reviews Prom", value: result.avg_reviews?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "--" },
              { label: "Ingreso Est/Mes", value: result.revenue_estimate ? `$${Math.round(result.revenue_estimate).toLocaleString()}` : "--" },
            ].map((m) => (
              <div key={m.label} className="metric-tile">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{m.label}</p>
                <p className="text-lg font-bold mt-1">{m.value}</p>
                {"sub" in m && m.sub && <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{m.sub}</p>}
              </div>
            ))}
          </div>

          {/* Brand & Price Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold">Distribución de Marcas</h3>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Top 3: {result.top3_brand_share?.toFixed(1)}%
                </span>
              </div>
              <div className="space-y-3">
                {result.top_brands.slice(0, 8).map((b, i) => (
                  <div key={b.name} className="flex items-center gap-3">
                    <span className="text-xs font-bold w-5 text-center" style={{ color: "var(--text-muted)" }}>{i + 1}</span>
                    <span className="text-sm truncate flex-1 min-w-0">{b.name}</span>
                    <div className="w-28 progress">
                      <div className="progress-fill" style={{ width: `${b.market_share}%`, background: "var(--accent)" }} />
                    </div>
                    <span className="text-xs font-semibold w-12 text-right" style={{ color: "var(--accent)" }}>
                      {b.market_share.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h3 className="text-sm font-bold mb-4">Distribución de Precios</h3>
              <div className="space-y-3">
                {result.price_distribution.map((p) => {
                  const max = Math.max(...result.price_distribution.map((d) => d.count));
                  return (
                    <div key={p.range} className="flex items-center gap-3">
                      <span className="text-xs w-14" style={{ color: "var(--text-secondary)" }}>{p.range}</span>
                      <div className="flex-1 progress">
                        <div className="progress-fill" style={{ width: `${(p.count / max) * 100}%`, background: "var(--info)" }} />
                      </div>
                      <span className="text-xs font-semibold w-7 text-right">{p.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Rating & Review Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="card">
              <h3 className="text-sm font-bold mb-4">Distribución de Ratings</h3>
              <div className="space-y-3">
                {result.rating_distribution.map((r) => {
                  const max = Math.max(...result.rating_distribution.map((d) => d.count));
                  return (
                    <div key={r.range} className="flex items-center gap-3">
                      <span className="text-xs w-12" style={{ color: "var(--text-secondary)" }}>{r.range}</span>
                      <div className="flex-1 progress">
                        <div className="progress-fill" style={{ width: `${(r.count / max) * 100}%`, background: "var(--warning)" }} />
                      </div>
                      <span className="text-xs font-semibold w-7 text-right">{r.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card">
              <h3 className="text-sm font-bold mb-4">Distribución de Reviews</h3>
              <div className="space-y-3">
                {result.review_distribution.map((r) => {
                  const max = Math.max(...result.review_distribution.map((d) => d.count));
                  return (
                    <div key={r.range} className="flex items-center gap-3">
                      <span className="text-xs w-12" style={{ color: "var(--text-secondary)" }}>{r.range}</span>
                      <div className="flex-1 progress">
                        <div className="progress-fill" style={{ width: `${(r.count / max) * 100}%`, background: "var(--success)" }} />
                      </div>
                      <span className="text-xs font-semibold w-7 text-right">{r.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Summary & CTA */}
          <div
            className="card-premium rounded-2xl p-6"
            style={{
              background: "linear-gradient(145deg, rgba(12,16,28,0.9), rgba(18,24,42,0.6))",
              border: `1px solid ${scoreColor(result.opportunity_score)}20`,
            }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center"
                style={{
                  background: `${scoreColor(result.opportunity_score)}15`,
                  boxShadow: `0 0 15px ${scoreColor(result.opportunity_score)}10`,
                }}
              >
                <ShieldCheck size={20} color={scoreColor(result.opportunity_score)} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold mb-2">Resumen del Análisis</h3>
                <div className="space-y-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {(result.opportunity_score ?? 0) >= 65 && (
                    <p style={{ color: "var(--success)" }}>
                      Este nicho muestra fuerte oportunidad para marca privada de productos consumibles.
                    </p>
                  )}
                  {(result.opportunity_score ?? 0) >= 40 && (result.opportunity_score ?? 0) < 65 && (
                    <p style={{ color: "var(--warning)" }}>
                      Oportunidad moderada. Requiere diferenciación fuerte o precio competitivo.
                    </p>
                  )}
                  {(result.opportunity_score ?? 0) < 40 && (
                    <p style={{ color: "var(--danger)" }}>
                      Nicho difícil. Alta competencia o bajo potencial de margen.
                    </p>
                  )}
                  {(result.top3_brand_share ?? 0) <= 40 && (
                    <p>Mercado fragmentado ({result.top3_brand_share?.toFixed(1)}% top-3) — bueno para marcas nuevas.</p>
                  )}
                  {(result.top3_brand_share ?? 0) > 60 && (
                    <p>Mercado concentrado ({result.top3_brand_share?.toFixed(1)}% top-3) — entrar será más difícil.</p>
                  )}
                  {result.avg_price && result.avg_price >= 15 && result.avg_price <= 50 && (
                    <p>Precio (${result.avg_price.toFixed(2)}) en rango ideal para márgenes de marca privada.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={() => router.push(`/analysis/${result.id}`)} className="btn btn-primary">
                Análisis Completo <ArrowRight size={14} />
              </button>
              <button onClick={() => { setResult(null); setKeyword(""); }} className="btn btn-secondary">
                Nueva Búsqueda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
