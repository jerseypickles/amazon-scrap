from __future__ import annotations

import logging
from datetime import datetime, timezone

import app.database as _database
from app.models.watchlist import new_notification_doc, new_watchlist_item_doc
from app.services.analyzer import analyzer
from app.services.ai_advisor import ai_advisor

logger = logging.getLogger(__name__)


class NicheMonitor:
    async def check_watchlist(self):
        """Check all active watchlist items that are due for re-analysis."""
        items = await _database.db.watchlist_items.find({"is_active": True}).to_list(length=200)

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

    async def _reanalyze_item(self, item: dict):
        """Re-analyze a watchlist item and create notifications for changes."""
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
                    direction = "increased" if diff > 0 else "decreased"
                    severity = "success" if diff > 0 else "warning"
                    nid = await _database.get_next_id("notifications")
                    notif = new_notification_doc(
                        nid,
                        type="score_change",
                        title=f"{item['keyword']}: Score {direction}",
                        message=f"Opportunity score for \"{item['keyword']}\" {direction} from {old_score:.0f} to {new_score:.0f} ({'+' if diff > 0 else ''}{diff:.0f} points).",
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
                        title=f"New opportunity: {item['keyword']}!",
                        message=f"\"{item['keyword']}\" just crossed the 65+ threshold (now {new_score:.0f}). This niche may be worth entering.",
                        keyword=item["keyword"],
                        analysis_id=analysis_resp.id,
                        severity="success",
                    )
                    await _database.db.notifications.insert_one(notif)
                    run_ai = True
            else:
                trend = "new"
                run_ai = True

            # Update watchlist item
            now = datetime.now(timezone.utc)
            await _database.db.watchlist_items.update_one(
                {"_id": item["_id"]},
                {"$set": {
                    "previous_score": old_score,
                    "last_score": new_score,
                    "score_trend": trend,
                    "last_analysis_id": analysis_resp.id,
                    "last_checked_at": now,
                }},
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
                title=f"Re-analysis failed: {item['keyword']}",
                message=f"Could not re-analyze \"{item['keyword']}\": {str(e)}",
                keyword=item["keyword"],
                severity="danger",
            )
            await _database.db.notifications.insert_one(notif)
            await _database.db.watchlist_items.update_one(
                {"_id": item["_id"]},
                {"$set": {"last_checked_at": datetime.now(timezone.utc)}},
            )

    async def add_to_watchlist(
        self, keyword: str, analysis_id: int | None, score: float | None,
        interval_hours: int, notes: str | None, db_ref=None,
    ) -> dict:
        # Check if already exists
        existing = await _database.db.watchlist_items.find_one({"keyword": keyword})
        if existing:
            update = {
                "is_active": True,
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
            title=f"Watching: {keyword}",
            message=f"Added \"{keyword}\" to your watchlist. You'll be notified of score changes and opportunities.",
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
