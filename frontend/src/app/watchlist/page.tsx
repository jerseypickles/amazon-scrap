"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Eye,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Trash2,
  ExternalLink,
  Clock,
  RefreshCw,
  Pause,
  Play,
  Activity,
  BarChart3,
  ArrowUpDown,
  Bell,
  Brain,
  Sparkles,
  DollarSign,
  Users,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Target,
  Package,
} from "lucide-react";
import {
  getWatchlist,
  removeFromWatchlist,
  addToWatchlist,
  getAnalysisHistory,
  getWatchlistStats,
  forceReanalyze,
  togglePauseWatchlist,
  getNotifications,
} from "@/lib/api";
import type { WatchlistItem, WatchlistStats, AnalysisHistoryItem, AppNotification, MetricsHistoryPoint } from "@/types";

type SortKey = "score" | "trend" | "checked" | "name" | "signal";
type NotifFilter = "all" | "alerts" | "opportunities";

function scoreColor(score: number | null) {
  if (score === null) return "var(--text-muted)";
  if (score >= 65) return "#10b981";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function trendIcon(trend: string | null, size = 14) {
  if (trend === "up") return <TrendingUp size={size} color="#10b981" />;
  if (trend === "down") return <TrendingDown size={size} color="#ef4444" />;
  return <Minus size={size} color="var(--text-muted)" />;
}

function trendLabel(trend: string | null) {
  if (trend === "up") return "Subiendo";
  if (trend === "down") return "Bajando";
  if (trend === "new") return "Nuevo";
  return "Estable";
}

function trendColor(trend: string | null) {
  if (trend === "up") return "#10b981";
  if (trend === "down") return "#ef4444";
  return "var(--text-muted)";
}

function signalConfig(signal: string | null): { label: string; color: string; bg: string; icon: React.ReactNode } {
  switch (signal) {
    case "ENTRAR":
      return { label: "ENTRAR", color: "#10b981", bg: "rgba(16,185,129,0.12)", icon: <Target size={10} /> };
    case "CONSIDERAR":
      return { label: "CONSIDERAR", color: "#3b82f6", bg: "rgba(59,130,246,0.12)", icon: <Eye size={10} /> };
    case "ESPERAR":
      return { label: "ESPERAR", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", icon: <Clock size={10} /> };
    case "SATURANDOSE":
      return { label: "SATURANDOSE", color: "#ef4444", bg: "rgba(239,68,68,0.12)", icon: <ShieldAlert size={10} /> };
    case "SALIR":
      return { label: "SALIR", color: "#ef4444", bg: "rgba(239,68,68,0.15)", icon: <AlertTriangle size={10} /> };
    default:
      return { label: "NUEVO", color: "#06b6d4", bg: "rgba(6,182,212,0.12)", icon: <Sparkles size={10} /> };
  }
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "Nunca";
  const d = new Date(dateStr);
  const now = new Date();
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "Justo ahora";
  if (mins < 60) return `Hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}

function MiniSparkline({ history, metric = "score" }: { history: MetricsHistoryPoint[]; metric?: string }) {
  const values = history.map((h) => {
    if (metric === "score") return h.score;
    const val = (h as unknown as Record<string, unknown>)[metric];
    return typeof val === "number" ? val : null;
  }).filter((v): v is number => v !== null);
  if (values.length < 2) return null;
  const min = Math.min(...values) - (Math.max(...values) - Math.min(...values)) * 0.15;
  const max = Math.max(...values) + (Math.max(...values) - Math.min(...values)) * 0.15;
  const range = max - min || 1;
  const w = 100;
  const h = 32;
  const points = values.map((s, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((s - min) / range) * h;
    return `${x},${y}`;
  });
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  const color = last >= prev ? "#10b981" : "#ef4444";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points.join(" ")} />
      <circle cx={w} cy={h - ((last - min) / range) * h} r="2.5" fill={color} />
    </svg>
  );
}

function MetricDelta({ current, previous, suffix = "", inverse = false }: { current?: number | null; previous?: number | null; suffix?: string; inverse?: boolean }) {
  if (current == null || previous == null || previous === 0) return null;
  const diff = current - previous;
  const pct = ((diff) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 1) return null;
  const isGood = inverse ? diff < 0 : diff > 0;
  return (
    <span className="text-[9px] font-bold ml-1" style={{ color: isGood ? "#10b981" : "#ef4444" }}>
      {diff > 0 ? "+" : ""}{suffix === "%" ? `${pct.toFixed(0)}%` : `${diff.toFixed(0)}${suffix}`}
    </span>
  );
}

function notifIcon(type: string) {
  if (type === "score_change") return <Activity size={12} />;
  if (type === "new_opportunity") return <Sparkles size={12} />;
  if (type === "ai_insight") return <Brain size={12} />;
  if (type === "metric_alert") return <AlertTriangle size={12} />;
  return <Bell size={12} />;
}

function notifColor(severity: string) {
  if (severity === "success") return "#10b981";
  if (severity === "warning") return "#f59e0b";
  if (severity === "danger") return "#ef4444";
  return "#06b6d4";
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [stats, setStats] = useState<WatchlistStats | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [analyses, setAnalyses] = useState<AnalysisHistoryItem[]>([]);
  const [reanalyzing, setReanalyzing] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [notifFilter, setNotifFilter] = useState<NotifFilter>("all");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [wl, st, notifs] = await Promise.all([
        getWatchlist(),
        getWatchlistStats(),
        getNotifications(),
      ]);
      setItems(wl.items);
      setStats(st);
      setNotifications(notifs.notifications.slice(0, 20));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(id: number) {
    try {
      await removeFromWatchlist(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      // ignore
    }
  }

  async function handleShowAdd() {
    setShowAdd(true);
    try {
      const data = await getAnalysisHistory();
      setAnalyses(data.analyses);
    } catch {
      // ignore
    }
  }

  async function handleAdd(a: AnalysisHistoryItem) {
    try {
      await addToWatchlist({
        keyword: a.keyword,
        analysis_id: a.id,
        score: a.opportunity_score ?? undefined,
      });
      setShowAdd(false);
      loadAll();
    } catch {
      // ignore
    }
  }

  async function handleReanalyze(id: number) {
    setReanalyzing(id);
    try {
      const updated = await forceReanalyze(id);
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      const [st, notifs] = await Promise.all([getWatchlistStats(), getNotifications()]);
      setStats(st);
      setNotifications(notifs.notifications.slice(0, 20));
    } catch {
      // ignore
    } finally {
      setReanalyzing(null);
    }
  }

  async function handleTogglePause(id: number) {
    try {
      const updated = await togglePauseWatchlist(id);
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
    } catch {
      // ignore
    }
  }

  function sortedItems() {
    return [...items].sort((a, b) => {
      if (sortBy === "score") return (b.last_score ?? 0) - (a.last_score ?? 0);
      if (sortBy === "signal") {
        const order: Record<string, number> = { ENTRAR: 0, CONSIDERAR: 1, SATURANDOSE: 2, ESPERAR: 3, SALIR: 4, NUEVO: 5 };
        return (order[a.action_signal ?? "NUEVO"] ?? 5) - (order[b.action_signal ?? "NUEVO"] ?? 5);
      }
      if (sortBy === "trend") {
        const order: Record<string, number> = { up: 0, down: 1, stable: 2, new: 3 };
        return (order[a.score_trend ?? "new"] ?? 4) - (order[b.score_trend ?? "new"] ?? 4);
      }
      if (sortBy === "checked") {
        const ta = a.last_checked_at ? new Date(a.last_checked_at).getTime() : 0;
        const tb = b.last_checked_at ? new Date(b.last_checked_at).getTime() : 0;
        return tb - ta;
      }
      return a.keyword.localeCompare(b.keyword);
    });
  }

  function filteredNotifs() {
    if (notifFilter === "alerts") return notifications.filter((n) => n.type === "metric_alert" || n.type === "alert");
    if (notifFilter === "opportunities") return notifications.filter((n) => n.type === "new_opportunity" || n.severity === "success");
    return notifications;
  }

  // Get previous metrics from score_history for delta display
  function getPrevMetrics(item: WatchlistItem) {
    if (item.score_history.length < 2) return null;
    return item.score_history[item.score_history.length - 2];
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-96">
        <div className="spinner" />
      </div>
    );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(6,182,212,0.1)" }}>
            <Eye size={20} color="#06b6d4" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Watchlist</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Monitoreo inteligente de nichos con alertas accionables
            </p>
          </div>
        </div>
        <button onClick={handleShowAdd} className="btn btn-primary">
          <Plus size={16} /> Agregar Nicho
        </button>
      </div>

      {/* KPI Stats Bar */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card" style={{ padding: "1rem" }}>
            <div className="flex items-center gap-2 mb-1">
              <Eye size={14} color="#06b6d4" />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                En Seguimiento
              </span>
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
            {stats.paused > 0 && (
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{stats.paused} en pausa</p>
            )}
          </div>
          <div className="card" style={{ padding: "1rem" }}>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 size={14} color="#8b5cf6" />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Score Promedio
              </span>
            </div>
            <p className="text-2xl font-bold" style={{ color: scoreColor(stats.avg_score) }}>
              {stats.avg_score?.toFixed(0) ?? "--"}
            </p>
          </div>
          <div className="card" style={{ padding: "1rem" }}>
            <div className="flex items-center gap-2 mb-1">
              <Activity size={14} color="#10b981" />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Tendencias
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-sm font-bold" style={{ color: "#10b981" }}>
                <TrendingUp size={12} /> {stats.trending_up}
              </span>
              <span className="flex items-center gap-1 text-sm font-bold" style={{ color: "#ef4444" }}>
                <TrendingDown size={12} /> {stats.trending_down}
              </span>
              <span className="flex items-center gap-1 text-sm font-bold" style={{ color: "var(--text-muted)" }}>
                <Minus size={12} /> {stats.stable}
              </span>
            </div>
          </div>
          <div className="card" style={{ padding: "1rem" }}>
            <div className="flex items-center gap-2 mb-1">
              <Clock size={14} color="#f59e0b" />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Proximo Check
              </span>
            </div>
            <p className="text-sm font-bold">
              {stats.next_check_at ? timeAgo(stats.next_check_at).replace("Hace", "En") : "Sin programar"}
            </p>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="card mb-6" style={{ borderColor: "var(--accent)" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold">Agregar desde nichos analizados</h3>
            <button onClick={() => setShowAdd(false)} className="btn btn-secondary" style={{ padding: "0.25rem 0.5rem" }}>
              Cancelar
            </button>
          </div>
          {analyses.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No hay analisis.{" "}
                <Link href="/search" className="underline" style={{ color: "var(--accent)" }}>
                  Analiza un nicho primero
                </Link>
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {analyses
                .filter((a) => !items.some((w) => w.keyword === a.keyword))
                .map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-3 rounded-lg cursor-pointer"
                    style={{ background: "var(--bg-elevated)" }}
                    onClick={() => handleAdd(a)}
                  >
                    <div>
                      <span className="text-sm font-medium capitalize">{a.keyword}</span>
                      <span className="text-xs ml-2" style={{ color: scoreColor(a.opportunity_score) }}>
                        Score: {a.opportunity_score ?? "--"}
                      </span>
                    </div>
                    <Plus size={14} color="var(--accent)" />
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      {items.length === 0 ? (
        <div className="card text-center py-20">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center" style={{ background: "var(--bg-elevated)" }}>
            <Eye size={28} color="var(--text-muted)" />
          </div>
          <h2 className="text-xl font-bold mb-2">Sin nichos en seguimiento</h2>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            Agrega nichos para monitorear metricas, detectar oportunidades y recibir alertas inteligentes
          </p>
          <button onClick={handleShowAdd} className="btn btn-primary">
            <Plus size={16} /> Agregar Tu Primer Nicho
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Watchlist items */}
          <div className="lg:col-span-2">
            {/* Sort controls */}
            <div className="flex items-center gap-2 mb-4">
              <ArrowUpDown size={12} color="var(--text-muted)" />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Ordenar:
              </span>
              {(["signal", "score", "trend", "checked", "name"] as SortKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className="text-[11px] px-2 py-0.5 rounded-md font-medium"
                  style={{
                    background: sortBy === key ? "var(--accent)" : "var(--bg-elevated)",
                    color: sortBy === key ? "#fff" : "var(--text-secondary)",
                  }}
                >
                  {key === "signal" ? "Senal" : key === "score" ? "Score" : key === "trend" ? "Tendencia" : key === "checked" ? "Revisado" : "Nombre"}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {sortedItems().map((item) => {
                const diff = item.last_score !== null && item.previous_score !== null
                  ? item.last_score - item.previous_score
                  : null;
                const isExpanded = expandedId === item.id;
                const signal = signalConfig(item.action_signal);
                const m = item.last_metrics;
                const prev = getPrevMetrics(item);

                return (
                  <div
                    key={item.id}
                    className="card"
                    style={{
                      borderLeft: `3px solid ${signal.color}`,
                      opacity: item.is_paused ? 0.6 : 1,
                    }}
                  >
                    {/* Top: keyword + signal + score */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold capitalize text-[15px]">{item.keyword}</h3>
                          {/* Action signal badge */}
                          <span
                            className="text-[9px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                            style={{ background: signal.bg, color: signal.color }}
                          >
                            {signal.icon} {signal.label}
                          </span>
                          {item.is_paused && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(107,114,128,0.15)", color: "#6b7280" }}>
                              PAUSADO
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-[11px] flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                            <Clock size={10} />
                            {timeAgo(item.last_checked_at)}
                          </span>
                          <span className="text-[11px] flex items-center gap-1" style={{ color: trendColor(item.score_trend) }}>
                            {trendIcon(item.score_trend, 10)}
                            {trendLabel(item.score_trend)}
                          </span>
                          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                            Cada {item.check_interval_hours}h
                          </span>
                        </div>
                      </div>

                      {/* Right: score */}
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-2xl font-bold" style={{ color: scoreColor(item.last_score) }}>
                            {item.last_score?.toFixed(0) ?? "--"}
                          </span>
                          {diff !== null && (
                            <span className="text-[11px] font-bold" style={{ color: diff >= 0 ? "#10b981" : "#ef4444" }}>
                              {diff > 0 ? "+" : ""}{diff.toFixed(0)}
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] uppercase font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>Score</p>
                      </div>
                    </div>

                    {/* Metrics row */}
                    {m && (
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                        <div>
                          <p className="text-[9px] uppercase font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>
                            <DollarSign size={8} className="inline mr-0.5" />Precio
                          </p>
                          <p className="text-sm font-bold">
                            ${m.avg_price?.toFixed(0) ?? "--"}
                            <MetricDelta current={m.avg_price} previous={prev?.avg_price} suffix="%" />
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>Reviews</p>
                          <p className="text-sm font-bold">
                            {m.median_reviews?.toFixed(0) ?? "--"}
                            <MetricDelta current={m.median_reviews} previous={prev?.median_reviews} suffix="%" inverse />
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>
                            <Users size={8} className="inline mr-0.5" />Marcas
                          </p>
                          <p className="text-sm font-bold">
                            {m.brand_count ?? "--"}
                            <MetricDelta current={m.brand_count} previous={prev?.brand_count} suffix="" inverse />
                          </p>
                        </div>
                        <div className="hidden sm:block">
                          <p className="text-[9px] uppercase font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>Margen</p>
                          <p className="text-sm font-bold" style={{ color: (m.estimated_margin ?? 0) >= 30 ? "#10b981" : (m.estimated_margin ?? 0) >= 20 ? "#f59e0b" : "#ef4444" }}>
                            {m.estimated_margin?.toFixed(0) ?? "--"}%
                            <MetricDelta current={m.estimated_margin} previous={prev?.estimated_margin} suffix="pts" />
                          </p>
                        </div>
                        <div className="hidden sm:block">
                          <p className="text-[9px] uppercase font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>
                            <Package size={8} className="inline mr-0.5" />Productos
                          </p>
                          <p className="text-sm font-bold">
                            {m.total_products ?? "--"}
                            <MetricDelta current={m.total_products} previous={prev?.total_products} suffix="%" inverse />
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Alerts chips */}
                    {item.alerts && item.alerts.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {item.alerts.map((alert, i) => (
                          <span
                            key={i}
                            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{
                              background: alert.includes("saturaci") || alert.includes("caída") || alert.includes("guerra") ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
                              color: alert.includes("saturaci") || alert.includes("caída") || alert.includes("guerra") ? "#ef4444" : "#10b981",
                            }}
                          >
                            {alert.length > 60 ? alert.slice(0, 57) + "..." : alert}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Sparkline + actions */}
                    <div className="flex items-end justify-between mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-3">
                        {item.score_history && item.score_history.length >= 2 && (
                          <MiniSparkline history={item.score_history} />
                        )}
                        {/* Expand button */}
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="btn btn-secondary"
                          style={{ padding: "0.25rem 0.4rem" }}
                          title={isExpanded ? "Cerrar detalle" : "Ver detalle"}
                        >
                          {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </button>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleReanalyze(item.id)}
                          className="btn btn-secondary"
                          style={{ padding: "0.3rem 0.5rem" }}
                          title="Re-analizar ahora"
                          disabled={reanalyzing === item.id}
                        >
                          <RefreshCw size={11} className={reanalyzing === item.id ? "animate-spin" : ""} />
                        </button>
                        <button
                          onClick={() => handleTogglePause(item.id)}
                          className="btn btn-secondary"
                          style={{ padding: "0.3rem 0.5rem" }}
                          title={item.is_paused ? "Reanudar" : "Pausar"}
                        >
                          {item.is_paused ? <Play size={11} /> : <Pause size={11} />}
                        </button>
                        {item.last_analysis_id && (
                          <Link
                            href={`/analysis/${item.last_analysis_id}`}
                            className="btn btn-secondary"
                            style={{ padding: "0.3rem 0.5rem" }}
                            title="Ver analisis"
                          >
                            <ExternalLink size={11} />
                          </Link>
                        )}
                        {item.last_analysis_id && (
                          <Link
                            href={`/advisor?ids=${item.last_analysis_id}`}
                            className="btn btn-secondary"
                            style={{ padding: "0.3rem 0.5rem" }}
                            title="Consultar IA"
                          >
                            <Brain size={11} />
                          </Link>
                        )}
                        <button
                          onClick={() => handleRemove(item.id)}
                          className="btn btn-secondary"
                          style={{ padding: "0.3rem 0.5rem" }}
                          title="Eliminar"
                        >
                          <Trash2 size={11} color="var(--danger)" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail panel */}
                    {isExpanded && (
                      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                        {/* Metrics history table */}
                        {item.score_history.length > 0 && (
                          <div>
                            <h4 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
                              Historial de Metricas ({item.score_history.length} checks)
                            </h4>
                            <div className="overflow-x-auto">
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr style={{ color: "var(--text-muted)" }}>
                                    <th className="text-left py-1 pr-2 font-bold">Fecha</th>
                                    <th className="text-right py-1 px-2 font-bold">Score</th>
                                    <th className="text-right py-1 px-2 font-bold">Precio</th>
                                    <th className="text-right py-1 px-2 font-bold">Reviews</th>
                                    <th className="text-right py-1 px-2 font-bold">Marcas</th>
                                    <th className="text-right py-1 px-2 font-bold">Margen</th>
                                    <th className="text-right py-1 px-2 font-bold">Prods</th>
                                    {item.score_history.some((h) => h.keepa_trend) && (
                                      <th className="text-right py-1 pl-2 font-bold">Keepa</th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {[...item.score_history].reverse().slice(0, 10).map((h, i) => (
                                    <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                                      <td className="py-1 pr-2" style={{ color: "var(--text-muted)" }}>
                                        {new Date(h.date).toLocaleDateString("es", { month: "short", day: "numeric" })}
                                      </td>
                                      <td className="text-right py-1 px-2 font-bold" style={{ color: scoreColor(h.score) }}>
                                        {h.score.toFixed(0)}
                                      </td>
                                      <td className="text-right py-1 px-2">${h.avg_price?.toFixed(0) ?? "-"}</td>
                                      <td className="text-right py-1 px-2">{h.median_reviews?.toFixed(0) ?? "-"}</td>
                                      <td className="text-right py-1 px-2">{h.brand_count ?? "-"}</td>
                                      <td className="text-right py-1 px-2">{h.estimated_margin != null ? `${h.estimated_margin.toFixed(0)}%` : "-"}</td>
                                      <td className="text-right py-1 px-2">{h.total_products ?? "-"}</td>
                                      {item.score_history.some((sh) => sh.keepa_trend) && (
                                        <td className="text-right py-1 pl-2">
                                          {h.keepa_trend ? (
                                            <span className="text-[9px] font-bold" style={{
                                              color: h.keepa_trend === "growing" ? "#10b981" : h.keepa_trend === "declining" ? "#ef4444" : "var(--text-muted)"
                                            }}>
                                              {h.keepa_trend === "growing" ? "Crece" : h.keepa_trend === "declining" ? "Cae" : "Estable"}
                                            </span>
                                          ) : "-"}
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Mini sparklines for individual metrics */}
                        {item.score_history.length >= 3 && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                            {[
                              { key: "score", label: "Score" },
                              { key: "avg_price", label: "Precio" },
                              { key: "median_reviews", label: "Reviews" },
                              { key: "estimated_margin", label: "Margen" },
                            ].map(({ key, label }) => (
                              <div key={key} className="p-2 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                                <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
                                <MiniSparkline history={item.score_history} metric={key} />
                              </div>
                            ))}
                          </div>
                        )}

                        {item.notes && (
                          <p className="text-[11px] mt-3 italic" style={{ color: "var(--text-muted)" }}>
                            Notas: {item.notes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right sidebar: Activity feed */}
          <div>
            <div className="card" style={{ position: "sticky", top: "1rem" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bell size={14} color="#f59e0b" />
                  <h3 className="text-sm font-bold">Actividad</h3>
                </div>
              </div>
              {/* Filter tabs */}
              <div className="flex gap-1 mb-3">
                {(["all", "alerts", "opportunities"] as NotifFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setNotifFilter(f)}
                    className="text-[10px] px-2 py-0.5 rounded-md font-medium"
                    style={{
                      background: notifFilter === f ? "var(--accent)" : "var(--bg-elevated)",
                      color: notifFilter === f ? "#fff" : "var(--text-secondary)",
                    }}
                  >
                    {f === "all" ? "Todo" : f === "alerts" ? "Alertas" : "Oportunidades"}
                  </button>
                ))}
              </div>
              {filteredNotifs().length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: "var(--text-muted)" }}>
                  Sin actividad. Las alertas apareceran aqui cuando el monitor detecte cambios en tus nichos.
                </p>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {filteredNotifs().map((n) => (
                    <div key={n.id} className="flex gap-2">
                      <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: `${notifColor(n.severity)}15`, color: notifColor(n.severity) }}
                      >
                        {notifIcon(n.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold leading-tight">{n.title}</p>
                        <p className="text-[10px] mt-0.5 leading-snug" style={{ color: "var(--text-muted)" }}>
                          {n.message.length > 120 ? n.message.slice(0, 117) + "..." : n.message}
                        </p>
                        <p className="text-[9px] mt-1" style={{ color: "var(--text-muted)" }}>
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
