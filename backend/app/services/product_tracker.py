"""Service for tracking individual ASINs over time."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import app.database as _database
from app.models.watchlist import new_notification_doc, new_tracked_product_doc
from app.services.scraper import scraper

logger = logging.getLogger(__name__)

MAX_SNAPSHOTS = 90  # ~3 months of daily checks
MAX_TRACKED = 50


class ProductTracker:
    # ── CRUD ─────────────────────────────────────────────────────────

    async def track_product(
        self,
        asin: str,
        title: str | None = None,
        brand: str | None = None,
        price: float | None = None,
        rating: float | None = None,
        reviews_count: int | None = None,
        bsr: int | None = None,
        bsr_category: str | None = None,
        image_url: str | None = None,
        product_url: str | None = None,
        is_best_seller: bool = False,
        is_amazon_choice: bool = False,
        monthly_bought: str | None = None,
        from_keyword: str | None = None,
        from_analysis_id: int | None = None,
        notes: str | None = None,
        interval_hours: int = 24,
    ) -> dict:
        """Add a product to tracking. If already tracked, reactivate it."""
        # Check if already tracked
        existing = await _database.db.tracked_products.find_one({"asin": asin})
        if existing:
            update: dict = {
                "is_active": True,
                "is_paused": False,
            }
            if notes:
                update["notes"] = notes
            if interval_hours:
                update["check_interval_hours"] = interval_hours
            await _database.db.tracked_products.update_one(
                {"_id": existing["_id"]}, {"$set": update},
            )
            return await _database.db.tracked_products.find_one({"asin": asin})

        # Check limit
        count = await _database.db.tracked_products.count_documents({"is_active": True})
        if count >= MAX_TRACKED:
            raise ValueError(f"Maximum {MAX_TRACKED} tracked products reached. Remove some before adding new ones.")

        # If we don't have detail data, scrape it
        if bsr is None and scraper.use_api:
            try:
                detail = await scraper.get_product_detail(asin)
                if detail:
                    bsr = detail.get("bsr")
                    bsr_category = detail.get("bsr_category")
                    if not title:
                        title = detail.get("title") or title
            except Exception as e:
                logger.warning("Could not fetch detail for %s: %s", asin, e)

        pid = await _database.get_next_id("tracked_products")
        doc = new_tracked_product_doc(
            pid,
            asin=asin,
            title=title or "",
            brand=brand,
            price=price,
            rating=rating,
            reviews_count=reviews_count,
            bsr=bsr,
            bsr_category=bsr_category,
            image_url=image_url,
            product_url=product_url or f"https://www.amazon.com/dp/{asin}",
            is_best_seller=is_best_seller,
            is_amazon_choice=is_amazon_choice,
            monthly_bought=monthly_bought,
            from_keyword=from_keyword,
            from_analysis_id=from_analysis_id,
            notes=notes,
            check_interval_hours=interval_hours,
        )
        await _database.db.tracked_products.insert_one(doc)

        # Welcome notification
        nid = await _database.get_next_id("notifications")
        notif = new_notification_doc(
            nid,
            type="product_tracked",
            title=f"Tracking: {asin}",
            message=f'Now tracking "{title or asin}". You\'ll be notified of price, BSR, and review changes.',
            keyword=from_keyword,
            severity="info",
        )
        await _database.db.notifications.insert_one(notif)

        return await _database.db.tracked_products.find_one({"id": pid})

    async def get_tracked_products(self) -> list[dict]:
        return await _database.db.tracked_products.find(
            {"is_active": True},
        ).sort("created_at", -1).to_list(length=200)

    async def get_tracked_product(self, product_id: int) -> dict | None:
        return await _database.db.tracked_products.find_one(
            {"id": product_id, "is_active": True},
        )

    async def check_tracked(self, asin: str) -> dict:
        """Check if an ASIN is already tracked."""
        item = await _database.db.tracked_products.find_one(
            {"asin": asin, "is_active": True},
        )
        return {"tracked": item is not None, "item_id": item["id"] if item else None}

    async def remove_tracked(self, product_id: int) -> bool:
        result = await _database.db.tracked_products.update_one(
            {"id": product_id},
            {"$set": {"is_active": False}},
        )
        return result.modified_count > 0

    async def toggle_pause(self, product_id: int) -> dict | None:
        item = await _database.db.tracked_products.find_one(
            {"id": product_id, "is_active": True},
        )
        if not item:
            return None
        new_state = not item.get("is_paused", False)
        await _database.db.tracked_products.update_one(
            {"_id": item["_id"]},
            {"$set": {"is_paused": new_state}},
        )
        return await _database.db.tracked_products.find_one({"id": product_id})

    async def update_notes(self, product_id: int, notes: str) -> dict | None:
        item = await _database.db.tracked_products.find_one(
            {"id": product_id, "is_active": True},
        )
        if not item:
            return None
        await _database.db.tracked_products.update_one(
            {"_id": item["_id"]},
            {"$set": {"notes": notes}},
        )
        return await _database.db.tracked_products.find_one({"id": product_id})

    # ── Scrape & Snapshot ────────────────────────────────────────────

    async def force_refresh(self, product_id: int) -> dict | None:
        """Force an immediate re-scrape of a tracked product."""
        item = await _database.db.tracked_products.find_one(
            {"id": product_id, "is_active": True},
        )
        if not item:
            return None
        await self._refresh_product(item)
        return await _database.db.tracked_products.find_one({"id": product_id})

    async def check_tracked_products(self):
        """Background job: re-scrape all tracked products that are due."""
        items = await _database.db.tracked_products.find(
            {"is_active": True, "is_paused": {"$ne": True}},
        ).to_list(length=200)

        for item in items:
            if item.get("last_checked_at"):
                checked = item["last_checked_at"]
                if checked.tzinfo is None:
                    checked = checked.replace(tzinfo=timezone.utc)
                hours_since = (datetime.now(timezone.utc) - checked).total_seconds() / 3600
                if hours_since < item.get("check_interval_hours", 24):
                    continue

            logger.info("Refreshing tracked product: %s (%s)", item["asin"], item.get("title", "")[:40])
            try:
                await self._refresh_product(item)
            except Exception as e:
                logger.error("Failed to refresh %s: %s", item["asin"], e)

    async def _refresh_product(self, item: dict):
        """Re-scrape a product ASIN, take a snapshot, and detect changes."""
        asin = item["asin"]
        now = datetime.now(timezone.utc)

        # Scrape product detail (BSR, features, description)
        detail = await scraper.get_product_detail(asin)

        # Also search for it to get price/rating/reviews/badges
        search_data = await scraper.search_products(asin, page=1)
        search_match = next((p for p in search_data if p.get("asin") == asin), None)

        # Merge data
        new_price = None
        new_rating = None
        new_reviews = None
        new_bsr = None
        new_bsr_category = item.get("current_bsr_category")
        new_best_seller = item.get("current_is_best_seller", False)
        new_amazon_choice = item.get("current_is_amazon_choice", False)
        new_monthly_bought = item.get("current_monthly_bought")
        new_features = item.get("features")
        new_description = item.get("description")

        if search_match:
            new_price = search_match.get("price")
            new_rating = search_match.get("rating")
            new_reviews = search_match.get("reviews_count")
            new_best_seller = search_match.get("is_best_seller", False)
            new_amazon_choice = search_match.get("is_amazon_choice", False)
            new_monthly_bought = search_match.get("monthly_bought")

        if detail:
            new_bsr = detail.get("bsr")
            if detail.get("bsr_category"):
                new_bsr_category = detail["bsr_category"]
            if detail.get("features"):
                new_features = detail["features"]
            if detail.get("description"):
                new_description = detail["description"]

        # Build snapshot
        snapshot = {
            "date": now.isoformat(),
            "price": new_price,
            "bsr": new_bsr,
            "rating": new_rating,
            "reviews_count": new_reviews,
            "is_best_seller": new_best_seller,
            "is_amazon_choice": new_amazon_choice,
            "monthly_bought": new_monthly_bought,
        }

        # Detect changes and create notifications
        await self._detect_changes(item, snapshot)

        # Update document
        update_set: dict = {
            "last_checked_at": now,
        }
        if new_price is not None:
            update_set["current_price"] = new_price
        if new_bsr is not None:
            update_set["current_bsr"] = new_bsr
        if new_bsr_category:
            update_set["current_bsr_category"] = new_bsr_category
        if new_rating is not None:
            update_set["current_rating"] = new_rating
        if new_reviews is not None:
            update_set["current_reviews"] = new_reviews
        update_set["current_is_best_seller"] = new_best_seller
        update_set["current_is_amazon_choice"] = new_amazon_choice
        update_set["current_monthly_bought"] = new_monthly_bought
        if new_features:
            update_set["features"] = new_features
        if new_description:
            update_set["description"] = new_description

        await _database.db.tracked_products.update_one(
            {"_id": item["_id"]},
            {
                "$set": update_set,
                "$push": {
                    "snapshots": {
                        "$each": [snapshot],
                        "$slice": -MAX_SNAPSHOTS,
                    },
                },
            },
        )

    async def _detect_changes(self, item: dict, snapshot: dict):
        """Compare new snapshot with current values and create notifications."""
        asin = item["asin"]
        title = item.get("title", asin)[:60]
        alerts: list[dict] = []

        # Price change > 10%
        old_price = item.get("current_price")
        new_price = snapshot.get("price")
        if old_price and new_price and old_price > 0:
            pct = ((new_price - old_price) / old_price) * 100
            if abs(pct) >= 10:
                direction = "bajó" if pct < 0 else "subió"
                severity = "success" if pct < 0 else "warning"
                alerts.append({
                    "type": "price_change",
                    "title": f"Precio {direction}: {title}",
                    "message": f"El precio de {asin} {direction} {abs(pct):.0f}% (${old_price:.2f} → ${new_price:.2f})",
                    "severity": severity,
                })

        # BSR improvement > 20%
        old_bsr = item.get("current_bsr")
        new_bsr = snapshot.get("bsr")
        if old_bsr and new_bsr and old_bsr > 0:
            bsr_pct = ((old_bsr - new_bsr) / old_bsr) * 100  # positive = improved
            if bsr_pct >= 20:
                alerts.append({
                    "type": "bsr_improved",
                    "title": f"BSR mejoró: {title}",
                    "message": f"El BSR de {asin} mejoró {bsr_pct:.0f}% (#{old_bsr:,} → #{new_bsr:,}). Ventas creciendo.",
                    "severity": "success",
                })
            elif bsr_pct <= -20:
                alerts.append({
                    "type": "bsr_declined",
                    "title": f"BSR empeoró: {title}",
                    "message": f"El BSR de {asin} empeoró {abs(bsr_pct):.0f}% (#{old_bsr:,} → #{new_bsr:,}). Ventas bajando.",
                    "severity": "warning",
                })

        # Badge gained/lost
        old_bs = item.get("current_is_best_seller", False)
        new_bs = snapshot.get("is_best_seller", False)
        if not old_bs and new_bs:
            alerts.append({
                "type": "badge_gained",
                "title": f"Best Seller: {title}",
                "message": f"{asin} acaba de obtener el badge Best Seller.",
                "severity": "success",
            })
        elif old_bs and not new_bs:
            alerts.append({
                "type": "badge_lost",
                "title": f"Perdió Best Seller: {title}",
                "message": f"{asin} perdió el badge Best Seller.",
                "severity": "warning",
            })

        old_ac = item.get("current_is_amazon_choice", False)
        new_ac = snapshot.get("is_amazon_choice", False)
        if not old_ac and new_ac:
            alerts.append({
                "type": "badge_gained",
                "title": f"Amazon Choice: {title}",
                "message": f"{asin} acaba de obtener el badge Amazon's Choice.",
                "severity": "success",
            })
        elif old_ac and not new_ac:
            alerts.append({
                "type": "badge_lost",
                "title": f"Perdió Amazon Choice: {title}",
                "message": f"{asin} perdió el badge Amazon's Choice.",
                "severity": "warning",
            })

        # Reviews jump (>50 new reviews in one check)
        old_reviews = item.get("current_reviews")
        new_reviews = snapshot.get("reviews_count")
        if old_reviews and new_reviews:
            diff = new_reviews - old_reviews
            if diff >= 50:
                alerts.append({
                    "type": "reviews_spike",
                    "title": f"Reviews +{diff}: {title}",
                    "message": f"{asin} recibió {diff} reviews nuevas ({old_reviews:,} → {new_reviews:,}). Velocidad alta.",
                    "severity": "info",
                })

        # Insert notifications
        for alert in alerts:
            nid = await _database.get_next_id("notifications")
            notif = new_notification_doc(nid, **alert)
            await _database.db.notifications.insert_one(notif)

    # ── Stats ────────────────────────────────────────────────────────

    async def get_stats(self) -> dict:
        items = await _database.db.tracked_products.find(
            {"is_active": True},
        ).to_list(length=200)

        total = len(items)
        with_bsr = [i for i in items if i.get("current_bsr")]
        avg_bsr = round(sum(i["current_bsr"] for i in with_bsr) / len(with_bsr)) if with_bsr else None
        prices = [i["current_price"] for i in items if i.get("current_price")]
        avg_price = round(sum(prices) / len(prices), 2) if prices else None
        paused = sum(1 for i in items if i.get("is_paused"))
        best_sellers = sum(1 for i in items if i.get("current_is_best_seller"))

        return {
            "total": total,
            "avg_bsr": avg_bsr,
            "avg_price": avg_price,
            "paused": paused,
            "best_sellers": best_sellers,
            "limit": MAX_TRACKED,
        }


product_tracker = ProductTracker()
