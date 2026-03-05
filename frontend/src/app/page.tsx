"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package,
  BarChart3,
  Trophy,
  ArrowUpRight,
  Search,
  Repeat,
  DollarSign,
  TrendingUp,
  Zap,
  Target,
  Layers,
} from "lucide-react";
import { getDashboard } from "@/lib/api";
import type { DashboardSummary, NicheAnalysis } from "@/types";

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

function ScoreRing({ score, size = 60 }: { score: number | null; size?: number }) {
  const v = score ?? 0;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full" style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={scoreColor(score)} strokeWidth="5"
          strokeDasharray={`${(v / 100) * circ} ${circ}`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${scoreColor(score)})` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-black" style={{ color: scoreColor(score) }}>{score ?? "--"}</span>
      </div>
    </div>
  );
}

function OpportunityCard({ a }: { a: NicheAnalysis }) {
  return (
    <Link href={`/analysis/${a.id}`}>
      <div className="card card-hover card-glow cursor-pointer group">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold capitalize text-base" style={{ color: "var(--text-primary)" }}>{a.keyword}</h3>
              {a.parent_keyword && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5" style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7" }}>
                  <Layers size={8} /> Sub
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: a.parent_keyword ? "#a855f7" : "var(--text-muted)" }}>
              {a.parent_keyword ? `Sub-nicho de ${a.parent_keyword}` : `${a.total_products} productos`}
            </p>
          </div>
          <ScoreRing score={a.opportunity_score} />
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "Precio Prom", value: a.avg_price ? `$${a.avg_price.toFixed(2)}` : "--" },
            { label: "Rating", value: a.avg_rating ?? "--" },
            { label: "Marcas", value: a.brand_count ?? "--" },
          ].map((m) => (
            <div key={m.label}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{m.label}</p>
              <p className="text-sm font-bold mt-0.5">{m.value}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {[
            { label: "Demanda", v: a.demand_score },
            { label: "Competencia", v: a.competition_score },
            { label: "Precio", v: a.price_score },
            { label: "Calidad", v: a.quality_gap_score },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="text-xs w-20" style={{ color: "var(--text-muted)" }}>{s.label}</span>
              <div className="flex-1 progress">
                <div className="progress-fill" style={{ width: `${s.v ?? 0}%`, background: scoreColor(s.v) }} />
              </div>
              <span className="text-xs font-semibold w-7 text-right" style={{ color: scoreColor(s.v) }}>{s.v ?? "--"}</span>
            </div>
          ))}
        </div>

        {/* Hover glow effect */}
        <div
          className="absolute inset-0 rounded-[20px] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500"
          style={{ boxShadow: `inset 0 0 40px rgba(249,115,22,0.04), 0 0 30px rgba(249,115,22,0.06)` }}
        />
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="spinner mx-auto mb-4" />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  const isEmpty = !data || data.total_analyses === 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Panel de Control</h1>
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
              style={{ background: "var(--accent-glow)", color: "var(--accent)", border: "1px solid rgba(249,115,22,0.2)" }}
            >
              Consumibles
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Inteligencia de nichos Amazon US — Productos de recompra recurrente
          </p>
        </div>
        <Link href="/search" className="btn btn-primary">
          <Search size={16} />
          Nuevo Análisis
        </Link>
      </div>

      {error && (
        <div className="card mb-6" style={{ borderColor: "var(--danger)" }}>
          <p style={{ color: "var(--danger)" }}>{error}</p>
        </div>
      )}

      {/* Investment Overview */}
      <div
        className="card-premium rounded-2xl p-5 mb-6"
        style={{
          background: "linear-gradient(145deg, rgba(249,115,22,0.06), rgba(12,16,28,0.8))",
          border: "1px solid rgba(249,115,22,0.12)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, rgba(249,115,22,0.2), rgba(249,115,22,0.05))",
                boxShadow: "0 0 20px rgba(249,115,22,0.1)",
              }}
            >
              <DollarSign size={22} color="var(--accent)" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Presupuesto de Inversión
              </p>
              <p className="text-2xl font-black stat-glow" style={{ color: "var(--accent)" }}>$10,000</p>
            </div>
          </div>
          <div className="flex items-center gap-8">
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Análisis Realizados
              </p>
              <p className="text-xl font-bold">{data?.total_analyses ?? 0}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Productos Rastreados
              </p>
              <p className="text-xl font-bold">{data?.total_products_tracked ?? 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: "Total Análisis",
            value: data?.total_analyses ?? 0,
            icon: BarChart3,
            color: "var(--info)",
            gradient: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(99,102,241,0.03))",
          },
          {
            label: "Productos",
            value: data?.total_products_tracked ?? 0,
            icon: Package,
            color: "var(--accent)",
            gradient: "linear-gradient(135deg, rgba(249,115,22,0.15), rgba(249,115,22,0.03))",
          },
          {
            label: "Mejor Score",
            value: data?.top_opportunities?.[0]?.opportunity_score ?? "--",
            icon: Trophy,
            color: "var(--success)",
            gradient: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.03))",
          },
          {
            label: "Mejor Nicho",
            value: data?.top_opportunities?.[0]?.keyword ?? "N/A",
            icon: Target,
            color: "var(--warning)",
            gradient: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.03))",
            isText: true,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="metric-tile"
            style={{ background: stat.gradient }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                {stat.label}
              </p>
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: `${stat.color}15`, boxShadow: `0 0 12px ${stat.color}15` }}
              >
                <stat.icon size={16} color={stat.color} />
              </div>
            </div>
            <p className={`font-black ${stat.isText ? "text-base capitalize truncate" : "text-2xl"}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {isEmpty && !error && (
        <div className="card text-center py-20">
          <div
            className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(249,115,22,0.15), rgba(249,115,22,0.03))",
              boxShadow: "0 0 40px rgba(249,115,22,0.1)",
            }}
          >
            <Repeat size={32} color="var(--accent)" />
          </div>
          <h2 className="text-xl font-bold mb-2">Encuentra Tu Nicho Consumible</h2>
          <p className="text-sm mb-2 max-w-lg mx-auto" style={{ color: "var(--text-secondary)" }}>
            Busca productos que los clientes recompran cada semana — detergentes, suplementos, snacks, cuidado personal.
            La IA analiza costos China, márgenes FBA y ROI para tu presupuesto de $10,000.
          </p>
          <div className="flex items-center justify-center gap-4 mb-8">
            {["Detergente", "Proteína", "Café", "Vitaminas"].map((niche) => (
              <span key={niche} className="niche-pill text-xs">{niche}</span>
            ))}
          </div>
          <Link href="/search" className="btn btn-primary">
            <Search size={16} />
            Analizar Primer Nicho
          </Link>
        </div>
      )}

      {/* Top Opportunities */}
      {data?.top_opportunities && data.top_opportunities.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(249,115,22,0.1)" }}
              >
                <Zap size={16} color="var(--accent)" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Mejores Oportunidades</h2>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Nichos con mayor potencial para productos consumibles
                </p>
              </div>
            </div>
            <Link
              href="/history"
              className="text-xs font-semibold flex items-center gap-1"
              style={{ color: "var(--accent)" }}
            >
              Ver todo <ArrowUpRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {data.top_opportunities.map((a) => (
              <OpportunityCard key={a.id} a={a} />
            ))}
          </div>
        </div>
      )}

      {/* Recent analyses table */}
      {data?.recent_analyses && data.recent_analyses.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(99,102,241,0.1)" }}
            >
              <TrendingUp size={16} color="var(--info)" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Análisis Recientes</h2>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Últimas búsquedas de nichos consumibles
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nicho</th>
                  <th style={{ textAlign: "right" }}>Productos</th>
                  <th style={{ textAlign: "right" }}>Precio Prom</th>
                  <th style={{ textAlign: "right" }}>Rating</th>
                  <th style={{ textAlign: "right" }}>Score</th>
                  <th style={{ textAlign: "right" }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_analyses.map((a) => (
                  <tr key={a.id} className="cursor-pointer" style={a.parent_keyword ? { background: "rgba(168,85,247,0.04)" } : undefined}>
                    <td>
                      <div className="flex items-center gap-2">
                        {a.parent_keyword && <Layers size={12} color="#a855f7" className="flex-shrink-0" />}
                        <div>
                          <Link
                            href={`/analysis/${a.id}`}
                            className="font-semibold capitalize hover:underline"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {a.keyword}
                          </Link>
                          {a.parent_keyword && (
                            <p className="text-[10px]" style={{ color: "#a855f7" }}>Sub-nicho de {a.parent_keyword}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>{a.total_products}</td>
                    <td style={{ textAlign: "right" }}>{a.avg_price ? `$${a.avg_price.toFixed(2)}` : "--"}</td>
                    <td style={{ textAlign: "right" }}>{a.avg_rating ?? "--"}</td>
                    <td style={{ textAlign: "right" }}>
                      <span className="font-bold" style={{ color: scoreColor(a.opportunity_score) }}>
                        {a.opportunity_score ?? "--"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", color: "var(--text-muted)" }}>
                      {a.created_at ? new Date(a.created_at).toLocaleDateString("es") : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
