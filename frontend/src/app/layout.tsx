"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  Clock,
  FolderTree,
  Zap,
  Eye,
  Bell,
  X,
  CheckCheck,
  ExternalLink,
  Repeat,
  DollarSign,
  Package,
  Settings,
} from "lucide-react";
import { getNotifications, markNotificationRead, markAllNotificationsRead, getUserProfile } from "@/lib/api";
import type { AppNotification } from "@/types";
import "./globals.css";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/search", label: "Analizar Nicho", icon: Search },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/products", label: "ASIN Tracker", icon: Package },
  { href: "/history", label: "Historial", icon: Clock },
  { href: "/categories", label: "Categorías", icon: FolderTree },
  { href: "/profile", label: "Perfil", icon: Settings },
];

function severityIcon(severity: string) {
  const colorMap: Record<string, string> = {
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
    info: "#6366f1",
  };
  return colorMap[severity] || "#6366f1";
}

function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await getNotifications();
      setNotifications(data.notifications);
      setUnreadCount(data.unread_count);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  async function handleMarkRead(id: number) {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open) loadNotifications(); }}
        className="relative p-2.5 rounded-xl transition-all"
        style={{
          background: open ? "rgba(255,255,255,0.06)" : "transparent",
          border: "1px solid transparent",
          borderColor: open ? "var(--border-light)" : "transparent",
        }}
      >
        <Bell size={18} color="var(--text-secondary)" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
            style={{ background: "var(--accent)", boxShadow: "0 0 10px rgba(249,115,22,0.4)", width: "18px", height: "18px" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-12 w-80 rounded-2xl overflow-hidden z-50"
          style={{
            background: "rgba(12, 16, 28, 0.95)",
            backdropFilter: "blur(20px)",
            border: "1px solid var(--border-light)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.3)",
          }}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <h3 className="text-sm font-bold">Notificaciones</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={handleMarkAllRead} className="p-1 rounded" title="Marcar todo le\u00eddo">
                  <CheckCheck size={14} color="var(--accent)" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded">
                <X size={14} color="var(--text-muted)" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center py-8">
                <Bell size={24} color="var(--text-muted)" className="mx-auto mb-2" />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Sin notificaciones
                </p>
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  className="px-4 py-3 cursor-pointer transition-colors"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: n.is_read ? "transparent" : "rgba(249,115,22,0.03)",
                  }}
                  onClick={() => !n.is_read && handleMarkRead(n.id)}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: n.is_read ? "transparent" : severityIcon(n.severity) }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{n.title}</p>
                      <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                        {n.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                        </span>
                        {n.analysis_id && (
                          <Link
                            href={`/analysis/${n.analysis_id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={10} color="var(--accent)" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const [budget, setBudget] = useState(10000);

  useEffect(() => {
    getUserProfile()
      .then((p) => { if (p?.budget) setBudget(p.budget); })
      .catch(() => {});
  }, []);

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="px-5 py-6 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #f97316, #ea580c)",
            boxShadow: "0 4px 20px rgba(249, 115, 22, 0.3)",
          }}
        >
          <Zap size={20} color="#fff" />
        </div>
        <div>
          <h1 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
            NicheScout
          </h1>
          <p className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
            Productos Consumibles
          </p>
        </div>
      </div>

      <div className="section-divider" style={{ margin: "0 1.25rem" }} />

      {/* Navigation */}
      <nav className="px-3 flex-1 mt-4">
        <p
          className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: "var(--text-muted)" }}
        >
          Men\u00fa
        </p>
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${isActive ? "nav-item-active" : ""}`}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom card */}
      <div className="px-4 pb-5">
        <div
          className="rounded-xl p-4"
          style={{
            background: "linear-gradient(145deg, rgba(249,115,22,0.08), rgba(249,115,22,0.02))",
            border: "1px solid rgba(249,115,22,0.12)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <DollarSign size={12} color="var(--accent)" />
              <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                Presupuesto
              </span>
            </div>
            <span className="text-xs font-black" style={{ color: "var(--accent)" }}>${budget.toLocaleString()}</span>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Busca productos consumibles con alta recompra. La IA calcula costos China, m\u00e1rgenes y ROI.
          </p>
        </div>
      </div>
    </aside>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <Sidebar />
        <main className="main-content">
          {/* Top bar */}
          <div className="flex items-center justify-end mb-6">
            <NotificationPanel />
          </div>
          {children}
        </main>
      </body>
    </html>
  );
}
