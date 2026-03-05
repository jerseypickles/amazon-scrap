"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderTree, ChevronRight, Repeat, Package, Search } from "lucide-react";
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
};

const CATEGORY_ICONS: Record<string, string> = {
  household: "Hogar",
  beauty: "Belleza",
  oralcare: "Oral",
  vitamins: "Vitaminas",
  grocery: "Alimentos",
  baby: "Bebé",
  pets: "Mascotas",
  autocare: "Auto",
  wellness: "Bienestar",
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCategories().then((d) => setCategories(d.categories)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-96"><div className="spinner" /></div>;

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold">Categorías Consumibles</h1>
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
            style={{ background: "var(--accent-glow)", color: "var(--accent)", border: "1px solid rgba(249,115,22,0.2)" }}
          >
            {categories.length} categorías
          </span>
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Productos de recompra recurrente en Amazon US — seleccionados por frecuencia de compra y potencial de marca privada
        </p>
      </div>

      {/* Overview metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="metric-tile">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(249,115,22,0.1)" }}>
              <FolderTree size={16} color="var(--accent)" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Categorías</p>
              <p className="text-xl font-bold">{categories.length}</p>
            </div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(16,185,129,0.1)" }}>
              <Package size={16} color="var(--success)" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Subcategorías</p>
              <p className="text-xl font-bold">{categories.reduce((sum, c) => sum + (c.subcategories?.length ?? 0), 0)}</p>
            </div>
          </div>
        </div>
        <div className="metric-tile">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(99,102,241,0.1)" }}>
              <Repeat size={16} color="var(--info)" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Recompra Promedio</p>
              <p className="text-xl font-bold">
                {categories.length > 0
                  ? `${Math.round(categories.reduce((s, c) => s + (c.repurchase_weeks ?? 0), 0) / categories.length)} sem`
                  : "--"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {categories.map((cat) => {
          const color = CATEGORY_COLORS[cat.id] || "var(--accent)";
          return (
            <div
              key={cat.id}
              className="card card-hover card-glow group"
              style={{ overflow: "hidden" }}
            >
              {/* Category header */}
              <div className="flex items-center justify-between mb-4">
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
                    <h2 className="text-sm font-bold" style={{ color }}>{cat.name}</h2>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {cat.subcategories?.length ?? 0} subcategorías
                    </p>
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

              <div className="section-divider" style={{ margin: "0 0 0.75rem 0" }} />

              {/* Subcategories */}
              <div className="space-y-0.5">
                {cat.subcategories?.map((sub) => (
                  <Link
                    key={sub.id}
                    href={`/search?q=${encodeURIComponent(sub.name)}`}
                    className="flex items-center justify-between p-2.5 rounded-xl group/item transition-all duration-200"
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
                    <div className="flex items-center gap-2">
                      <Search size={11} style={{ color: "var(--text-muted)" }} />
                      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                        {sub.name}
                      </span>
                    </div>
                    <ChevronRight size={14} style={{ color: "var(--text-muted)", opacity: 0.4 }} />
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
