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
import type { WatchlistItem, WatchlistStats, AnalysisHistoryItem, AppNotification } from "@/types";

type SortKey = "score" | "trend" | "checked" | "name";

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

function MiniSparkline({ history }: { history: { score: number; date: string }[] }) {
  if (history.length < 2) return null;
  const scores = history.map((h) => h.score);
  const min = Math.min(...scores) - 5;
  const max = Math.max(...scores) + 5;
  const range = max - min || 1;
  const w = 80;
  const h = 28;
  const points = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * w;
    const y = h - ((s - min) / range) * h;
    return `${x},${y}`;
  });
  const last = scores[scores.length - 1];
  const prev = scores[scores.length - 2];
  const color = last >= prev ? "#10b981" : "#ef4444";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
      <circle cx={(scores.length - 1) / (scores.length - 1) * w} cy={h - ((last - min) / range) * h} r="2.5" fill={color} />
    </svg>
  );
}

function notifIcon(type: string) {
  if (type === "score_change") return <Activity size={12} />;
  if (type === "new_opportunity") return <Sparkles size={12} />;
  if (type === "ai_insight") return <Brain size={12} />;
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
      setNotifications(notifs.notifications.slice(0, 10));
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
      const st = await getWatchlistStats();
      setStats(st);
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
      if (sortBy === "trend") {
        const order = { up: 0, down: 1, stable: 2, new: 3 };
        return (order[a.score_trend as keyof typeof order] ?? 4) - (order[b.score_trend as keyof typeof order] ?? 4);
      }
      if (sortBy === "checked") {
        const ta = a.last_checked_at ? new Date(a.last_checked_at).getTime() : 0;
        const tb = b.last_checked_at ? new Date(b.last_checked_at).getTime() : 0;
        return tb - ta;
      }
      return a.keyword.localeCompare(b.keyword);
    });
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
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(6,182,212,0.1)" }}
          >
            <Eye size={20} color="#06b6d4" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Watchlist</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Monitoreo continuo de nichos con alertas de cambios
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

      {/* Main Content: items + activity sidebar */}
      {items.length === 0 ? (
        <div className="card text-center py-20">
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
            style={{ background: "var(--bg-elevated)" }}
          >
            <Eye size={28} color="var(--text-muted)" />
          </div>
          <h2 className="text-xl font-bold mb-2">Sin nichos en seguimiento</h2>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            Agrega nichos para monitorear cambios de score y recibir alertas
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
              {(["score", "trend", "checked", "name"] as SortKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className="text-[11px] px-2 py-0.5 rounded-md font-medium"
                  style={{
                    background: sortBy === key ? "var(--accent)" : "var(--bg-elevated)",
                    color: sortBy === key ? "#fff" : "var(--text-secondary)",
                  }}
                >
                  {key === "score" ? "Score" : key === "trend" ? "Tendencia" : key === "checked" ? "Revisado" : "Nombre"}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {sortedItems().map((item) => {
                const diff = item.last_score !== null && item.previous_score !== null
                  ? item.last_score - item.previous_score
                  : null;
                const isOpportunity = (item.last_score ?? 0) >= 65;
                const isDeclining = item.score_trend === "down";
                const isNew = item.score_trend === "new" || !item.last_checked_at;

                return (
                  <div
                    key={item.id}
                    className="card card-hover"
                    style={{
                      borderLeft: `3px solid ${isOpportunity ? "#10b981" : isDeclining ? "#ef4444" : isNew ? "#06b6d4" : "var(--border)"}`,
                      opacity: item.is_paused ? 0.6 : 1,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* Trend icon */}
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: `${trendColor(item.score_trend)}12` }}
                        >
                          {trendIcon(item.score_trend, 16)}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold capitalize">{item.keyword}</h3>
                            {item.is_paused && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(107,114,128,0.15)", color: "#6b7280" }}>
                                PAUSADO
                              </span>
                            )}
                            {isNew && !item.is_paused && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(6,182,212,0.1)", color: "#06b6d4" }}>
                                NUEVO
                              </span>
                            )}
                            {isOpportunity && !isNew && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                                OPORTUNIDAD
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="text-[11px] flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                              <Clock size={10} />
                              {timeAgo(item.last_checked_at)}
                            </span>
                            <span className="text-[11px]" style={{ color: trendColor(item.score_trend) }}>
                              {trendLabel(item.score_trend)}
                            </span>
                            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                              Cada {item.check_interval_hours}h
                            </span>
                          </div>

                          {/* Sparkline */}
                          {item.score_history && item.score_history.length >= 2 && (
                            <div className="mt-2">
                              <MiniSparkline history={item.score_history} />
                            </div>
                          )}

                          {item.notes && (
                            <p className="text-[11px] mt-2 italic" style={{ color: "var(--text-muted)" }}>
                              {item.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: score + actions */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {/* Score */}
                        <div className="text-right">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="text-2xl font-bold"
                              style={{ color: scoreColor(item.last_score) }}
                            >
                              {item.last_score?.toFixed(0) ?? "--"}
                            </span>
                            {diff !== null && (
                              <span
                                className="text-[11px] font-bold"
                                style={{ color: diff >= 0 ? "#10b981" : "#ef4444" }}
                              >
                                {diff > 0 ? "+" : ""}{diff.toFixed(0)}
                              </span>
                            )}
                          </div>
                          {item.previous_score !== null && (
                            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                              antes {item.previous_score?.toFixed(0)}
                            </p>
                          )}
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
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right sidebar: Activity feed */}
          <div>
            <div className="card" style={{ position: "sticky", top: "1rem" }}>
              <div className="flex items-center gap-2 mb-4">
                <Bell size={14} color="#f59e0b" />
                <h3 className="text-sm font-bold">Actividad Reciente</h3>
              </div>
              {notifications.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: "var(--text-muted)" }}>
                  Sin actividad aun. Las notificaciones apareceran aqui cuando el monitor detecte cambios.
                </p>
              ) : (
                <div className="space-y-3">
                  {notifications.map((n) => (
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
                          {n.message.length > 100 ? n.message.slice(0, 100) + "..." : n.message}
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
