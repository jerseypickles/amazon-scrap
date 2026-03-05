from __future__ import annotations

import asyncio
import logging
import random
import re
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup

from app.config import settings

logger = logging.getLogger(__name__)

USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
]

AMAZON_BASE_URL = "https://www.amazon.com"
SCRAPER_API_BASE = "https://api.scraperapi.com"


class AmazonScraper:
    def __init__(self):
        self.api_key = settings.scraper_api_key
        self.use_api = bool(self.api_key)

    def _get_headers(self) -> dict:
        return {
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
        }

    # ── Structured API methods (primary when API key exists) ──────────

    async def _structured_search(self, keyword: str, page: int = 1) -> tuple[list[dict], int]:
        """Use ScraperAPI structured Amazon search endpoint."""
        url = (
            f"{SCRAPER_API_BASE}/structured/amazon/search"
            f"?api_key={self.api_key}"
            f"&query={quote_plus(keyword)}"
            f"&country_code=us"
            f"&page={page}"
        )
        async with httpx.AsyncClient(timeout=90.0) as client:
            try:
                resp = await client.get(url)
                if resp.status_code != 200:
                    logger.warning(
                        "Structured search got status %d for '%s' page %d",
                        resp.status_code, keyword, page,
                    )
                    return [], 0
                data = resp.json()
            except (httpx.HTTPError, ValueError) as e:
                logger.error("Structured search error for '%s': %s", keyword, e)
                return [], 0

        # Total results count (Amazon's estimate of matching products)
        total_results = data.get("total_results") or data.get("totalResults") or 0
        if isinstance(total_results, str):
            total_results = int(total_results.replace(",", "").replace(".", "")) if total_results.strip() else 0

        results = data.get("results", [])
        products = []
        # Log first item's raw keys for debugging field mapping
        if results:
            sample = results[0]
            logger.info(
                "ScraperAPI raw keys for '%s': %s",
                keyword, list(sample.keys()),
            )
            logger.info(
                "ScraperAPI sample fields: has_prime=%s, is_prime=%s, is_best_seller=%s, "
                "is_amazon_choice=%s, brand=%s, amazon_brand=%s, type=%s",
                sample.get("has_prime"), sample.get("is_prime"),
                sample.get("is_best_seller"), sample.get("is_amazon_choice"),
                sample.get("brand"), sample.get("amazon_brand"),
                sample.get("type"),
            )
        for item in results:
            try:
                product = self._parse_structured_item(item, keyword)
                if product and product.get("title"):
                    products.append(product)
            except Exception as e:
                logger.debug("Error parsing structured item: %s", e)
                continue

        logger.info(
            "Structured search: '%s' page %d → %d products (total_results=%s)",
            keyword, page, len(products), total_results,
        )
        return products, int(total_results) if total_results else 0

    @staticmethod
    def _extract_brand_from_title(title: str) -> str | None:
        """Try to extract brand name from the beginning of a product title.

        Amazon product titles typically start with the brand name, e.g.:
        "ARM & HAMMER Plus OxiClean ..." → "ARM & HAMMER"
        "Tide PODS Laundry Detergent ..." → "Tide"
        """
        if not title:
            return None
        # Common patterns: "BrandName Product..." or "BrandName - Product..."
        # Take the first word(s) before a common separator or product descriptor
        # Heuristic: the brand is usually the first 1-3 capitalized words
        parts = title.split()
        if not parts:
            return None

        brand_words = []
        for word in parts[:5]:  # Check first 5 words max
            # Stop at common product words (lowercase or very long)
            clean = word.rstrip(",").rstrip("-").rstrip("|")
            if clean.lower() in (
                "laundry", "liquid", "powder", "pods", "pack", "count",
                "for", "with", "and", "the", "in", "of", "free", "plus",
                "natural", "organic", "premium", "ultra", "original",
                "fresh", "clean", "scent", "fragrance", "unscented",
            ):
                break
            if len(clean) > 1 and (clean[0].isupper() or clean.isupper() or "&" in clean):
                brand_words.append(clean)
            else:
                break

        if brand_words:
            brand = " ".join(brand_words)
            # Avoid returning just a single short word as brand
            if len(brand) >= 2:
                return brand
        return None

    def _parse_structured_item(self, item: dict, keyword: str) -> dict | None:
        asin = item.get("asin", "")
        if not asin:
            return None

        # Price — structured endpoint returns object or direct value
        price = None
        original_price = None
        price_data = item.get("price_lower", item.get("price"))
        if isinstance(price_data, (int, float)):
            price = float(price_data)
        elif isinstance(price_data, dict):
            price = price_data.get("price")
            if isinstance(price, str):
                price = float(price.replace("$", "").replace(",", "")) if price else None

        orig_data = item.get("original_price")
        if isinstance(orig_data, (int, float)):
            original_price = float(orig_data)
        elif isinstance(orig_data, dict):
            op = orig_data.get("price")
            if isinstance(op, str):
                original_price = float(op.replace("$", "").replace(",", "")) if op else None
            elif isinstance(op, (int, float)):
                original_price = float(op)

        # Monthly bought — e.g. "60K+ bought in past month"
        monthly_bought = item.get("purchase_history_message") or item.get("recently_bought") or None

        # Brand — ScraperAPI search doesn't return brand, extract from title
        title = item.get("name", "")
        brand = item.get("brand") or None
        if not brand:
            brand = self._extract_brand_from_title(title)

        # Prime — check multiple possible field names
        is_prime = bool(
            item.get("has_prime")
            or item.get("is_prime")
            or item.get("isPrime")
        )

        # Best Seller / Amazon Choice — check multiple field names
        is_best_seller = bool(
            item.get("is_best_seller")
            or item.get("isBestSeller")
            or item.get("best_seller")
        )
        is_amazon_choice = bool(
            item.get("is_amazon_choice")
            or item.get("isAmazonChoice")
            or item.get("amazon_choice")
        )

        return {
            "asin": asin,
            "title": title,
            "brand": brand,
            "price": price,
            "original_price": original_price,
            "rating": float(item["stars"]) if item.get("stars") else None,
            "reviews_count": int(item["total_reviews"]) if item.get("total_reviews") else None,
            "image_url": item.get("image") or item.get("image_url") or None,
            "product_url": item.get("url") or f"{AMAZON_BASE_URL}/dp/{asin}",
            "is_prime": is_prime,
            "is_best_seller": is_best_seller,
            "is_amazon_choice": is_amazon_choice,
            "monthly_bought": monthly_bought,
            "search_keyword": keyword,
        }

    async def _structured_product_detail(self, asin: str) -> dict | None:
        """Use ScraperAPI structured Amazon product endpoint.

        Extracts comprehensive product data: BSR, pricing, ratings,
        seller info, product specs, availability, and more.
        """
        url = (
            f"{SCRAPER_API_BASE}/structured/amazon/product"
            f"?api_key={self.api_key}"
            f"&asin={asin}"
            f"&country_code=us"
        )
        async with httpx.AsyncClient(timeout=90.0) as client:
            try:
                resp = await client.get(url)
                if resp.status_code != 200:
                    logger.warning("Structured product got status %d for %s", resp.status_code, asin)
                    return None
                data = resp.json()
            except (httpx.HTTPError, ValueError) as e:
                logger.error("Structured product error for %s: %s", asin, e)
                return None

        # BSR from product_category or bestsellers_rank
        bsr = None
        bsr_category = None
        bsr_data = data.get("bestsellers_rank", [])
        if isinstance(bsr_data, list) and bsr_data:
            top = bsr_data[0]
            bsr = top.get("rank")
            bsr_category = top.get("category")
        elif data.get("product_category"):
            bsr_category = data["product_category"]

        # Features / bullet points
        features = None
        feature_bullets: list[str] = []
        feat_list = data.get("feature_bullets", [])
        if isinstance(feat_list, list) and feat_list:
            feature_bullets = [str(f) for f in feat_list[:10]]
            features = " | ".join(feature_bullets[:5])

        # Description
        description = data.get("product_description") or data.get("description") or None

        # Title from product page
        title = data.get("name") or None

        # Brand
        brand = data.get("brand") or None

        # Price — parse from string like "$29.95"
        price = None
        pricing_str = data.get("pricing")
        if isinstance(pricing_str, str):
            price_match = re.search(r"\$?([\d,]+\.?\d*)", pricing_str)
            if price_match:
                try:
                    price = float(price_match.group(1).replace(",", ""))
                except ValueError:
                    pass

        # Rating & reviews from product page
        rating = None
        if data.get("average_rating"):
            try:
                rating = float(data["average_rating"])
            except (ValueError, TypeError):
                pass

        total_ratings = None
        if data.get("total_ratings"):
            try:
                total_ratings = int(data["total_ratings"])
            except (ValueError, TypeError):
                pass

        total_reviews = None
        if data.get("total_reviews"):
            try:
                total_reviews = int(data["total_reviews"])
            except (ValueError, TypeError):
                pass

        # Rating breakdown (1-5 stars percentages)
        rating_breakdown = {}
        for stars in range(1, 6):
            key = f"{stars}_star_percentage"
            if data.get(key) is not None:
                try:
                    rating_breakdown[f"{stars}_star"] = float(str(data[key]).replace("%", ""))
                except (ValueError, TypeError):
                    pass

        # Seller info
        seller_name = data.get("seller_name") or data.get("sold_by") or None
        seller_id = data.get("seller_id") or None

        # Availability
        availability = data.get("availability_status") or None

        # Shipping
        shipping_price = data.get("shipping_price") or None
        shipping_condition = data.get("shipping_condition") or None

        # Coupon & A+ content
        has_coupon = bool(data.get("is_coupon_exists"))
        has_aplus = bool(data.get("aplus_present"))

        # Product information (dimensions, weight, manufacturer, etc.)
        product_info = data.get("product_information", {})
        dimensions = product_info.get("product_dimensions") if isinstance(product_info, dict) else None
        weight = product_info.get("item_weight") if isinstance(product_info, dict) else None
        manufacturer = product_info.get("manufacturer") if isinstance(product_info, dict) else None
        date_first_available = product_info.get("date_first_available") if isinstance(product_info, dict) else None
        model_number = product_info.get("item_model_number") if isinstance(product_info, dict) else None

        # Images
        images: list[str] = []
        hi_res = data.get("high_res_images")
        if isinstance(hi_res, list):
            images = [img for img in hi_res if isinstance(img, str)][:8]
        if not images:
            img_list = data.get("images")
            if isinstance(img_list, list):
                images = [img for img in img_list if isinstance(img, str)][:8]

        # Variations / customization options
        variations: list[dict] = []
        customs = data.get("customization_options")
        if isinstance(customs, dict):
            for option_name, option_values in customs.items():
                if isinstance(option_values, list):
                    parsed_values: list[dict] = []
                    for ov in option_values[:20]:
                        if isinstance(ov, dict):
                            parsed_values.append({
                                "value": ov.get("value") or ov.get("name") or str(ov.get("asin", "")),
                                "asin": ov.get("asin"),
                                "is_selected": ov.get("is_selected", False),
                            })
                        elif isinstance(ov, str):
                            parsed_values.append({"value": ov, "asin": None, "is_selected": False})
                    if parsed_values:
                        variations.append({"name": option_name, "values": parsed_values})

        # Top reviews from product page
        top_reviews: list[dict] = []
        reviews_raw = data.get("reviews")
        if isinstance(reviews_raw, list):
            for rev in reviews_raw[:5]:
                if isinstance(rev, dict):
                    top_reviews.append({
                        "stars": rev.get("stars"),
                        "title": rev.get("title"),
                        "text": (rev.get("review") or "")[:500],
                        "date": rev.get("date"),
                        "verified": rev.get("verified_purchase", False),
                        "author": rev.get("username"),
                    })

        # ── Additional fields from Product API ──
        full_description = data.get("full_description") or None
        list_price = None
        lp_str = data.get("list_price")
        if isinstance(lp_str, str):
            lp_match = re.search(r"\$?([\d,]+\.?\d*)", lp_str)
            if lp_match:
                try:
                    list_price = float(lp_match.group(1).replace(",", ""))
                except ValueError:
                    pass
        elif isinstance(lp_str, (int, float)):
            list_price = float(lp_str)

        ships_from = data.get("ships_from") or None
        total_answered_questions = None
        taq = data.get("total_answered_questions")
        if taq is not None:
            try:
                total_answered_questions = int(taq)
            except (ValueError, TypeError):
                pass

        small_description = data.get("small_description") or None
        brand_url = data.get("brand_url") or None

        # Dynamic product_information fields (category-specific)
        product_info_extra: dict = {}
        if isinstance(product_info, dict):
            skip_keys = {"product_dimensions", "item_weight", "manufacturer",
                         "date_first_available", "item_model_number", "asin",
                         "best_sellers_rank", "customer_reviews"}
            for k, v in product_info.items():
                if k not in skip_keys and v:
                    product_info_extra[k] = str(v)

        return {
            "asin": asin,
            "title": title,
            "brand": brand,
            "price": price,
            "list_price": list_price,
            "rating": rating,
            "total_ratings": total_ratings,
            "total_reviews": total_reviews,
            "bsr": bsr,
            "bsr_category": bsr_category,
            "description": description,
            "full_description": full_description,
            "small_description": small_description,
            "features": features,
            "feature_bullets": feature_bullets,
            "seller_name": seller_name,
            "seller_id": seller_id,
            "availability": availability,
            "shipping_price": shipping_price,
            "shipping_condition": shipping_condition,
            "ships_from": ships_from,
            "has_coupon": has_coupon,
            "has_aplus": has_aplus,
            "rating_breakdown": rating_breakdown or None,
            "dimensions": dimensions,
            "weight": weight,
            "manufacturer": manufacturer,
            "date_first_available": date_first_available,
            "model_number": model_number,
            "brand_url": brand_url,
            "total_answered_questions": total_answered_questions,
            "product_info_extra": product_info_extra or None,
            "images": images or None,
            "variations": variations or None,
            "top_reviews": top_reviews or None,
        }

    async def _structured_offers(self, asin: str) -> list[dict]:
        """Use ScraperAPI structured Amazon offers endpoint.

        Returns all sellers/offers for an ASIN with pricing, Prime, FBA status.
        Costs 1 extra API credit per call.
        """
        url = (
            f"{SCRAPER_API_BASE}/structured/amazon/offers"
            f"?api_key={self.api_key}"
            f"&asin={asin}"
            f"&country_code=us"
        )
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                resp = await client.get(url)
                if resp.status_code != 200:
                    logger.warning("Structured offers got status %d for %s", resp.status_code, asin)
                    return []
                data = resp.json()
            except (httpx.HTTPError, ValueError) as e:
                logger.error("Structured offers error for %s: %s", asin, e)
                return []

        offers_raw = data.get("offers", [])
        if not isinstance(offers_raw, list):
            return []

        offers: list[dict] = []
        for o in offers_raw[:20]:
            if not isinstance(o, dict):
                continue
            offer_price = None
            price_val = o.get("price")
            if isinstance(price_val, (int, float)):
                offer_price = float(price_val)
            elif isinstance(price_val, str):
                pm = re.search(r"\$?([\d,]+\.?\d*)", price_val)
                if pm:
                    try:
                        offer_price = float(pm.group(1).replace(",", ""))
                    except ValueError:
                        pass

            offers.append({
                "seller_name": o.get("seller_name") or o.get("sold_by") or "Unknown",
                "seller_id": o.get("seller_id") or None,
                "price": offer_price,
                "shipping_price": o.get("shipping_price") or None,
                "condition": o.get("condition") or "New",
                "is_prime": bool(o.get("is_prime")),
                "is_fba": bool(o.get("is_fba") or o.get("fulfilled_by_amazon")),
                "seller_rating": o.get("seller_rating") or None,
                "seller_reviews_count": o.get("seller_num_ratings") or o.get("seller_reviews") or None,
                "delivery_info": o.get("delivery") or o.get("delivery_info") or None,
                "is_buy_box_winner": bool(o.get("is_buybox_winner") or o.get("buy_box_winner")),
            })

        logger.info("Structured offers: %s → %d offers", asin, len(offers))
        return offers

    async def get_offers(self, asin: str) -> list[dict]:
        """Get all seller offers for an ASIN."""
        if not self.use_api:
            return []
        return await self._structured_offers(asin)

    # ── Public API (auto-selects structured vs HTML) ──────────────────

    async def search_products(self, keyword: str, page: int = 1) -> tuple[list[dict], int]:
        """Return (products, total_results_count)."""
        if self.use_api:
            products, total_results = await self._structured_search(keyword, page)
            if products:
                return products, total_results
            logger.info("Structured search empty, falling back to HTML scrape for '%s'", keyword)
        return await self._html_search(keyword, page), 0

    async def search_products_multi_page(self, keyword: str, pages: int = 2) -> tuple[list[dict], int]:
        """Return (all_products, total_results_count)."""
        all_products = []
        total_results = 0
        for page in range(1, pages + 1):
            products, page_total = await self.search_products(keyword, page)
            all_products.extend(products)
            if page == 1:
                total_results = page_total
            if page < pages:
                await asyncio.sleep(random.uniform(1.0, 3.0))
        return all_products, total_results

    async def get_product_detail(self, asin: str) -> dict | None:
        if self.use_api:
            detail = await self._structured_product_detail(asin)
            if detail:
                return detail
            logger.info("Structured product empty, falling back to HTML scrape for %s", asin)
        return await self._html_product_detail(asin)

    # ── HTML fallback methods (original scraping logic) ───────────────

    async def _fetch_page(self, url: str) -> str | None:
        if self.use_api:
            api_url = f"{SCRAPER_API_BASE}?api_key={self.api_key}&url={quote_plus(url)}&country_code=us"
            target_url = api_url
        else:
            target_url = url

        async with httpx.AsyncClient(
            timeout=60.0, follow_redirects=True
        ) as client:
            try:
                resp = await client.get(target_url, headers=self._get_headers())
                if resp.status_code == 200:
                    return resp.text
                logger.warning("Got status %d for %s", resp.status_code, url)
                return None
            except httpx.HTTPError as e:
                logger.error("HTTP error fetching %s: %s", url, e)
                return None

    async def _html_search(self, keyword: str, page: int = 1) -> list[dict]:
        url = f"{AMAZON_BASE_URL}/s?k={quote_plus(keyword)}&page={page}"
        html = await self._fetch_page(url)
        if not html:
            return []
        return self._parse_search_results(html, keyword)

    async def _html_product_detail(self, asin: str) -> dict | None:
        url = f"{AMAZON_BASE_URL}/dp/{asin}"
        html = await self._fetch_page(url)
        if not html:
            return None
        return self._parse_product_detail(html, asin)

    def _parse_search_results(self, html: str, keyword: str) -> list[dict]:
        soup = BeautifulSoup(html, "lxml")
        products = []

        items = soup.select('[data-component-type="s-search-result"]')
        for item in items:
            try:
                product = self._extract_search_item(item, keyword)
                if product and product.get("title"):
                    products.append(product)
            except Exception as e:
                logger.debug("Error parsing item: %s", e)
                continue

        return products

    def _extract_search_item(self, item, keyword: str) -> dict | None:
        asin = item.get("data-asin", "")
        if not asin:
            return None

        # Title
        title_el = item.select_one("h2 a span") or item.select_one("h2 span")
        title = title_el.get_text(strip=True) if title_el else ""

        # Price
        price = None
        price_whole = item.select_one(".a-price-whole")
        price_frac = item.select_one(".a-price-fraction")
        if price_whole:
            try:
                whole = price_whole.get_text(strip=True).replace(",", "").rstrip(".")
                frac = price_frac.get_text(strip=True) if price_frac else "00"
                price = float(f"{whole}.{frac}")
            except ValueError:
                pass

        # Original price (strikethrough)
        original_price = None
        orig_el = item.select_one(".a-text-price .a-offscreen")
        if orig_el:
            try:
                original_price = float(
                    orig_el.get_text(strip=True).replace("$", "").replace(",", "")
                )
            except ValueError:
                pass

        # Rating
        rating = None
        rating_el = item.select_one(".a-icon-alt")
        if rating_el:
            try:
                rating_text = rating_el.get_text(strip=True)
                rating = float(rating_text.split(" ")[0])
            except (ValueError, IndexError):
                pass

        # Reviews count
        reviews_count = None
        reviews_el = item.select_one('[aria-label*="stars"] + span a span') or item.select_one(
            ".a-size-base.s-underline-text"
        )
        if reviews_el:
            try:
                reviews_count = int(
                    reviews_el.get_text(strip=True).replace(",", "").replace(".", "")
                )
            except ValueError:
                pass

        # Brand
        brand = None
        brand_el = item.select_one(".a-size-base-plus.a-color-base") or item.select_one(
            ".a-row .a-size-base:first-child"
        )
        if brand_el:
            brand = brand_el.get_text(strip=True)

        # Image
        image_url = None
        img_el = item.select_one(".s-image")
        if img_el:
            image_url = img_el.get("src", "")

        # Prime
        is_prime = bool(item.select_one(".a-icon-prime"))

        # Product URL — try to extract from link, fallback to ASIN-based URL
        link_el = item.select_one("h2 a")
        product_url = None
        if link_el:
            href = link_el.get("href", "")
            if href.startswith("/"):
                product_url = f"{AMAZON_BASE_URL}{href}"
            elif href:
                product_url = href
        if not product_url and asin:
            product_url = f"{AMAZON_BASE_URL}/dp/{asin}"

        return {
            "asin": asin,
            "title": title,
            "brand": brand,
            "price": price,
            "original_price": original_price,
            "rating": rating,
            "reviews_count": reviews_count,
            "image_url": image_url,
            "product_url": product_url,
            "is_prime": is_prime,
            "is_best_seller": False,
            "is_amazon_choice": False,
            "monthly_bought": None,
            "search_keyword": keyword,
        }

    def _parse_product_detail(self, html: str, asin: str) -> dict:
        soup = BeautifulSoup(html, "lxml")

        # BSR
        bsr = None
        bsr_category = None
        bsr_el = soup.select_one("#SalesRank") or soup.find(
            "th", string=lambda t: t and "Best Sellers Rank" in t
        )
        if bsr_el:
            parent = bsr_el.parent if bsr_el.name == "th" else bsr_el
            text = parent.get_text()
            match = re.search(r"#([\d,]+)\s+in\s+(.+?)(?:\(|$)", text)
            if match:
                try:
                    bsr = int(match.group(1).replace(",", ""))
                    bsr_category = match.group(2).strip()
                except ValueError:
                    pass

        # Description
        description = None
        desc_el = soup.select_one("#productDescription p") or soup.select_one(
            "#productDescription"
        )
        if desc_el:
            description = desc_el.get_text(strip=True)

        # Features/bullet points
        features = None
        feat_el = soup.select("#feature-bullets li span.a-list-item")
        if feat_el:
            features = " | ".join(f.get_text(strip=True) for f in feat_el[:5])

        return {
            "asin": asin,
            "bsr": bsr,
            "bsr_category": bsr_category,
            "description": description,
            "features": features,
        }


scraper = AmazonScraper()
