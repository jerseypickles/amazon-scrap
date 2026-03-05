"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Search, ExternalLink, TrendingUp, BarChart3, Layers } from "lucide-react";
import { getAnalysisHistory } from "@/lib/api";
import type { AnalysisHistoryItem } from "@/types";

function scoreColor(s: number | null) {
  if (s === null) return "var(--text-muted)";
  if (s >= 70) return "#10b981";
  if (s >= 55) return "#84cc16";
  if (s >= 40) return "#f59e0b";
  return "#ef4444";
}

function scoreBadge(s: number | null) {
  if (s === null) return "badge-info";
  if (s >= 70) return "badge-success";
  if (s >= 55) return "badge-warning";
  if (s >= 40) return "badge-warning";
  return "badge-danger";
}

function scoreLabel(s: number | null) {
  if (s === null) return "N/A";
  if (s >= 70) return "Excelente";
  if (s >= 55) return "Bueno";
  if (s >= 40) return "Moderado";
  return "Difícil";
}

export default function HistoryPage() {
  const [analyses, setAnalyses] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAnalysisHistory().then((d) => setAnalyses(d.analyses)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-96"><div className="spinner" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">Historial de Análisis</h1>
          </div>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {analyses.length} análisis realizados de nichos consumibles
          </p>
        </div>
        <Link href="/search" className="btn btn-primary">
          <Search size={16} /> Nuevo Análisis
        </Link>
      </div>

      {/* Summary stats */}
      {analyses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="metric-tile">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(99,102,241,0.1)" }}>
                <BarChart3 size={16} color="var(--info)" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Total Análisis</p>
                <p className="text-xl font-bold">{analyses.length}</p>
              </div>
            </div>
          </div>
          <div className="metric-tile">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(16,185,129,0.1)" }}>
                <TrendingUp size={16} color="var(--success)" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Mejor Score</p>
                <p className="text-xl font-bold" style={{ color: "var(--success)" }}>
                  {analyses.length > 0 ? Math.max(...analyses.map((a) => a.opportunity_score ?? 0)) : "--"}
                </p>
              </div>
            </div>
          </div>
          <div className="metric-tile">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(249,115,22,0.1)" }}>
                <Clock size={16} color="var(--accent)" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Último Análisis</p>
                <p className="text-sm font-bold">
                  {analyses.length > 0 ? new Date(analyses[0].created_at).toLocaleDateString("es") : "--"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {analyses.length === 0 ? (
        <div className="card text-center py-20">
          <div
            className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(99,102,241,0.03))",
              boxShadow: "0 0 30px rgba(99,102,241,0.08)",
            }}
          >
            <Clock size={32} color="var(--info)" />
          </div>
          <h2 className="text-xl font-bold mb-2">Sin análisis aún</h2>
          <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: "var(--text-secondary)" }}>
            Tus resultados de análisis de nichos consumibles aparecerán aquí
          </p>
          <Link href="/search" className="btn btn-primary">
            <Search size={16} /> Empezar a Analizar
          </Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nicho</th>
                <th style={{ textAlign: "center" }}>Tipo</th>
                <th style={{ textAlign: "right" }}>Productos</th>
                <th style={{ textAlign: "right" }}>Precio Prom</th>
                <th style={{ textAlign: "center" }}>Score</th>
                <th style={{ textAlign: "center" }}>Nivel</th>
                <th style={{ textAlign: "right" }}>Fecha</th>
                <th style={{ textAlign: "right" }}></th>
              </tr>
            </thead>
            <tbody>
              {analyses.map((a) => {
                const isSubNiche = !!a.parent_keyword;
                return (
                  <tr key={a.id} style={isSubNiche ? { background: "rgba(168,85,247,0.04)" } : undefined}>
                    <td>
                      <div className="flex items-center gap-2">
                        {isSubNiche && (
                          <Layers size={12} color="#a855f7" className="flex-shrink-0" />
                        )}
                        <div>
                          <Link href={`/analysis/${a.id}`} className="font-semibold capitalize hover:underline" style={{ color: "var(--text-primary)" }}>
                            {a.keyword}
                          </Link>
                          {isSubNiche && (
                            <p className="text-[10px]" style={{ color: "#a855f7" }}>
                              Sub-nicho de {a.parent_keyword}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={isSubNiche
                          ? { background: "rgba(168,85,247,0.1)", color: "#a855f7" }
                          : { background: "rgba(249,115,22,0.1)", color: "#f97316" }
                        }
                      >
                        {isSubNiche ? "Sub-Nicho" : "Global"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>{a.total_products}</td>
                    <td style={{ textAlign: "right" }}>{a.avg_price ? `$${a.avg_price.toFixed(2)}` : "--"}</td>
                    <td style={{ textAlign: "center" }}>
                      <span className="font-bold text-sm" style={{ color: scoreColor(a.opportunity_score) }}>
                        {a.opportunity_score ?? "--"}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`badge ${scoreBadge(a.opportunity_score)}`}>
                        {scoreLabel(a.opportunity_score)}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                      {new Date(a.created_at).toLocaleDateString("es")}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/analysis/${a.id}`} className="btn btn-secondary" style={{ padding: "0.375rem 0.75rem", fontSize: "0.75rem" }}>
                        <ExternalLink size={12} /> Ver
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
