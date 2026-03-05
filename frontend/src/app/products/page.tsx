"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package, RefreshCw, Trash2, Pause, Play, ExternalLink,
  TrendingUp, TrendingDown, DollarSign, BarChart3, Award,
  BadgeCheck, Star, Flame, Loader2, Search, Plus, Minus,
  AlertTriangle, Hash, ShieldCheck, Truck, Tag, Info,
  Box, Weight, Factory, Calendar, User, MessageSquare,
  CheckCircle2, Image as ImageIcon, Layers, Users,
  ShoppingCart, MapPin, HelpCircle, Store,
} from "lucide-react";
import {
  getTrackedProducts, getTrackedProductStats, refreshTrackedProduct,
  togglePauseTracked, removeTrackedProduct, trackProduct,
} from "@/lib/api";
import type { TrackedProduct, TrackedProductStats, ProductSnapshot } from "@/types";

/* ── Helpers ───────────────────────────────────────────── */

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "Nunca";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `Hace ${days}d`;
}

function priceDelta(snapshots: ProductSnapshot[]): { pct: number; direction: string } | null {
  if (snapshots.length < 2) return null;
  const recent = snapshots[snapshots.length - 1];
  const prev = snapshots[snapshots.length - 2];
  if (!recent.price || !prev.price || prev.price === 0) return null;
  const pct = ((recent.price - prev.price) / prev.price) * 100;
  if (Math.abs(pct) < 0.5) return null;
  return { pct, direction: pct > 0 ? "up" : "down" };
}

function bsrDelta(snapshots: ProductSnapshot[]): { pct: number; direction: string } | null {
  if (snapshots.length < 2) return null;
  const recent = snapshots[snapshots.length - 1];
  const prev = snapshots[snapshots.length - 2];
  if (!recent.bsr || !prev.bsr || prev.bsr === 0) return null;
  const pct = ((prev.bsr - recent.bsr) / prev.bsr) * 100; // positive = improved
  if (Math.abs(pct) < 1) return null;
  return { pct, direction: pct > 0 ? "up" : "down" };
}

function reviewsGrowth(snapshots: ProductSnapshot[]): number | null {
  if (snapshots.length < 2) return null;
  const recent = snapshots[snapshots.length - 1];
  const first = snapshots[0];
  if (!recent.reviews_count || !first.reviews_count) return null;
  return recent.reviews_count - first.reviews_count;
}

/* ── Mini Chart ────────────────────────────────────────── */

function MiniChart({ data, field, color, height = 32 }: { data: ProductSnapshot[]; field: "price" | "bsr" | "reviews_count" | "rating"; color: string; height?: number }) {
  const values = data
    .map((s) => s[field])
    .filter((v): v is number => v != null);
  if (values.length < 2) return <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Sin datos</span>;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 120;
  const step = w / (values.length - 1);

  const points = values.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`).join(" ");

  return (
    <svg width={w} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 3px ${color}40)` }}
      />
      {values.length > 0 && (
        <circle
          cx={(values.length - 1) * step}
          cy={height - ((values[values.length - 1] - min) / range) * (height - 4) - 2}
          r="2.5"
          fill={color}
        />
      )}
    </svg>
  );
}

/* ── Detail Panel ──────────────────────────────────────── */

function RatingBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] w-10 text-right" style={{ color: "var(--text-muted)" }}>{label}</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] w-8" style={{ color: "var(--text-secondary)" }}>{pct}%</span>
    </div>
  );
}

function DetailPanel({ product, onClose }: { product: TrackedProduct; onClose: () => void }) {
  const s = product.snapshots;
  const bullets = product.feature_bullets || (product.features?.split(" | ") || []);
  const rb = product.rating_breakdown;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={onClose}
    >
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} />
      <div
        className="relative w-full max-w-2xl overflow-y-auto"
        style={{ background: "var(--bg-card)", borderLeft: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start gap-3 mb-6">
            {product.image_url ? (
              <img src={product.image_url} alt="" className="w-20 h-20 rounded-xl object-contain" style={{ background: "rgba(255,255,255,0.06)" }} />
            ) : (
              <div className="w-20 h-20 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)" }}>
                <Package size={28} style={{ color: "var(--text-muted)" }} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-snug">{product.title}</p>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                ASIN: {product.asin} {product.brand && `| ${product.brand}`}
                {product.manufacturer && product.manufacturer !== product.brand && ` | Fab: ${product.manufacturer}`}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {product.current_is_best_seller && (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(249,115,22,0.12)", color: "#f97316" }}>BEST SELLER</span>
                )}
                {product.current_is_amazon_choice && (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}>CHOICE</span>
                )}
                {product.has_coupon && (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}>COUPON</span>
                )}
                {product.has_aplus && (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(168,85,247,0.12)", color: "#a855f7" }}>A+ CONTENT</span>
                )}
                {product.availability && (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{
                    background: product.availability.toLowerCase().includes("in stock") ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                    color: product.availability.toLowerCase().includes("in stock") ? "#10b981" : "#ef4444",
                  }}>{product.availability}</span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-xs p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }}>X</button>
          </div>

          {/* Current Stats */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="card text-center">
              <DollarSign size={14} color="#10b981" className="mx-auto mb-1" />
              <p className="text-lg font-black" style={{ color: "#10b981" }}>${product.current_price?.toFixed(2) || "--"}</p>
              {product.list_price && product.current_price && product.list_price > product.current_price && (
                <p className="text-[10px]" style={{ color: "#ef4444" }}>
                  <span style={{ textDecoration: "line-through" }}>${product.list_price.toFixed(2)}</span>
                  {" "}-{Math.round(((product.list_price - product.current_price) / product.list_price) * 100)}%
                </p>
              )}
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Precio actual</p>
            </div>
            <div className="card text-center">
              <Hash size={14} color="#6366f1" className="mx-auto mb-1" />
              <p className="text-lg font-black" style={{ color: "#6366f1" }}>#{product.current_bsr?.toLocaleString() || "--"}</p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>BSR {product.current_bsr_category || ""}</p>
            </div>
            <div className="card text-center">
              <Star size={14} color="#f59e0b" className="mx-auto mb-1" />
              <p className="text-lg font-black" style={{ color: "#f59e0b" }}>{product.current_rating?.toFixed(1) || "--"}</p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Rating {product.total_ratings ? `(${product.total_ratings.toLocaleString()} votos)` : ""}
              </p>
            </div>
            <div className="card text-center">
              <BarChart3 size={14} color="#ec4899" className="mx-auto mb-1" />
              <p className="text-lg font-black" style={{ color: "#ec4899" }}>{product.current_reviews?.toLocaleString() || "--"}</p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Reviews{product.total_answered_questions ? ` | ${product.total_answered_questions} Q&A` : ""}
              </p>
            </div>
          </div>

          {/* Seller Competition (Offers) */}
          {product.offers && product.offers.length > 0 && (
            <div className="card mb-4">
              <p className="text-xs font-bold mb-3 flex items-center gap-1.5">
                <Users size={12} color="#f97316" /> Competencia de Sellers ({product.total_offers || product.offers.length} ofertas)
              </p>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <p className="text-sm font-black" style={{ color: "#10b981" }}>${product.lowest_offer_price?.toFixed(2) || "--"}</p>
                  <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>Precio mas bajo</p>
                </div>
                <div className="text-center p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <p className="text-sm font-black" style={{ color: "#6366f1" }}>{product.fba_seller_count ?? 0}</p>
                  <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>Sellers FBA</p>
                </div>
                <div className="text-center p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <p className="text-sm font-black truncate" style={{ color: "#f97316" }}>{product.buy_box_seller || "--"}</p>
                  <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>Buy Box</p>
                </div>
              </div>
              {/* Offers table */}
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr style={{ color: "var(--text-muted)" }}>
                      <th className="text-left py-1">Seller</th>
                      <th className="text-right py-1">Precio</th>
                      <th className="text-center py-1">Prime</th>
                      <th className="text-center py-1">FBA</th>
                      <th className="text-center py-1">Condicion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.offers.slice(0, 10).map((offer, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="py-1.5 max-w-[140px] truncate">
                          <div className="flex items-center gap-1">
                            {offer.is_buy_box_winner && <ShoppingCart size={9} color="#f97316" />}
                            <span className={offer.is_buy_box_winner ? "font-bold" : ""}>{offer.seller_name}</span>
                          </div>
                          {offer.seller_rating && (
                            <span className="text-[8px]" style={{ color: "var(--text-muted)" }}>
                              Rating: {offer.seller_rating}
                            </span>
                          )}
                        </td>
                        <td className="text-right py-1.5 font-bold">{offer.price ? `$${offer.price.toFixed(2)}` : "--"}</td>
                        <td className="text-center py-1.5">
                          {offer.is_prime ? (
                            <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}>SI</span>
                          ) : (
                            <span className="text-[8px]" style={{ color: "var(--text-muted)" }}>No</span>
                          )}
                        </td>
                        <td className="text-center py-1.5">
                          {offer.is_fba ? (
                            <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.12)", color: "#6366f1" }}>FBA</span>
                          ) : (
                            <span className="text-[8px]" style={{ color: "var(--text-muted)" }}>FBM</span>
                          )}
                        </td>
                        <td className="text-center py-1.5 text-[9px]">{offer.condition}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {product.offers.length > 10 && (
                  <p className="text-[9px] mt-1 text-center" style={{ color: "var(--text-muted)" }}>
                    +{product.offers.length - 10} ofertas mas
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Rating Breakdown */}
          {rb && Object.keys(rb).length > 0 && (
            <div className="card mb-4">
              <p className="text-xs font-bold mb-3 flex items-center gap-1.5"><Star size={12} color="#f59e0b" /> Rating Breakdown</p>
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const key = `${stars}_star`;
                  const pct = rb[key] ?? 0;
                  return <RatingBar key={stars} label={`${stars}★`} pct={pct} color={stars >= 4 ? "#f59e0b" : stars === 3 ? "#eab308" : "#ef4444"} />;
                })}
              </div>
            </div>
          )}

          {/* Charts */}
          {s.length >= 2 && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="card">
                <p className="text-xs font-bold mb-2">Precio</p>
                <MiniChart data={s} field="price" color="#10b981" height={50} />
              </div>
              <div className="card">
                <p className="text-xs font-bold mb-2">BSR (menor = mejor)</p>
                <MiniChart data={s} field="bsr" color="#6366f1" height={50} />
              </div>
              <div className="card">
                <p className="text-xs font-bold mb-2">Reviews</p>
                <MiniChart data={s} field="reviews_count" color="#ec4899" height={50} />
              </div>
              <div className="card">
                <p className="text-xs font-bold mb-2">Rating</p>
                <MiniChart data={s} field="rating" color="#f59e0b" height={50} />
              </div>
            </div>
          )}

          {/* Product Images Gallery */}
          {product.images && product.images.length > 1 && (
            <div className="card mb-4">
              <p className="text-xs font-bold mb-2 flex items-center gap-1.5"><ImageIcon size={12} color="#8b5cf6" /> Imagenes ({product.images.length})</p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {product.images.map((img, i) => (
                  <img key={i} src={img} alt="" className="w-16 h-16 rounded-lg object-contain flex-shrink-0" style={{ background: "rgba(255,255,255,0.06)" }} />
                ))}
              </div>
            </div>
          )}

          {/* Product Info Grid */}
          {(product.seller_name || product.dimensions || product.weight || product.date_first_available || product.model_number || product.shipping_info || product.ships_from) && (
            <div className="card mb-4">
              <p className="text-xs font-bold mb-3 flex items-center gap-1.5"><Info size={12} color="#6366f1" /> Informacion del Producto</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {product.seller_name && (
                  <div className="flex items-center gap-1.5">
                    <User size={10} style={{ color: "var(--text-muted)" }} />
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Vendedor:</span>
                    <span className="text-[10px] font-bold">{product.seller_name}</span>
                  </div>
                )}
                {product.manufacturer && (
                  <div className="flex items-center gap-1.5">
                    <Factory size={10} style={{ color: "var(--text-muted)" }} />
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Fabricante:</span>
                    <span className="text-[10px] font-bold">{product.manufacturer}</span>
                  </div>
                )}
                {product.dimensions && (
                  <div className="flex items-center gap-1.5">
                    <Box size={10} style={{ color: "var(--text-muted)" }} />
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Dimensiones:</span>
                    <span className="text-[10px] font-bold">{product.dimensions}</span>
                  </div>
                )}
                {product.weight && (
                  <div className="flex items-center gap-1.5">
                    <Weight size={10} style={{ color: "var(--text-muted)" }} />
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Peso:</span>
                    <span className="text-[10px] font-bold">{product.weight}</span>
                  </div>
                )}
                {product.model_number && (
                  <div className="flex items-center gap-1.5">
                    <Tag size={10} style={{ color: "var(--text-muted)" }} />
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Modelo:</span>
                    <span className="text-[10px] font-bold">{product.model_number}</span>
                  </div>
                )}
                {product.date_first_available && (
                  <div className="flex items-center gap-1.5">
                    <Calendar size={10} style={{ color: "var(--text-muted)" }} />
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Disponible:</span>
                    <span className="text-[10px] font-bold">{product.date_first_available}</span>
                  </div>
                )}
                {product.ships_from && (
                  <div className="flex items-center gap-1.5">
                    <MapPin size={10} style={{ color: "var(--text-muted)" }} />
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Envio desde:</span>
                    <span className="text-[10px] font-bold">{product.ships_from}</span>
                  </div>
                )}
                {product.shipping_info && (
                  <div className="flex items-center gap-1.5 col-span-2">
                    <Truck size={10} style={{ color: "var(--text-muted)" }} />
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Envio:</span>
                    <span className="text-[10px] font-bold">{product.shipping_info}</span>
                  </div>
                )}
                {product.brand_url && (
                  <div className="flex items-center gap-1.5 col-span-2">
                    <Store size={10} style={{ color: "var(--text-muted)" }} />
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Brand Store:</span>
                    <a href={product.brand_url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>
                      Ver tienda
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Extra Product Info (category-specific fields) */}
          {product.product_info_extra && Object.keys(product.product_info_extra).length > 0 && (
            <div className="card mb-4">
              <p className="text-xs font-bold mb-3 flex items-center gap-1.5"><HelpCircle size={12} color="#8b5cf6" /> Datos Adicionales</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {Object.entries(product.product_info_extra).map(([key, val]) => (
                  <div key={key} className="flex items-start gap-1.5">
                    <span className="text-[10px] capitalize" style={{ color: "var(--text-muted)" }}>
                      {key.replace(/_/g, " ")}:
                    </span>
                    <span className="text-[10px] font-bold">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Variations */}
          {product.variations && product.variations.length > 0 && (
            <div className="card mb-4">
              <p className="text-xs font-bold mb-2 flex items-center gap-1.5"><Layers size={12} color="#ec4899" /> Variaciones</p>
              {product.variations.map((v, i) => (
                <div key={i} className="mb-2">
                  <p className="text-[10px] font-bold mb-1" style={{ color: "var(--text-secondary)" }}>{v.name}</p>
                  <div className="flex flex-wrap gap-1">
                    {v.values.map((val, j) => (
                      <span key={j} className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}>
                        {val}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Features (Bullet Points) */}
          {bullets.length > 0 && (
            <div className="card mb-4">
              <p className="text-xs font-bold mb-2 flex items-center gap-1.5"><CheckCircle2 size={12} color="#10b981" /> Bullet Points</p>
              <ul className="space-y-1.5">
                {bullets.map((f, i) => (
                  <li key={i} className="text-[11px] leading-relaxed flex gap-2" style={{ color: "var(--text-secondary)" }}>
                    <span className="mt-0.5 flex-shrink-0" style={{ color: "#10b981" }}>&#x2022;</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Description */}
          {(product.description || product.full_description || product.small_description) && (
            <div className="card mb-4">
              <p className="text-xs font-bold mb-2">Descripcion</p>
              {product.small_description && (
                <p className="text-[11px] font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                  {product.small_description}
                </p>
              )}
              {product.description && (
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {product.description.slice(0, 800)}{product.description.length > 800 ? "..." : ""}
                </p>
              )}
              {product.full_description && product.full_description !== product.description && (
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <p className="text-[10px] font-bold mb-1" style={{ color: "var(--text-muted)" }}>A+ / Extended Description</p>
                  <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {product.full_description.slice(0, 600)}{product.full_description.length > 600 ? "..." : ""}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Top Reviews */}
          {product.top_reviews && product.top_reviews.length > 0 && (
            <div className="card mb-4">
              <p className="text-xs font-bold mb-3 flex items-center gap-1.5"><MessageSquare size={12} color="#f59e0b" /> Top Reviews ({product.top_reviews.length})</p>
              <div className="space-y-3">
                {product.top_reviews.map((rev, i) => (
                  <div key={i} className="pb-3" style={{ borderBottom: i < product.top_reviews!.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }, (_, j) => (
                          <Star key={j} size={8} fill={j < (rev.stars || 0) ? "#f59e0b" : "transparent"} color={j < (rev.stars || 0) ? "#f59e0b" : "var(--text-muted)"} />
                        ))}
                      </div>
                      {rev.title && <span className="text-[10px] font-bold">{rev.title}</span>}
                    </div>
                    {rev.text && (
                      <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {rev.text.slice(0, 300)}{rev.text.length > 300 ? "..." : ""}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {rev.author && <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{rev.author}</span>}
                      {rev.date && <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{rev.date}</span>}
                      {rev.verified && (
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>Verificado</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Snapshots Table */}
          {s.length > 0 && (
            <div className="card mb-4">
              <p className="text-xs font-bold mb-2">Historial ({s.length} snapshots)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr style={{ color: "var(--text-muted)" }}>
                      <th className="text-left py-1">Fecha</th>
                      <th className="text-right py-1">Precio</th>
                      <th className="text-right py-1">BSR</th>
                      <th className="text-right py-1">Rating</th>
                      <th className="text-right py-1">Reviews</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...s].reverse().slice(0, 30).map((snap, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="py-1">{new Date(snap.date).toLocaleDateString()}</td>
                        <td className="text-right py-1">{snap.price ? `$${snap.price.toFixed(2)}` : "-"}</td>
                        <td className="text-right py-1">{snap.bsr ? `#${snap.bsr.toLocaleString()}` : "-"}</td>
                        <td className="text-right py-1">{snap.rating?.toFixed(1) || "-"}</td>
                        <td className="text-right py-1">{snap.reviews_count?.toLocaleString() || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Amazon Link */}
          {product.product_url && (
            <a
              href={product.product_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-colors"
              style={{ background: "rgba(249,115,22,0.1)", color: "var(--accent)" }}
            >
              <ExternalLink size={14} /> Ver en Amazon
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────── */

export default function ProductTrackerPage() {
  const [products, setProducts] = useState<TrackedProduct[]>([]);
  const [stats, setStats] = useState<TrackedProductStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState<Set<number>>(new Set());
  const [selectedProduct, setSelectedProduct] = useState<TrackedProduct | null>(null);
  const [sortBy, setSortBy] = useState<"price" | "bsr" | "reviews" | "name" | "date">("date");

  // Manual ASIN add
  const [showAdd, setShowAdd] = useState(false);
  const [newAsin, setNewAsin] = useState("");
  const [adding, setAdding] = useState(false);

  async function loadData() {
    try {
      setLoading(true);
      const [prodData, statsData] = await Promise.all([
        getTrackedProducts(),
        getTrackedProductStats(),
      ]);
      setProducts(prodData.items);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleRefresh(id: number) {
    setRefreshing((s) => new Set(s).add(id));
    try {
      const updated = await refreshTrackedProduct(id);
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch { /* ignore */ }
    setRefreshing((s) => { const n = new Set(s); n.delete(id); return n; });
  }

  async function handlePause(id: number) {
    try {
      const updated = await togglePauseTracked(id);
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch { /* ignore */ }
  }

  async function handleRemove(id: number) {
    if (!confirm("Dejar de trackear este producto?")) return;
    try {
      await removeTrackedProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch { /* ignore */ }
  }

  async function handleAddAsin() {
    const asin = newAsin.trim().toUpperCase();
    if (!asin || asin.length !== 10) return;
    setAdding(true);
    try {
      const item = await trackProduct({ asin });
      setProducts((prev) => [item, ...prev]);
      setNewAsin("");
      setShowAdd(false);
      loadData(); // refresh stats
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error adding ASIN");
    } finally {
      setAdding(false);
    }
  }

  const sorted = [...products].sort((a, b) => {
    switch (sortBy) {
      case "price": return (b.current_price || 0) - (a.current_price || 0);
      case "bsr": return (a.current_bsr || 999999999) - (b.current_bsr || 999999999);
      case "reviews": return (b.current_reviews || 0) - (a.current_reviews || 0);
      case "name": return a.title.localeCompare(b.title);
      case "date": default: return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent)" }} />
        <span className="ml-3 text-sm" style={{ color: "var(--text-secondary)" }}>Cargando productos...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-12">
        <AlertTriangle size={28} color="var(--danger)" className="mx-auto mb-3" />
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black">ASIN Tracker</h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Seguimiento de precio, BSR, reviews y badges de productos individuales
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {showAdd ? <Minus size={14} /> : <Plus size={14} />}
          {showAdd ? "Cancelar" : "Agregar ASIN"}
        </button>
      </div>

      {/* Add ASIN form */}
      {showAdd && (
        <div className="card mb-6 flex items-center gap-3">
          <Search size={16} style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            value={newAsin}
            onChange={(e) => setNewAsin(e.target.value.toUpperCase())}
            placeholder="Ingresa un ASIN (ej: B0CXXX1234)"
            maxLength={10}
            className="flex-1 bg-transparent border-none outline-none text-sm"
            style={{ color: "var(--text-primary)" }}
            onKeyDown={(e) => e.key === "Enter" && handleAddAsin()}
          />
          <button
            onClick={handleAddAsin}
            disabled={adding || newAsin.trim().length !== 10}
            className="px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-40"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : "Trackear"}
          </button>
        </div>
      )}

      {/* KPI Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="card text-center">
            <Package size={16} color="var(--accent)" className="mx-auto mb-1" />
            <p className="text-lg font-black">{stats.total}<span className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>/{stats.limit}</span></p>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Trackeados</p>
          </div>
          <div className="card text-center">
            <DollarSign size={16} color="#10b981" className="mx-auto mb-1" />
            <p className="text-lg font-black" style={{ color: "#10b981" }}>${stats.avg_price?.toFixed(2) || "--"}</p>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Precio Prom.</p>
          </div>
          <div className="card text-center">
            <Hash size={16} color="#6366f1" className="mx-auto mb-1" />
            <p className="text-lg font-black" style={{ color: "#6366f1" }}>{stats.avg_bsr ? `#${stats.avg_bsr.toLocaleString()}` : "--"}</p>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>BSR Prom.</p>
          </div>
          <div className="card text-center">
            <Award size={16} color="#f97316" className="mx-auto mb-1" />
            <p className="text-lg font-black" style={{ color: "#f97316" }}>{stats.best_sellers}</p>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Best Sellers</p>
          </div>
          <div className="card text-center">
            <Pause size={16} color="var(--text-muted)" className="mx-auto mb-1" />
            <p className="text-lg font-black">{stats.paused}</p>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Pausados</p>
          </div>
        </div>
      )}

      {/* Sort controls */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Ordenar:</span>
        {(["date", "price", "bsr", "reviews", "name"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className="text-[10px] px-2 py-1 rounded-lg font-bold transition-all"
            style={{
              background: sortBy === s ? "var(--accent)" : "rgba(255,255,255,0.04)",
              color: sortBy === s ? "#fff" : "var(--text-muted)",
            }}
          >
            {{ date: "Reciente", price: "Precio", bsr: "BSR", reviews: "Reviews", name: "Nombre" }[s]}
          </button>
        ))}
      </div>

      {/* Product Cards */}
      {sorted.length === 0 ? (
        <div className="card text-center py-16">
          <Package size={40} color="var(--text-muted)" className="mx-auto mb-4" />
          <p className="text-sm font-bold mb-1">No hay productos trackeados</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Agrega un ASIN manualmente o usa el boton &quot;Trackear&quot; en el analisis de un nicho
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((p) => {
            const pd = priceDelta(p.snapshots);
            const bd = bsrDelta(p.snapshots);
            const rg = reviewsGrowth(p.snapshots);

            // Card border color
            let borderColor = "var(--border)";
            if (p.is_paused) borderColor = "var(--text-muted)";
            else if (p.current_is_best_seller) borderColor = "#f97316";
            else if (pd && pd.direction === "down") borderColor = "#10b981"; // price dropped = good
            else if (bd && bd.direction === "up") borderColor = "#6366f1"; // BSR improved

            return (
              <div
                key={p.id}
                className="card cursor-pointer transition-all hover:scale-[1.005]"
                style={{ borderLeft: `3px solid ${borderColor}`, opacity: p.is_paused ? 0.6 : 1 }}
                onClick={() => setSelectedProduct(p)}
              >
                <div className="flex items-start gap-3">
                  {/* Image */}
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="w-14 h-14 rounded-lg object-contain flex-shrink-0" style={{ background: "rgba(255,255,255,0.06)" }} />
                  ) : (
                    <div className="w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <Package size={20} style={{ color: "var(--text-muted)" }} />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold line-clamp-1">{p.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {p.asin}
                          </span>
                          {p.brand && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>| {p.brand}</span>}
                          {p.is_paused && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}>PAUSADO</span>
                          )}
                          {p.current_is_best_seller && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5" style={{ background: "rgba(249,115,22,0.12)", color: "#f97316" }}>
                              <Award size={8} /> BEST SELLER
                            </span>
                          )}
                          {p.current_is_amazon_choice && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}>
                              <BadgeCheck size={8} /> CHOICE
                            </span>
                          )}
                          {p.current_monthly_bought && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                              <Flame size={8} /> {p.current_monthly_bought}
                            </span>
                          )}
                          {p.has_coupon && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5" style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}>
                              <Tag size={8} /> COUPON
                            </span>
                          )}
                          {p.has_aplus && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5" style={{ background: "rgba(168,85,247,0.12)", color: "#a855f7" }}>
                              A+
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Metrics row */}
                    <div className="flex items-center gap-4 mt-2 flex-wrap">
                      {/* Price */}
                      <div className="flex items-center gap-1">
                        <DollarSign size={12} color="#10b981" />
                        <span className="text-sm font-black" style={{ color: "#10b981" }}>{p.current_price ? `$${p.current_price.toFixed(2)}` : "--"}</span>
                        {pd && (
                          <span className="text-[9px] font-bold flex items-center gap-0.5" style={{ color: pd.direction === "down" ? "#10b981" : "#ef4444" }}>
                            {pd.direction === "down" ? <TrendingDown size={10} /> : <TrendingUp size={10} />}
                            {Math.abs(pd.pct).toFixed(0)}%
                          </span>
                        )}
                      </div>

                      {/* BSR */}
                      <div className="flex items-center gap-1">
                        <Hash size={12} color="#6366f1" />
                        <span className="text-xs font-bold" style={{ color: "#6366f1" }}>{p.current_bsr ? `#${p.current_bsr.toLocaleString()}` : "--"}</span>
                        {bd && (
                          <span className="text-[9px] font-bold flex items-center gap-0.5" style={{ color: bd.direction === "up" ? "#10b981" : "#ef4444" }}>
                            {bd.direction === "up" ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {Math.abs(bd.pct).toFixed(0)}%
                          </span>
                        )}
                      </div>

                      {/* Rating */}
                      <div className="flex items-center gap-1">
                        <Star size={12} color="#f59e0b" fill="#f59e0b" />
                        <span className="text-xs font-bold">{p.current_rating?.toFixed(1) || "--"}</span>
                      </div>

                      {/* Reviews */}
                      <div className="flex items-center gap-1">
                        <BarChart3 size={12} color="#ec4899" />
                        <span className="text-xs font-bold">{p.current_reviews?.toLocaleString() || "--"}</span>
                        {rg !== null && rg > 0 && (
                          <span className="text-[9px] font-bold" style={{ color: "#10b981" }}>+{rg}</span>
                        )}
                      </div>

                      {/* Sparklines */}
                      {p.snapshots.length >= 2 && (
                        <div className="hidden md:flex items-center gap-3 ml-auto">
                          <MiniChart data={p.snapshots} field="price" color="#10b981" height={24} />
                          <MiniChart data={p.snapshots} field="bsr" color="#6366f1" height={24} />
                        </div>
                      )}
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {p.snapshots.length} snapshots
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        Revisado: {timeAgo(p.last_checked_at)}
                      </span>
                      {p.from_keyword && (
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          De: {p.from_keyword}
                        </span>
                      )}
                      {p.from_analysis_id && (
                        <Link
                          href={`/analysis/${p.from_analysis_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] font-bold"
                          style={{ color: "var(--accent)" }}
                        >
                          Ver analisis
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleRefresh(p.id)}
                      disabled={refreshing.has(p.id)}
                      className="p-1.5 rounded-lg transition-all"
                      style={{ background: "rgba(99,102,241,0.08)" }}
                      title="Re-scrapear ahora"
                    >
                      {refreshing.has(p.id) ? (
                        <Loader2 size={14} className="animate-spin" color="#6366f1" />
                      ) : (
                        <RefreshCw size={14} color="#6366f1" />
                      )}
                    </button>
                    <button
                      onClick={() => handlePause(p.id)}
                      className="p-1.5 rounded-lg transition-all"
                      style={{ background: p.is_paused ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.04)" }}
                      title={p.is_paused ? "Reanudar" : "Pausar"}
                    >
                      {p.is_paused ? <Play size={14} color="#10b981" /> : <Pause size={14} color="var(--text-muted)" />}
                    </button>
                    {p.product_url && (
                      <a
                        href={p.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg transition-all"
                        style={{ background: "rgba(249,115,22,0.08)" }}
                        title="Ver en Amazon"
                      >
                        <ExternalLink size={14} color="var(--accent)" />
                      </a>
                    )}
                    <button
                      onClick={() => handleRemove(p.id)}
                      className="p-1.5 rounded-lg transition-all"
                      style={{ background: "rgba(239,68,68,0.06)" }}
                      title="Eliminar"
                    >
                      <Trash2 size={14} color="#ef4444" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Panel */}
      {selectedProduct && (
        <DetailPanel product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
    </div>
  );
}
