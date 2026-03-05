"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Brain,
  Loader2,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Lightbulb,
  Target,
  TrendingUp,
  Scale,
  RefreshCw,
  CheckCircle,
  XCircle,
  DollarSign,
  Package,
  Globe,
  Repeat,
  Factory,
  BarChart3,
  CircleCheck,
  CircleX,
  Layers,
  Rocket,
  MessageCircle,
  Send,
} from "lucide-react";
import {
  getAnalysisHistory,
  getAIAnalysis,
  compareNiches,
  aiChat,
} from "@/lib/api";
import type {
  AnalysisHistoryItem,
  AIAnalysisResponse,
  AICompareResponse,
  AIInsight,
} from "@/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function severityColor(s: string) {
  if (s === "high") return "var(--danger)";
  if (s === "medium") return "var(--warning)";
  return "var(--success)";
}

function scoreLabelBadge(label: string) {
  const map: Record<string, string> = {
    excellent: "badge-success",
    good: "badge-success",
    moderate: "badge-warning",
    difficult: "badge-danger",
    avoid: "badge-danger",
  };
  return map[label] || "badge-info";
}

function scoreLabelES(label: string) {
  const map: Record<string, string> = {
    excellent: "Excelente",
    good: "Bueno",
    moderate: "Moderado",
    difficult: "Dif\u00edcil",
    avoid: "Evitar",
  };
  return map[label] || label;
}

function difficultyBadge(d: string) {
  if (d === "f\u00e1cil" || d === "easy") return { color: "#10b981", bg: "rgba(16,185,129,0.1)", label: d };
  if (d === "medio" || d === "medium") return { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", label: d };
  return { color: "#ef4444", bg: "rgba(239,68,68,0.1)", label: d };
}

function formatBudget(n: number) {
  return n.toLocaleString("en-US");
}

const BUDGET_PRESETS = [5000, 10000, 15000, 20000, 30000, 50000];

export default function AdvisorPage() {
  const [analyses, setAnalyses] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [aiResult, setAiResult] = useState<AIAnalysisResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // Budget
  const [budget, setBudget] = useState(10000);

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [compareResult, setCompareResult] = useState<AICompareResponse | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAnalysisHistory()
      .then((d) => setAnalyses(d.analyses))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function handleAnalyze(id: number) {
    setSelectedId(id);
    setAiLoading(true);
    setAiError("");
    setAiResult(null);
    setCompareResult(null);
    setChatMessages([]);
    try {
      const result = await getAIAnalysis(id, budget);
      setAiResult(result);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI analysis failed");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleCompare() {
    if (compareIds.length < 2) return;
    setCompareLoading(true);
    setAiResult(null);
    setAiError("");
    try {
      const result = await compareNiches(compareIds, budget);
      setCompareResult(result);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setCompareLoading(false);
    }
  }

  async function handleChatSend() {
    if (!chatInput.trim() || !selectedId || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(newMessages);
    setChatLoading(true);
    try {
      const res = await aiChat(selectedId, msg, newMessages.slice(0, -1), budget);
      setChatMessages([...newMessages, { role: "assistant", content: res.reply }]);
    } catch {
      setChatMessages([...newMessages, { role: "assistant", content: "Error al procesar tu mensaje. Intenta de nuevo." }]);
    } finally {
      setChatLoading(false);
    }
  }

  function toggleCompareId(id: number) {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 5 ? [...prev, id] : prev
    );
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-96">
        <div className="spinner" />
      </div>
    );

  const insight = aiResult?.insight;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              <Brain size={20} color="#fff" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">AI Advisor</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
                Estrategia marca proveedor → marca privada con IA
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => { setCompareMode(!compareMode); setCompareIds([]); setCompareResult(null); }}
          className={`btn ${compareMode ? "btn-primary" : "btn-secondary"}`}
        >
          <Scale size={16} />
          {compareMode ? "Cancelar" : "Comparar Nichos"}
        </button>
      </div>

      {/* Budget Selector */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-3">
          <DollarSign size={16} color="#10b981" />
          <h3 className="text-sm font-bold">Presupuesto de Inversi\u00f3n</h3>
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
          El AI calcular\u00e1 costos, unidades, ROI y viabilidad basado en este presupuesto
        </p>
      </div>

      {/* Compare bar */}
      {compareMode && (
        <div className="card mb-6 flex items-center justify-between" style={{ borderColor: "var(--accent)" }}>
          <div>
            <p className="text-sm font-semibold">
              Selecciona 2-5 nichos para comparar ({compareIds.length} seleccionados)
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              La IA analizar\u00e1 y ranquear\u00e1 cu\u00e1l es mejor para tu presupuesto de ${formatBudget(budget)}
            </p>
          </div>
          <button
            onClick={handleCompare}
            disabled={compareIds.length < 2 || compareLoading}
            className="btn btn-primary"
          >
            {compareLoading ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
            {compareLoading ? "Comparando..." : "Comparar con IA"}
          </button>
        </div>
      )}

      {/* Analysis List */}
      {analyses.length === 0 ? (
        <div className="card text-center py-16">
          <Brain size={40} color="var(--text-muted)" className="mx-auto mb-4" />
          <h2 className="text-lg font-bold mb-2">No hay an\u00e1lisis a\u00fan</h2>
          <p className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
            Analiza algunos nichos primero, luego ven aqu\u00ed para consejos estrat\u00e9gicos con IA
          </p>
          <Link href="/search" className="btn btn-primary">
            Analizar un Nicho <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
          {analyses.map((a) => {
            const isSelected = selectedId === a.id;
            const isCompareSelected = compareIds.includes(a.id);
            return (
              <div
                key={a.id}
                className={`card card-hover cursor-pointer ${isSelected ? "card-glow" : ""}`}
                style={
                  isCompareSelected
                    ? { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" }
                    : isSelected
                    ? { borderColor: "var(--accent)" }
                    : {}
                }
                onClick={() => (compareMode ? toggleCompareId(a.id) : handleAnalyze(a.id))}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold capitalize">{a.keyword}</h3>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {a.total_products} productos &middot; {a.created_at ? new Date(a.created_at).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {compareMode && (
                      <div
                        className="w-5 h-5 rounded border flex items-center justify-center"
                        style={{
                          borderColor: isCompareSelected ? "var(--accent)" : "var(--border)",
                          background: isCompareSelected ? "var(--accent)" : "transparent",
                        }}
                      >
                        {isCompareSelected && <CheckCircle size={12} color="#fff" />}
                      </div>
                    )}
                    <span
                      className="text-xl font-bold"
                      style={{
                        color:
                          (a.opportunity_score ?? 0) >= 65
                            ? "#10b981"
                            : (a.opportunity_score ?? 0) >= 40
                            ? "#f59e0b"
                            : "#ef4444",
                      }}
                    >
                      {a.opportunity_score ?? "--"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI Loading */}
      {aiLoading && (
        <div className="card text-center py-16">
          <div className="spinner mx-auto mb-4" />
          <h3 className="text-lg font-bold mb-2">IA analizando...</h3>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Claude est\u00e1 revisando datos con presupuesto de ${formatBudget(budget)}
          </p>
        </div>
      )}

      {/* AI Error */}
      {aiError && (
        <div className="card flex items-center gap-3" style={{ borderColor: "var(--danger)" }}>
          <XCircle size={18} color="var(--danger)" />
          <p className="text-sm" style={{ color: "var(--danger)" }}>{aiError}</p>
        </div>
      )}

      {/* Compare Result */}
      {compareResult && (
        <div className="space-y-6">
          <div className="card" style={{ background: "linear-gradient(135deg, var(--bg-card), var(--bg-elevated))" }}>
            <div className="flex items-center gap-3 mb-4">
              <Scale size={20} color="var(--accent)" />
              <h2 className="text-lg font-bold">Resultado de Comparaci\u00f3n</h2>
            </div>
            <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
              {compareResult.comparison.recommendation}
            </p>

            <div className="space-y-3">
              {compareResult.comparison.ranking?.map((r, i) => (
                <div
                  key={r.keyword}
                  className="flex items-center gap-4 p-4 rounded-xl"
                  style={{ background: i === 0 ? "rgba(16,185,129,0.08)" : "var(--bg-elevated)" }}
                >
                  <span
                    className="text-2xl font-black w-8"
                    style={{ color: i === 0 ? "#10b981" : "var(--text-muted)" }}
                  >
                    #{r.rank}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold capitalize">{r.keyword}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {r.reasoning}
                    </p>
                  </div>
                  <span className="text-lg font-bold" style={{ color: "var(--accent)" }}>
                    {r.score}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {compareResult.comparison.comparison_factors && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {compareResult.comparison.comparison_factors.map((f) => (
                <div key={f.factor} className="card">
                  <h4 className="text-sm font-bold mb-2">{f.factor}</h4>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{f.analysis}</p>
                  <p className="text-xs mt-2">
                    Mejor: <span className="font-semibold capitalize" style={{ color: "var(--success)" }}>{f.best}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI Result */}
      {insight && !insight.error && (
        <div className="space-y-6">
          {/* Verdict + Consumable Badge */}
          <div className="card" style={{ background: "linear-gradient(135deg, var(--bg-card), var(--bg-elevated))" }}>
            <div className="flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                <Brain size={22} color="#fff" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h2 className="text-lg font-bold">Veredicto IA</h2>
                  <span className={`badge ${scoreLabelBadge(insight.score_label)}`}>
                    {scoreLabelES(insight.score_label)}
                  </span>
                  {insight.is_consumable && (
                    <span className="badge badge-info" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Repeat size={10} /> Consumible
                    </span>
                  )}
                  {insight.repurchase_weeks && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                      Recompra cada {insight.repurchase_weeks} sem
                    </span>
                  )}
                  {aiResult?.cached && (
                    <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                      cached
                    </span>
                  )}
                </div>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {insight.verdict}
                </p>
              </div>
            </div>
          </div>

          {/* Go/No-Go Decision */}
          {insight.go_no_go && (
            <div className="card">
              <div className="flex items-center gap-3 mb-5">
                {insight.go_no_go.decision === "go" ? (
                  <Rocket size={18} color="#10b981" />
                ) : insight.go_no_go.decision === "caution" ? (
                  <AlertTriangle size={18} color="#f59e0b" />
                ) : (
                  <XCircle size={18} color="#ef4444" />
                )}
                <h3 className="text-sm font-bold">Decisi\u00f3n Go / No-Go</h3>
                <span
                  className="text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider"
                  style={{
                    background:
                      insight.go_no_go.decision === "go"
                        ? "rgba(16,185,129,0.15)"
                        : insight.go_no_go.decision === "caution"
                        ? "rgba(245,158,11,0.15)"
                        : "rgba(239,68,68,0.15)",
                    color:
                      insight.go_no_go.decision === "go"
                        ? "#10b981"
                        : insight.go_no_go.decision === "caution"
                        ? "#f59e0b"
                        : "#ef4444",
                  }}
                >
                  {insight.go_no_go.decision === "go" ? "GO" : insight.go_no_go.decision === "caution" ? "CAUTELA" : "NO-GO"}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                {([
                  { key: "margin_without_brand" as const, label: "Margen sin marca" },
                  { key: "margin_above_30" as const, label: "Margen >30%" },
                  { key: "median_reviews_below_300" as const, label: "Reviews med. <300" },
                  { key: "market_not_saturated" as const, label: "Mercado no saturado" },
                  { key: "price_in_fba_range" as const, label: "Precio en rango FBA" },
                  { key: "no_complex_certs" as const, label: "Sin certif. complejas" },
                  { key: "generic_entry_viable" as const, label: "Entrada viable" },
                ]).map((item) => {
                  const passed = insight.go_no_go![item.key];
                  return (
                    <div
                      key={item.key}
                      className="flex items-center gap-2 p-2.5 rounded-lg"
                      style={{
                        background: passed ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)",
                        border: `1px solid ${passed ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)"}`,
                      }}
                    >
                      {passed ? (
                        <CircleCheck size={14} color="#10b981" className="flex-shrink-0" />
                      ) : (
                        <CircleX size={14} color="#ef4444" className="flex-shrink-0" />
                      )}
                      <span className="text-[11px] font-semibold">{item.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {insight.go_no_go.summary}
                </p>
              </div>
            </div>
          )}

          {/* Phase Recommendation */}
          {insight.phase_recommendation && (
            <div className="card">
              <div className="flex items-center gap-3 mb-5">
                <Layers size={18} color="var(--accent)" />
                <h3 className="text-sm font-bold">Estrategia de Fases</h3>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: insight.phase_recommendation.requires_brand_from_start
                      ? "rgba(239,68,68,0.1)"
                      : "rgba(16,185,129,0.1)",
                    color: insight.phase_recommendation.requires_brand_from_start
                      ? "#ef4444"
                      : "#10b981",
                  }}
                >
                  {insight.phase_recommendation.requires_brand_from_start
                    ? "Requiere Marca"
                    : "Gen\u00e9rico OK"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Phase 1 - Supplier Brand */}
                <div
                  className="p-4 rounded-xl"
                  style={{
                    background: "rgba(16,185,129,0.04)",
                    border: "1px solid rgba(16,185,129,0.15)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black"
                      style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}
                    >
                      1
                    </span>
                    <h4 className="text-sm font-bold" style={{ color: "#10b981" }}>
                      Marca del Proveedor
                    </h4>
                  </div>
                  <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
                    {insight.phase_recommendation.brand_reason}
                  </p>
                  {insight.phase_recommendation.buy_box_risk && (
                    <div className="mt-2 p-2 rounded-lg" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.12)" }}>
                      <p className="text-[10px] font-bold uppercase mb-0.5" style={{ color: "#f59e0b" }}>
                        Riesgo Buy Box
                      </p>
                      <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                        {insight.phase_recommendation.buy_box_risk}
                      </p>
                    </div>
                  )}
                </div>

                {/* Phase 2 - Private Label */}
                <div
                  className="p-4 rounded-xl"
                  style={{
                    background: "rgba(99,102,241,0.04)",
                    border: "1px solid rgba(99,102,241,0.15)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black"
                      style={{ background: "rgba(99,102,241,0.15)", color: "var(--accent)" }}
                    >
                      2
                    </span>
                    <h4 className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                      Marca Privada
                    </h4>
                  </div>
                  <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Trigger:</span>{" "}
                    {insight.phase_recommendation.private_label_trigger}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Inversi\u00f3n:</span>{" "}
                    {insight.phase_recommendation.private_label_investment}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Financial Analysis */}
          {insight.financials && (
            <div className="card">
              <div className="flex items-center gap-3 mb-5">
                <DollarSign size={18} color="#10b981" />
                <h3 className="text-sm font-bold">An\u00e1lisis Financiero</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                  Presupuesto ${formatBudget(budget)}
                </span>
              </div>

              {/* Cost breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div className="p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Costo China (FOB)
                  </p>
                  <p className="text-lg font-bold mt-1" style={{ color: "#f59e0b" }}>{insight.financials.costo_unitario_china}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Env\u00edo + Customs
                  </p>
                  <p className="text-lg font-bold mt-1">{insight.financials.costo_envio_unidad}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Amazon FBA
                  </p>
                  <p className="text-lg font-bold mt-1">{insight.financials.costo_amazon_fba}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Referral Fee
                  </p>
                  <p className="text-lg font-bold mt-1">{insight.financials.amazon_referral_fee}</p>
                </div>
              </div>

              {/* Profit metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div className="p-3 rounded-xl" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#10b981" }}>
                    Precio Venta
                  </p>
                  <p className="text-xl font-black mt-1" style={{ color: "#10b981" }}>{insight.financials.precio_venta_sugerido}</p>
                </div>
                <div className="p-3 rounded-xl" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#10b981" }}>
                    Margen Neto
                  </p>
                  <p className="text-xl font-black mt-1" style={{ color: "#10b981" }}>{insight.financials.margen_neto_unidad}</p>
                  <p className="text-[10px] font-semibold" style={{ color: "#10b981" }}>{insight.financials.margen_porcentaje}</p>
                </div>
                <div className="p-3 rounded-xl" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
                    Unidades con ${formatBudget(budget)}
                  </p>
                  <p className="text-xl font-black mt-1" style={{ color: "var(--accent)" }}>{insight.financials.unidades_con_10k}</p>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>MOQ: {insight.financials.moq_china}</p>
                </div>
                <div className="p-3 rounded-xl" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#f59e0b" }}>
                    Break-even
                  </p>
                  <p className="text-xl font-black mt-1" style={{ color: "#f59e0b" }}>{insight.financials.breakeven_unidades}</p>
                </div>
              </div>

              {/* ROI + LTV */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg text-center" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>ROI 6 Meses</p>
                  <p className="text-lg font-bold mt-1" style={{ color: "var(--accent)" }}>{insight.financials.roi_6_meses}</p>
                </div>
                <div className="p-3 rounded-lg text-center" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>ROI 12 Meses</p>
                  <p className="text-lg font-bold mt-1" style={{ color: "#10b981" }}>{insight.financials.roi_12_meses}</p>
                </div>
                <div className="p-3 rounded-lg text-center" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>LTV Cliente/A\u00f1o</p>
                  <p className="text-lg font-bold mt-1" style={{ color: "#10b981" }}>{insight.financials.ltv_cliente_anual}</p>
                </div>
              </div>
            </div>
          )}

          {/* Entry Strategy */}
          {insight.entry_strategy && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <Target size={18} color="var(--accent)" />
                <h3 className="text-sm font-bold">Estrategia de Entrada</h3>
                <span className={`badge ${insight.entry_strategy.recommended ? "badge-success" : "badge-danger"}`}>
                  {insight.entry_strategy.recommended ? "Recomendado" : "No Recomendado"}
                </span>
              </div>
              <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                <p>{insight.entry_strategy.reasoning}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div className="p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                      Diferenciaci\u00f3n
                    </p>
                    <p className="text-sm">{insight.entry_strategy.differentiation_angle}</p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                      Precio Objetivo
                    </p>
                    <p className="text-sm">{insight.entry_strategy.target_price}</p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                      Rating Objetivo
                    </p>
                    <p className="text-sm">{insight.entry_strategy.target_rating}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Product Ideas */}
          {insight.product_ideas && insight.product_ideas.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <Lightbulb size={18} color="#f59e0b" />
                <h3 className="text-sm font-bold">Ideas de Producto</h3>
              </div>
              <div className="space-y-4">
                {insight.product_ideas.map((idea, i) => {
                  const diff = idea.difficulty ? difficultyBadge(idea.difficulty) : null;
                  return (
                    <div key={i} className="p-4 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-sm">{idea.name}</h4>
                        <div className="flex items-center gap-2">
                          {idea.subscribe_save && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(99,102,241,0.1)", color: "var(--accent)" }}>
                              S&amp;S
                            </span>
                          )}
                          {diff && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: diff.bg, color: diff.color }}>
                              {diff.label}
                            </span>
                          )}
                          <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                            {idea.estimated_price}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {idea.description}
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                        {idea.china_cost && (
                          <div className="p-2 rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
                            <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Costo China</p>
                            <p className="text-xs font-bold mt-0.5" style={{ color: "#f59e0b" }}>{idea.china_cost}</p>
                          </div>
                        )}
                        {idea.target_margin && (
                          <div className="p-2 rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
                            <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Margen</p>
                            <p className="text-xs font-bold mt-0.5" style={{ color: "#10b981" }}>{idea.target_margin}</p>
                          </div>
                        )}
                        {idea.size_suggestion && (
                          <div className="p-2 rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
                            <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Tama\u00f1o</p>
                            <p className="text-xs font-semibold mt-0.5">{idea.size_suggestion}</p>
                          </div>
                        )}
                        {idea.packaging_idea && (
                          <div className="p-2 rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
                            <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Packaging</p>
                            <p className="text-xs font-semibold mt-0.5">{idea.packaging_idea}</p>
                          </div>
                        )}
                      </div>
                      <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                        {idea.why}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sourcing China */}
          {insight.sourcing && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <Factory size={18} color="#f97316" />
                <h3 className="text-sm font-bold">Sourcing China</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(249,115,22,0.1)", color: "#f97316" }}>
                  Alibaba / 1688
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-[10px] font-bold uppercase mb-2" style={{ color: "var(--text-muted)" }}>
                    Tipo de Proveedor
                  </p>
                  <p className="text-sm">{insight.sourcing.tipo_proveedor}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-[10px] font-bold uppercase mb-2" style={{ color: "var(--text-muted)" }}>
                    Tiempo Producci\u00f3n
                  </p>
                  <p className="text-sm">{insight.sourcing.tiempo_produccion_dias} d\u00edas</p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-[10px] font-bold uppercase mb-2" style={{ color: "var(--text-muted)" }}>
                    Keywords Alibaba
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {insight.sourcing.palabras_clave_alibaba.map((kw, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(249,115,22,0.1)", color: "#f97316" }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-[10px] font-bold uppercase mb-2" style={{ color: "var(--text-muted)" }}>
                    Certificaciones
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {insight.sourcing.certificaciones_necesarias.map((cert, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {insight.sourcing.consejo_negociacion && (
                <div className="mt-4 p-3 rounded-lg" style={{ background: "rgba(249,115,22,0.04)", border: "1px solid rgba(249,115,22,0.15)" }}>
                  <p className="text-[10px] font-bold uppercase mb-1" style={{ color: "#f97316" }}>
                    Consejo de Negociaci\u00f3n
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{insight.sourcing.consejo_negociacion}</p>
                </div>
              )}
            </div>
          )}

          {/* Risks */}
          {insight.risks && insight.risks.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle size={18} color="var(--warning)" />
                <h3 className="text-sm font-bold">Riesgos</h3>
              </div>
              <div className="space-y-3">
                {insight.risks.map((risk, i) => (
                  <div key={i} className="p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: severityColor(risk.severity) }}
                      />
                      <span className="text-sm font-semibold">{risk.risk}</span>
                      <span className="text-[10px] uppercase font-bold" style={{ color: severityColor(risk.severity) }}>
                        {risk.severity}
                      </span>
                    </div>
                    <p className="text-xs ml-4" style={{ color: "var(--text-secondary)" }}>
                      Mitigaci\u00f3n: {risk.mitigation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Market Insights + Advantages */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {insight.market_insights && insight.market_insights.length > 0 && (
              <div className="card">
                <div className="flex items-center gap-3 mb-4">
                  <TrendingUp size={18} color="var(--info)" />
                  <h3 className="text-sm font-bold">Insights del Mercado</h3>
                </div>
                <ul className="space-y-2">
                  {insight.market_insights.map((m, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <span className="text-[10px] mt-1" style={{ color: "var(--info)" }}>&#9679;</span>
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {insight.competitive_advantages && insight.competitive_advantages.length > 0 && (
              <div className="card">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldCheck size={18} color="var(--success)" />
                  <h3 className="text-sm font-bold">Ventajas Competitivas</h3>
                </div>
                <ul className="space-y-2">
                  {insight.competitive_advantages.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <CheckCircle size={14} className="mt-0.5 flex-shrink-0" color="var(--success)" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Next Steps */}
          {insight.next_steps && insight.next_steps.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <ArrowRight size={18} color="var(--accent)" />
                <h3 className="text-sm font-bold">Pr\u00f3ximos Pasos</h3>
              </div>
              <ol className="space-y-3">
                {insight.next_steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                    <span
                      className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold"
                      style={{ background: "var(--accent-glow)", color: "var(--accent)" }}
                    >
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

      {/* AI Brain Chat - integrated section */}
      {insight && selectedId && (
        <div className="card mt-6" style={{ border: "1px solid rgba(99,102,241,0.2)" }}>
          {/* Chat Header */}
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
                Pregunta lo que quieras sobre {aiResult?.keyword} &middot; ${formatBudget(budget)}
              </p>
            </div>
          </div>

          {/* Chat Messages */}
          <div
            className="rounded-xl overflow-y-auto p-4 space-y-3 mb-4"
            style={{ background: "var(--bg-elevated)", minHeight: "120px", maxHeight: "400px" }}
          >
            {chatMessages.length === 0 && (
              <div className="text-center py-6">
                <Brain size={28} color="var(--text-muted)" className="mx-auto mb-3" />
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
                      onClick={() => { setChatInput(q); }}
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

          {/* Chat Input */}
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
    </div>
  );
}
