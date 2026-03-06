"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FolderTree,
  ChevronRight,
  Repeat,
  Package,
  Search,
  TrendingUp,
  Shield,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  BarChart3,
} from "lucide-react";
import { getCategories } from "@/lib/api";
import type { Category } from "@/types";

const CATEGORY_COLORS: Record<string, string> = {
  household: "#10b981",
  beauty: "#ec4899",
  oralcare: "#06b6d4",
  vitamins: "#8b5cf6",
  grocery: "#84cc16",
  baby: "#f59e0b",
  pets: "#f97316",
  autocare: "#ef4444",
  wellness: "#6366f1",
  haircare: "#14b8a6",
  mensgrooming: "#3b82f6",
  feminine: "#f472b6",
  health: "#22c55e",
  kitchen: "#a855f7",
  office: "#64748b",
};

const CATEGORY_LABELS: Record<string, string> = {
  household: "Hogar",
  beauty: "Belleza",
  oralcare: "Oral",
  vitamins: "Vitaminas",
  grocery: "Alimentos",
  baby: "Beb\u00e9",
  pets: "Mascotas",
  autocare: "Auto",
  wellness: "Bienestar",
  haircare: "Cabello",
  mensgrooming: "Hombre",
  feminine: "Femenino",
  health: "Salud",
  kitchen: "Cocina",
  office: "Oficina",
};

const VOLUME_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: "Alta", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
  medium: { label: "Media", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  low: { label: "Baja", color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
};

const COMPETITION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: "Alta", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  medium: { label: "Media", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  low: { label: "Baja", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    getCategories()
      .then((d) => setCategories(d.categories))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleCategory(id: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-96">
        <div className="spinner" />
      </div>
    );

  const totalSubs = categories.reduce((sum, c) => sum + (c.subcategories?.length ?? 0), 0);
  const avgRepurchase =
    categories.length > 0
      ? Math.round(categories.reduce((s, c) => s + (c.repurchase_weeks ?? 0), 0) / categories.length)
      : 0;

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold">Categor\u00edas Consumibles</h1>
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
            style={{
              background: "var(--accent-glow)",
              color: "var(--accent)",
              border: "1px solid rgba(249,115,22,0.2)",
            }}
          >
            {categories.length} categor\u00edas
          </span>
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Productos de recompra recurrente en Amazon US — con nivel de demanda, competencia y tips para marca privada
        </p>
      </div>

      {/* Overview metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="metric-tile">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(249,115,22,0.1)" }}
            >
              <FolderTree size={16} color="var(--accent)" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Categor\u00edas
              </p>
              <p className="text-xl font-bold">{categories.length}</p>
            </div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(16,185,129,0.1)" }}
            >
              <Package size={16} color="var(--success)" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Subcategor\u00edas
              </p>
              <p className="text-xl font-bold">{totalSubs}</p>
            </div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(99,102,241,0.1)" }}
            >
              <Repeat size={16} color="var(--info)" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Recompra Promedio
              </p>
              <p className="text-xl font-bold">{avgRepurchase} sem</p>
            </div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(139,92,246,0.1)" }}
            >
              <BarChart3 size={16} color="#8b5cf6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Baja Competencia
              </p>
              <p className="text-xl font-bold">
                {categories.reduce(
                  (sum, c) => sum + (c.subcategories?.filter((s) => s.competition === "low").length ?? 0),
                  0
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {categories.map((cat) => {
          const color = CATEGORY_COLORS[cat.id] || "var(--accent)";
          const label = CATEGORY_LABELS[cat.id] || cat.name;
          const isExpanded = expandedCategories.has(cat.id);
          const subs = cat.subcategories ?? [];
          const lowCompSubs = subs.filter((s) => s.competition === "low").length;

          return (
            <div key={cat.id} className="card card-hover card-glow group" style={{ overflow: "hidden" }}>
              {/* Category header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${color}20, ${color}08)`,
                      boxShadow: `0 0 15px ${color}10`,
                    }}
                  >
                    <FolderTree size={18} color={color} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold" style={{ color }}>
                      {cat.name}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {subs.length} subcategor\u00edas
                      </span>
                      {lowCompSubs > 0 && (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}
                        >
                          {lowCompSubs} accesible{lowCompSubs > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {cat.repurchase_weeks && (
                  <div
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                    style={{
                      background: `${color}10`,
                      border: `1px solid ${color}20`,
                    }}
                  >
                    <Repeat size={10} color={color} />
                    <span className="text-[10px] font-bold" style={{ color }}>
                      {cat.repurchase_weeks} sem
                    </span>
                  </div>
                )}
              </div>

              {/* Category tip */}
              {cat.tip && (
                <div
                  className="flex items-start gap-2 px-3 py-2.5 rounded-lg mb-3"
                  style={{
                    background: `${color}06`,
                    border: `1px solid ${color}10`,
                  }}
                >
                  <Lightbulb size={12} color={color} className="mt-0.5 flex-shrink-0" />
                  <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {cat.tip}
                  </p>
                </div>
              )}

              <div className="section-divider" style={{ margin: "0 0 0.5rem 0" }} />

              {/* Subcategories */}
              <div className="space-y-0.5">
                {subs.map((sub) => (
                  <div key={sub.id} className="rounded-xl transition-all duration-200">
                    <Link
                      href={`/search?q=${encodeURIComponent(sub.search_terms?.[0] ?? sub.name)}`}
                      className="flex items-center justify-between p-2.5 rounded-xl transition-all duration-200"
                      style={{ background: "transparent" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = `${color}08`;
                        e.currentTarget.style.transform = "translateX(4px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.transform = "translateX(0)";
                      }}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Search size={11} style={{ color: "var(--text-muted)" }} className="flex-shrink-0" />
                        <span className="text-xs font-medium truncate" style={{ color: "var(--text-secondary)" }}>
                          {sub.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        {sub.volume && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                            style={{
                              background: VOLUME_CONFIG[sub.volume].bg,
                              color: VOLUME_CONFIG[sub.volume].color,
                            }}
                            title={`Demanda: ${VOLUME_CONFIG[sub.volume].label}`}
                          >
                            <TrendingUp size={8} />
                            {VOLUME_CONFIG[sub.volume].label}
                          </span>
                        )}
                        {sub.competition && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                            style={{
                              background: COMPETITION_CONFIG[sub.competition].bg,
                              color: COMPETITION_CONFIG[sub.competition].color,
                            }}
                            title={`Competencia: ${COMPETITION_CONFIG[sub.competition].label}`}
                          >
                            <Shield size={8} />
                            {COMPETITION_CONFIG[sub.competition].label}
                          </span>
                        )}
                        {sub.repurchase_weeks && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded-full"
                            style={{ color: "var(--text-muted)", background: "rgba(255,255,255,0.03)" }}
                          >
                            {sub.repurchase_weeks}s
                          </span>
                        )}
                        <ChevronRight size={12} style={{ color: "var(--text-muted)", opacity: 0.4 }} />
                      </div>
                    </Link>
                  </div>
                ))}
              </div>

              {/* Expand/collapse for tip details */}
              {subs.some((s) => s.tip) && (
                <>
                  <button
                    onClick={() => toggleCategory(cat.id)}
                    className="w-full flex items-center justify-center gap-1.5 mt-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                    style={{
                      color: color,
                      background: `${color}06`,
                      border: `1px solid ${color}10`,
                    }}
                  >
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {isExpanded ? "Ocultar tips" : "Ver tips por subcategor\u00eda"}
                  </button>

                  {isExpanded && (
                    <div className="mt-3 space-y-2">
                      {subs
                        .filter((s) => s.tip)
                        .map((sub) => (
                          <div
                            key={sub.id}
                            className="px-3 py-2.5 rounded-lg"
                            style={{
                              background: "rgba(255,255,255,0.02)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-bold" style={{ color }}>
                                {sub.name}
                              </span>
                              {sub.search_terms && sub.search_terms.length > 0 && (
                                <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                                  {sub.search_terms.length} keywords
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                              {sub.tip}
                            </p>
                            {sub.search_terms && sub.search_terms.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {sub.search_terms.map((term) => (
                                  <Link
                                    key={term}
                                    href={`/search?q=${encodeURIComponent(term)}`}
                                    className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
                                    style={{
                                      background: "rgba(255,255,255,0.04)",
                                      color: "var(--text-muted)",
                                      border: "1px solid var(--border)",
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.color = color;
                                      e.currentTarget.style.borderColor = `${color}40`;
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.color = "var(--text-muted)";
                                      e.currentTarget.style.borderColor = "var(--border)";
                                    }}
                                  >
                                    {term}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
