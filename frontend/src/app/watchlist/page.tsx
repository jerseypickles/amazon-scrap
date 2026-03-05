"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Eye,
  EyeOff,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Trash2,
  ExternalLink,
  Clock,
  Search,
} from "lucide-react";
import {
  getWatchlist,
  removeFromWatchlist,
  addToWatchlist,
  getAnalysisHistory,
} from "@/lib/api";
import type { WatchlistItem, AnalysisHistoryItem } from "@/types";

function trendIcon(trend: string | null) {
  if (trend === "up") return <TrendingUp size={14} color="#10b981" />;
  if (trend === "down") return <TrendingDown size={14} color="#ef4444" />;
  return <Minus size={14} color="var(--text-muted)" />;
}

function trendColor(trend: string | null) {
  if (trend === "up") return "#10b981";
  if (trend === "down") return "#ef4444";
  return "var(--text-muted)";
}

function scoreDiff(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  return current - previous;
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [analyses, setAnalyses] = useState<AnalysisHistoryItem[]>([]);

  useEffect(() => {
    loadWatchlist();
  }, []);

  async function loadWatchlist() {
    setLoading(true);
    try {
      const data = await getWatchlist();
      setItems(data.items);
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
      loadWatchlist();
    } catch {
      // ignore
    }
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
      <div className="flex items-center justify-between mb-8">
        <div>
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
                Monitor niches and get notified of changes
              </p>
            </div>
          </div>
        </div>
        <button onClick={handleShowAdd} className="btn btn-primary">
          <Plus size={16} /> Add Niche
        </button>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="card mb-6" style={{ borderColor: "var(--accent)" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold">Add from analyzed niches</h3>
            <button onClick={() => setShowAdd(false)} className="btn btn-secondary" style={{ padding: "0.25rem 0.5rem" }}>
              Cancel
            </button>
          </div>
          {analyses.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No analyses found.{" "}
                <Link href="/search" className="underline" style={{ color: "var(--accent)" }}>
                  Analyze a niche first
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
                      <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
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

      {/* Watchlist Items */}
      {items.length === 0 ? (
        <div className="card text-center py-20">
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
            style={{ background: "var(--bg-elevated)" }}
          >
            <Eye size={28} color="var(--text-muted)" />
          </div>
          <h2 className="text-xl font-bold mb-2">No niches watched</h2>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            Add niches to your watchlist to monitor score changes and get alerts
          </p>
          <button onClick={handleShowAdd} className="btn btn-primary">
            <Plus size={16} /> Add Your First Niche
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const diff = scoreDiff(item.last_score, item.previous_score);
            return (
              <div key={item.id} className="card card-hover">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Trend icon */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: `${trendColor(item.score_trend)}15` }}
                    >
                      {trendIcon(item.score_trend)}
                    </div>

                    {/* Info */}
                    <div>
                      <h3 className="font-semibold capitalize">{item.keyword}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          <Clock size={10} className="inline mr-1" />
                          {item.last_checked_at
                            ? `Checked ${new Date(item.last_checked_at).toLocaleString()}`
                            : "Not checked yet"}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          Every {item.check_interval_hours}h
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Score */}
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-2xl font-bold"
                          style={{
                            color:
                              (item.last_score ?? 0) >= 65
                                ? "#10b981"
                                : (item.last_score ?? 0) >= 40
                                ? "#f59e0b"
                                : "#ef4444",
                          }}
                        >
                          {item.last_score?.toFixed(0) ?? "--"}
                        </span>
                        {diff !== null && (
                          <span
                            className="text-xs font-bold"
                            style={{ color: diff >= 0 ? "#10b981" : "#ef4444" }}
                          >
                            {diff > 0 ? "+" : ""}
                            {diff.toFixed(0)}
                          </span>
                        )}
                      </div>
                      {item.previous_score !== null && (
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          was {item.previous_score?.toFixed(0)}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {item.last_analysis_id && (
                        <Link
                          href={`/analysis/${item.last_analysis_id}`}
                          className="btn btn-secondary"
                          style={{ padding: "0.375rem 0.75rem" }}
                        >
                          <ExternalLink size={12} />
                        </Link>
                      )}
                      <button
                        onClick={() => handleRemove(item.id)}
                        className="btn btn-secondary"
                        style={{ padding: "0.375rem 0.75rem" }}
                      >
                        <Trash2 size={12} color="var(--danger)" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {item.notes && (
                  <p className="text-xs mt-3 pl-14" style={{ color: "var(--text-muted)" }}>
                    {item.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
