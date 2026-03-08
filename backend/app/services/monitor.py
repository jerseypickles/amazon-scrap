from __future__ import annotations

import logging
from datetime import datetime, timezone

import app.database as _database
from app.models.watchlist import new_notification_doc, new_watchlist_item_doc
from app.services.analyzer import analyzer
from app.services.ai_advisor import ai_advisor
from app.services.keepa_service import keepa_service

logger = logging.getLogger(__name__)

MAX_SCORE_HISTORY = 30  # Keep last 30 data-points per item


class NicheMonitor:
    async def check_watchlist(self):
        """Check all active, non-paused watchlist items that are due for re-analysis."""
        items = await _database.db.watchlist_items.find(
            {"is_active": True, "is_paused": {"$ne": True}},
        ).to_list(length=200)

        for item in items:
            # Check if enough time has passed since last check
            if item.get("last_checked_at"):
                checked = item["last_checked_at"]
                if checked.tzinfo is None:
                    checked = checked.replace(tzinfo=timezone.utc)
                hours_since = (datetime.now(timezone.utc) - checked).total_seconds() / 3600
                if hours_since < item.get("check_interval_hours", 24):
                    continue

            logger.info(f"Re-analyzing watchlist item: {item['keyword']}")
            try:
                await self._reanalyze_item(item)
            except Exception as e:
                logger.error(f"Failed to re-analyze {item['keyword']}: {e}")

    async def force_reanalyze(self, item_id: int) -> dict | None:
        """Force an immediate re-analysis of a watchlist item."""
        item = await _database.db.watchlist_items.find_one({"id": item_id, "is_active": True})
        if not item:
            return None
        await self._reanalyze_item(item)
        return await _database.db.watchlist_items.find_one({"id": item_id})

    async def toggle_pause(self, item_id: int) -> dict | None:
        """Toggle pause state for a watchlist item."""
        item = await _database.db.watchlist_items.find_one({"id": item_id, "is_active": True})
        if not item:
            return None
        new_state = not item.get("is_paused", False)
        await _database.db.watchlist_items.update_one(
            {"_id": item["_id"]},
            {"$set": {"is_paused": new_state}},
        )
        return await _database.db.watchlist_items.find_one({"id": item_id})

    async def get_watchlist_stats(self) -> dict:
        """Compute aggregate stats across all active watchlist items."""
        items = await _database.db.watchlist_items.find(
            {"is_active": True},
        ).to_list(length=200)

        total = len(items)
        scores = [i["last_score"] for i in items if i.get("last_score") is not None]
        avg_score = round(sum(scores) / len(scores), 1) if scores else None

        up = sum(1 for i in items if i.get("score_trend") == "up")
        down = sum(1 for i in items if i.get("score_trend") == "down")
        stable = sum(1 for i in items if i.get("score_trend") == "stable")
        new = sum(1 for i in items if i.get("score_trend") in (None, "new"))
        paused = sum(1 for i in items if i.get("is_paused"))

        # Find next scheduled check
        next_check = None
        for i in items:
            if i.get("is_paused"):
                continue
            if i.get("last_checked_at"):
                checked = i["last_checked_at"]
                if checked.tzinfo is None:
                    checked = checked.replace(tzinfo=timezone.utc)
                interval_s = i.get("check_interval_hours", 24) * 3600
                due = checked.timestamp() + interval_s
                if next_check is None or due < next_check:
                    next_check = due

        return {
            "total": total,
            "avg_score": avg_score,
            "trending_up": up,
            "trending_down": down,
            "stable": stable,
            "new_unchecked": new,
            "paused": paused,
            "next_check_at": datetime.fromtimestamp(next_check, tz=timezone.utc).isoformat() if next_check else None,
        }

    # ------------------------------------------------------------------
    # Core re-analysis logic
    # ------------------------------------------------------------------

    async def _reanalyze_item(self, item: dict):
        """Re-analyze a watchlist item with full metrics tracking."""
        try:
            analysis_resp = await analyzer.analyze_niche(item["keyword"], 2)

            new_score = analysis_resp.opportunity_score
            old_score = item.get("last_score")
            run_ai = False

            # Determine trend
            if old_score is not None and new_score is not None:
                diff = new_score - old_score
                if diff > 3:
                    trend = "up"
                elif diff < -3:
                    trend = "down"
                else:
                    trend = "stable"

                # Create notification on significant change
                if abs(diff) >= 5:
                    direction = "subió" if diff > 0 else "bajó"
                    severity = "success" if diff > 0 else "warning"
                    nid = await _database.get_next_id("notifications")
                    notif = new_notification_doc(
                        nid,
                        type="score_change",
                        title=f"{item['keyword']}: Score {direction}",
                        message=f"Score de \"{item['keyword']}\" {direction} de {old_score:.0f} a {new_score:.0f} ({'+' if diff > 0 else ''}{diff:.0f} pts).",
                        keyword=item["keyword"],
                        analysis_id=analysis_resp.id,
                        severity=severity,
                    )
                    await _database.db.notifications.insert_one(notif)
                    run_ai = True

                # Alert on big opportunities
                if old_score and old_score < 60 and new_score and new_score >= 65:
                    nid = await _database.get_next_id("notifications")
                    notif = new_notification_doc(
                        nid,
                        type="new_opportunity",
                        title=f"Oportunidad: {item['keyword']}!",
                        message=f"\"{item['keyword']}\" cruzó el umbral 65+ (ahora {new_score:.0f}). Este nicho puede valer la pena.",
                        keyword=item["keyword"],
                        analysis_id=analysis_resp.id,
                        severity="success",
                    )
                    await _database.db.notifications.insert_one(notif)
                    run_ai = True
            else:
                trend = "new"
                run_ai = True

            # ------------------------------------------------------------------
            # Collect current metrics from analysis
            # ------------------------------------------------------------------
            current_metrics = {
                "avg_price": analysis_resp.avg_price,
                "median_reviews": analysis_resp.median_reviews,
                "brand_count": analysis_resp.brand_count,
                "top3_brand_share": analysis_resp.top3_brand_share,
                "estimated_margin": analysis_resp.estimated_margin,
                "total_products": analysis_resp.total_products,
                "revenue_estimate": analysis_resp.revenue_estimate,
            }

            # ------------------------------------------------------------------
            # Keepa enrichment for the niche's top ASINs
            # ------------------------------------------------------------------
            keepa_data: dict | None = None
            if keepa_service.enabled:
                try:
                    products = await _database.db.products.find(
                        {"search_keyword": item["keyword"]},
                    ).sort("bsr", 1).limit(10).to_list(10)
                    top_asins = [p["asin"] for p in products if p.get("asin")]
                    if top_asins:
                        keepa_data = await keepa_service.enrich_asins(top_asins, days=90)
                        if keepa_data:
                            logger.info(
                                "Keepa watchlist enrichment for %s: confidence=%s%%",
                                item["keyword"], keepa_data.get("data_confidence", 0),
                            )
                except Exception as e:
                    logger.warning("Keepa watchlist enrichment failed for %s: %s", item["keyword"], e)

            # ------------------------------------------------------------------
            # Smart metric alerts — compare vs previous metrics
            # ------------------------------------------------------------------
            alerts: list[str] = []
            prev_metrics = item.get("last_metrics") or {}

            if prev_metrics and current_metrics:
                alerts = self._generate_metric_alerts(
                    item["keyword"], prev_metrics, current_metrics, keepa_data, analysis_resp.id,
                )

            # Keepa-specific alerts
            if keepa_data:
                keepa_alerts = self._generate_keepa_alerts(
                    item["keyword"], keepa_data, analysis_resp.id,
                )
                alerts.extend(keepa_alerts)

            # Create notifications for alerts
            for alert_msg in alerts:
                nid = await _database.get_next_id("notifications")
                severity = "success" if any(w in alert_msg for w in ["oportunidad", "mejor margen", "barrera más baja"]) else "warning"
                notif = new_notification_doc(
                    nid,
                    type="metric_alert",
                    title=f"{item['keyword']}: Alerta",
                    message=alert_msg,
                    keyword=item["keyword"],
                    analysis_id=analysis_resp.id,
                    severity=severity,
                )
                await _database.db.notifications.insert_one(notif)

            # ------------------------------------------------------------------
            # Compute action signal
            # ------------------------------------------------------------------
            action_signal = self._compute_action_signal(
                new_score, trend, current_metrics, keepa_data, item.get("score_history", []),
            )

            # ------------------------------------------------------------------
            # Build metrics history entry
            # ------------------------------------------------------------------
            now = datetime.now(timezone.utc)
            history_entry = None
            if new_score is not None:
                history_entry = {
                    "date": now.isoformat(),
                    "score": new_score,
                    "avg_price": current_metrics.get("avg_price"),
                    "median_reviews": current_metrics.get("median_reviews"),
                    "brand_count": current_metrics.get("brand_count"),
                    "top3_brand_share": current_metrics.get("top3_brand_share"),
                    "estimated_margin": current_metrics.get("estimated_margin"),
                    "total_products": current_metrics.get("total_products"),
                    "revenue_estimate": current_metrics.get("revenue_estimate"),
                    "keepa_trend": keepa_data.get("trend", {}).get("direction") if keepa_data else None,
                    "keepa_sellers_change": keepa_data.get("seller_dynamics", {}).get("avg_seller_change_pct") if keepa_data else None,
                }

            # Append to history (keep last N entries)
            update_ops: dict = {
                "$set": {
                    "previous_score": old_score,
                    "last_score": new_score,
                    "score_trend": trend,
                    "last_analysis_id": analysis_resp.id,
                    "last_checked_at": now,
                    "action_signal": action_signal,
                    "last_metrics": current_metrics,
                    "alerts": alerts,
                },
            }
            if history_entry:
                update_ops["$push"] = {
                    "score_history": {
                        "$each": [history_entry],
                        "$slice": -MAX_SCORE_HISTORY,
                    },
                }

            await _database.db.watchlist_items.update_one(
                {"_id": item["_id"]},
                update_ops,
            )

            # Run AI re-analysis when there's a significant change or first check
            if run_ai:
                try:
                    logger.info(f"Running AI re-analysis for {item['keyword']}")
                    ai_result = await ai_advisor.analyze_niche_ai(analysis_resp.id)
                    verdict = ai_result.get("insight", {}).get("verdict", "")
                    nid = await _database.get_next_id("notifications")
                    notif = new_notification_doc(
                        nid,
                        type="ai_insight",
                        title=f"IA actualizada: {item['keyword']}",
                        message=f"Nuevo análisis IA para \"{item['keyword']}\": {verdict[:200]}",
                        keyword=item["keyword"],
                        analysis_id=analysis_resp.id,
                        severity="info",
                    )
                    await _database.db.notifications.insert_one(notif)
                except Exception as ai_err:
                    logger.error(f"AI re-analysis failed for {item['keyword']}: {ai_err}")

        except Exception as e:
            logger.error(f"Re-analysis failed for {item['keyword']}: {e}")
            nid = await _database.get_next_id("notifications")
            notif = new_notification_doc(
                nid,
                type="alert",
                title=f"Re-análisis falló: {item['keyword']}",
                message=f"No se pudo re-analizar \"{item['keyword']}\": {str(e)}",
                keyword=item["keyword"],
                severity="danger",
            )
            await _database.db.notifications.insert_one(notif)
            await _database.db.watchlist_items.update_one(
                {"_id": item["_id"]},
                {"$set": {"last_checked_at": datetime.now(timezone.utc)}},
            )

    # ------------------------------------------------------------------
    # Smart metric alerts
    # ------------------------------------------------------------------

    def _generate_metric_alerts(
        self,
        keyword: str,
        prev: dict,
        curr: dict,
        keepa_data: dict | None,
        analysis_id: int,
    ) -> list[str]:
        """Compare previous vs current metrics and return alert messages."""
        alerts: list[str] = []

        # Reviews mediana bajó 30%+
        prev_rev = prev.get("median_reviews")
        curr_rev = curr.get("median_reviews")
        if prev_rev and curr_rev and prev_rev > 0:
            change = (curr_rev - prev_rev) / prev_rev * 100
            if change <= -30:
                alerts.append(f"Barrera más baja: reviews mediana bajó de {prev_rev:.0f} a {curr_rev:.0f} ({change:+.0f}%)")

        # Top3 brand share bajó 10%+
        prev_share = prev.get("top3_brand_share")
        curr_share = curr.get("top3_brand_share")
        if prev_share and curr_share:
            diff = curr_share - prev_share
            if diff <= -10:
                alerts.append(f"Top marcas perdieron cuota: de {prev_share:.0f}% a {curr_share:.0f}% — espacio para nuevos")

        # Precio promedio subió 15%+
        prev_price = prev.get("avg_price")
        curr_price = curr.get("avg_price")
        if prev_price and curr_price and prev_price > 0:
            change = (curr_price - prev_price) / prev_price * 100
            if change >= 15:
                alerts.append(f"Precio promedio subió ${prev_price:.0f} → ${curr_price:.0f} — mejor margen potencial")

        # Margen estimado cayó 5+ pts
        prev_margin = prev.get("estimated_margin")
        curr_margin = curr.get("estimated_margin")
        if prev_margin is not None and curr_margin is not None:
            diff = curr_margin - prev_margin
            if diff <= -5:
                alerts.append(f"Margen en caída: de {prev_margin:.0f}% a {curr_margin:.0f}%")

        # Total products subió 20%+
        prev_total = prev.get("total_products")
        curr_total = curr.get("total_products")
        if prev_total and curr_total and prev_total > 0:
            change = (curr_total - prev_total) / prev_total * 100
            if change >= 20:
                alerts.append(f"Más competidores: de {prev_total} a {curr_total} productos (+{change:.0f}%)")

        return alerts

    # ------------------------------------------------------------------
    # Keepa-specific alerts
    # ------------------------------------------------------------------

    def _generate_keepa_alerts(
        self,
        keyword: str,
        keepa_data: dict,
        analysis_id: int,
    ) -> list[str]:
        """Generate alerts from Keepa data."""
        alerts: list[str] = []

        # Sellers increasing rapidly
        sd = keepa_data.get("seller_dynamics")
        if sd and sd.get("sellers_increasing_pct", 0) > 50:
            alerts.append(f"Alerta saturación: sellers aumentando ({sd['sellers_increasing_pct']:.0f}% de productos con más sellers)")

        # BSR declining = demand falling
        trend = keepa_data.get("trend")
        if trend and trend.get("direction") == "declining":
            alerts.append(f"Demanda Keepa en caída: BSR empeorando {trend.get('avg_bsr_change_pct', 0):+.0f}%")

        # Price war
        ps = keepa_data.get("price_stability")
        if ps and ps.get("volatile_pct", 0) > 50:
            alerts.append(f"Guerra de precios: {ps['volatile_pct']:.0f}% de productos con precios inestables")

        # Seasonal
        seas = keepa_data.get("seasonality")
        if seas and seas.get("is_seasonal"):
            alerts.append("Producto estacional detectado — considera timing de entrada")

        return alerts

    # ------------------------------------------------------------------
    # Action signal computation
    # ------------------------------------------------------------------

    def _compute_action_signal(
        self,
        score: float | None,
        trend: str,
        metrics: dict,
        keepa_data: dict | None,
        score_history: list[dict],
    ) -> str:
        """Compute an actionable signal: ENTRAR, CONSIDERAR, ESPERAR, SATURANDOSE, SALIR."""
        if score is None:
            return "NUEVO"

        margin = metrics.get("estimated_margin") or 0
        median_rev = metrics.get("median_reviews") or 9999
        sellers_increasing = False
        products_grew = False

        # Check Keepa saturation signals
        if keepa_data:
            sd = keepa_data.get("seller_dynamics")
            if sd and sd.get("sellers_increasing_pct", 0) > 50:
                sellers_increasing = True

        # Check if total_products grew 20%+ vs previous
        if len(score_history) >= 2:
            prev_entry = score_history[-1]  # last entry before this check
            prev_total = prev_entry.get("total_products")
            curr_total = metrics.get("total_products")
            if prev_total and curr_total and prev_total > 0:
                if (curr_total - prev_total) / prev_total >= 0.20:
                    products_grew = True

        # Check sustained decline (3+ declining checks)
        recent_scores = [h.get("score", 0) for h in score_history[-4:]] if len(score_history) >= 3 else []
        sustained_decline = False
        if len(recent_scores) >= 3:
            declines = sum(1 for i in range(1, len(recent_scores)) if recent_scores[i] < recent_scores[i - 1] - 2)
            if declines >= 2:
                sustained_decline = True

        # Priority order: SALIR > SATURANDOSE > ENTRAR > CONSIDERAR > ESPERAR
        if sustained_decline and score < 45:
            return "SALIR"

        if sellers_increasing or products_grew:
            return "SATURANDOSE"

        if score >= 65 and margin >= 30 and median_rev < 300:
            return "ENTRAR"

        if score >= 50 and margin >= 25:
            return "CONSIDERAR"

        return "ESPERAR"

    # ------------------------------------------------------------------
    # CRUD operations
    # ------------------------------------------------------------------

    async def add_to_watchlist(
        self, keyword: str, analysis_id: int | None, score: float | None,
        interval_hours: int, notes: str | None, db_ref=None,
    ) -> dict:
        # Check if already exists
        existing = await _database.db.watchlist_items.find_one({"keyword": keyword})
        if existing:
            update = {
                "is_active": True,
                "is_paused": False,
                "check_interval_hours": interval_hours,
            }
            if notes:
                update["notes"] = notes
            if analysis_id:
                update["last_analysis_id"] = analysis_id
            if score is not None:
                update["last_score"] = score
            await _database.db.watchlist_items.update_one(
                {"_id": existing["_id"]}, {"$set": update},
            )
            return await _database.db.watchlist_items.find_one({"_id": existing["_id"]})

        wid = await _database.get_next_id("watchlist_items")
        doc = new_watchlist_item_doc(
            wid,
            keyword=keyword,
            last_analysis_id=analysis_id,
            last_score=score,
            check_interval_hours=interval_hours,
            notes=notes,
        )
        await _database.db.watchlist_items.insert_one(doc)

        # Create welcome notification
        nid = await _database.get_next_id("notifications")
        notif = new_notification_doc(
            nid,
            type="ai_insight",
            title=f"Vigilando: {keyword}",
            message=f"\"{keyword}\" agregado al watchlist. Recibirás alertas de cambios, métricas y oportunidades.",
            keyword=keyword,
            analysis_id=analysis_id,
            severity="info",
        )
        await _database.db.notifications.insert_one(notif)

        return await _database.db.watchlist_items.find_one({"id": wid})

    async def get_watchlist(self, db_ref=None) -> list[dict]:
        return await _database.db.watchlist_items.find(
            {"is_active": True},
        ).sort("created_at", -1).to_list(length=200)

    async def remove_from_watchlist(self, item_id: int, db_ref=None) -> bool:
        result = await _database.db.watchlist_items.update_one(
            {"id": item_id},
            {"$set": {"is_active": False}},
        )
        return result.modified_count > 0

    async def get_notifications(self, db_ref=None, unread_only: bool = False, limit: int = 50):
        query = {}
        if unread_only:
            query["is_read"] = False
        return await _database.db.notifications.find(query).sort("created_at", -1).limit(limit).to_list(length=limit)

    async def mark_notification_read(self, notification_id: int, db_ref=None):
        await _database.db.notifications.update_one(
            {"id": notification_id},
            {"$set": {"is_read": True}},
        )

    async def mark_all_read(self, db_ref=None):
        await _database.db.notifications.update_many(
            {"is_read": False},
            {"$set": {"is_read": True}},
        )

    async def get_unread_count(self, db_ref=None) -> int:
        return await _database.db.notifications.count_documents({"is_read": False})


monitor = NicheMonitor()
