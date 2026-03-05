from __future__ import annotations

import json
import logging

import anthropic

from app.config import settings
import app.database as _database
from app.models.watchlist import new_ai_insight_doc
from app.services.analyzer import analyzer

logger = logging.getLogger(__name__)

DEFAULT_BUDGET = 10000  # $10,000 USD default


class AIAdvisor:
    def __init__(self):
        self._client = None

    @property
    def client(self) -> anthropic.Anthropic:
        if self._client is None:
            self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        return self._client

    def _build_analysis_context(self, analysis_data: dict, budget: int | None = None) -> str:
        b = budget or DEFAULT_BUDGET
        ctx = f"""
NICHO: {analysis_data.get('keyword', 'desconocido')}
PRODUCTOS ANALIZADOS: {analysis_data.get('total_products', 0)}

PRECIOS:
- Precio Promedio: ${analysis_data.get('avg_price', 'N/A')}
- Precio Mediano: ${analysis_data.get('median_price', 'N/A')}
- Precio Mínimo: ${analysis_data.get('min_price', 'N/A')}
- Precio Máximo: ${analysis_data.get('max_price', 'N/A')}

REVIEWS Y RATINGS:
- Rating Promedio: {analysis_data.get('avg_rating', 'N/A')} / 5
- Reviews Promedio: {analysis_data.get('avg_reviews', 'N/A')}
- Reviews Mediana: {analysis_data.get('median_reviews', 'N/A')}

MÉTRICAS EXTENDIDAS:
- % Productos Prime: {analysis_data.get('prime_percentage', 'N/A')}%
- % Productos con "Monthly Bought": {analysis_data.get('monthly_bought_percentage', 'N/A')}%

COMPETENCIA:
- Número de Marcas: {analysis_data.get('brand_count', 'N/A')}
- Market Share Top 3 Marcas: {analysis_data.get('top3_brand_share', 'N/A')}%

SCORES DE OPORTUNIDAD (0-100):
- Score General: {analysis_data.get('opportunity_score', 'N/A')}
- Score Demanda: {analysis_data.get('demand_score', 'N/A')}
- Score Competencia: {analysis_data.get('competition_score', 'N/A')} (más alto = menos competencia)
- Score Precio: {analysis_data.get('price_score', 'N/A')}
- Score Calidad: {analysis_data.get('quality_gap_score', 'N/A')} (más alto = más espacio para mejorar)

REVENUE MENSUAL ESTIMADO POR PRODUCTO: ${analysis_data.get('revenue_estimate', 'N/A')}
PRESUPUESTO DISPONIBLE: ${b:,}
"""
        # Score breakdowns — show which signals compose each score
        for label, key in [
            ("DESGLOSE DEMANDA", "demand_breakdown"),
            ("DESGLOSE COMPETENCIA", "competition_breakdown"),
            ("DESGLOSE PRECIO", "price_breakdown"),
            ("DESGLOSE CALIDAD", "quality_breakdown"),
        ]:
            breakdown = analysis_data.get(key) or []
            if breakdown:
                ctx += f"\n{label}:\n"
                for s in breakdown:
                    if isinstance(s, dict):
                        ctx += f"- {s.get('signal', '?')}: valor={s.get('value', '?')}, score={s.get('score', 0)}, peso={s.get('weight', 0)}, ponderado={s.get('weighted', 0)}\n"

        # Market saturation data
        sat = analysis_data.get('saturation')
        if sat and isinstance(sat, dict):
            ctx += f"\nSATURACIÓN DEL MERCADO:\n"
            ctx += f"- Newcomers (<50 reviews): {sat.get('newcomers', 0)} ({sat.get('newcomers_pct', 0):.0f}%)\n"
            ctx += f"- Growing (50-200 reviews): {sat.get('growing', 0)} ({sat.get('growing_pct', 0):.0f}%)\n"
            ctx += f"- Established (200-1000 reviews): {sat.get('established', 0)} ({sat.get('established_pct', 0):.0f}%)\n"
            ctx += f"- Dominant (>1000 reviews): {sat.get('dominant', 0)} ({sat.get('dominant_pct', 0):.0f}%)\n"
            ctx += f"- Veredicto saturación: {sat.get('verdict', 'N/A')}\n"

        # Price opportunity window
        price_opp = analysis_data.get('price_opportunity')
        if price_opp and isinstance(price_opp, dict):
            ctx += f"\nVENTANA DE OPORTUNIDAD DE PRECIO:\n"
            ctx += f"- Mejor rango: {price_opp.get('best_range', 'N/A')}\n"
            ranges = price_opp.get('ranges', [])
            for r in ranges:
                if isinstance(r, dict):
                    ctx += f"  · {r.get('range', '?')}: {r.get('count', 0)} productos, avg reviews={r.get('avg_reviews', 0):.0f}, entrada={r.get('entry_ease', '?')}, demanda={'Sí' if r.get('has_demand') else 'No'}\n"

        # Enriched brand data
        brands = analysis_data.get('top_brands', [])
        if brands:
            ctx += "\nTOP MARCAS (con nivel de amenaza):\n"
            for b in brands[:8]:
                if isinstance(b, dict):
                    threat = b.get('threat_level', 'low')
                    badges = []
                    if b.get('best_seller_count', 0) > 0:
                        badges.append(f"{b['best_seller_count']} Best Seller")
                    if b.get('amazon_choice_count', 0) > 0:
                        badges.append(f"{b['amazon_choice_count']} Amazon Choice")
                    badge_str = f" [{', '.join(badges)}]" if badges else ""
                    ctx += (
                        f"- {b.get('name', '?')}: {b.get('count', 0)} productos, "
                        f"{b.get('market_share', 0):.1f}% share, avg ${b.get('avg_price', 'N/A')}, "
                        f"{b.get('avg_rating', 'N/A')}★, {b.get('total_reviews', 0)} reviews totales, "
                        f"amenaza={threat}{badge_str}\n"
                    )

        price_dist = analysis_data.get('price_distribution', [])
        if price_dist:
            ctx += "\nDISTRIBUCIÓN DE PRECIOS:\n"
            for p in price_dist:
                if isinstance(p, dict):
                    ctx += f"- {p.get('range', '?')}: {p.get('count', 0)} productos\n"

        return ctx

    async def analyze_niche_ai(self, analysis_id: int, budget: int | None = None, db_ref=None) -> dict:
        analysis_resp = await analyzer.get_analysis_by_id(analysis_id)
        if not analysis_resp:
            raise ValueError("Analysis not found")

        b = budget or DEFAULT_BUDGET
        analysis_data = analysis_resp.model_dump()
        context = self._build_analysis_context(analysis_data, budget=b)

        prompt = f"""Eres un experto estratega de Amazon FBA, sourcing desde China (Alibaba/1688), y Amazon PPC/Advertising.

MODELO DE NEGOCIO DEL CLIENTE (MUY IMPORTANTE - LEER COMPLETO):
El cliente tiene un modelo de 2 fases:

FASE 1 - MARCA DEL PROVEEDOR CHINO (entrada rápida):
- Comprar productos que el proveedor chino YA tiene con SU propia marca y packaging listo.
- El proveedor ya tiene marca registrada, empaque diseñado, producto terminado.
- El cliente solo compra y revende en Amazon bajo la marca del proveedor.
- Ventaja: $0 en branding, packaging listo, entrada inmediata.
- Riesgo: otros vendedores pueden vender el mismo producto en el mismo ASIN (competencia por Buy Box).
- Objetivo: VALIDAR que el nicho tiene demanda real con inversión mínima.

FASE 2 - MARCA PRIVADA (escalar si Fase 1 valida):
- Solo SI el ASIN de Fase 1 demuestra ventas consistentes, ENTONCES crear marca propia.
- Registrar trademark en USPTO, hacer Brand Registry en Amazon.
- El MISMO proveedor chino fabrica el producto pero con la marca y packaging del cliente.
- Acceso a A+ Content, Brand Store, protección de listing.
- Esto se hace DESPUÉS de validar, nunca al inicio.

IMPORTANTE: Hay nichos donde la Fase 1 NO funciona porque los compradores SOLO confían en marcas conocidas (ej: suplementos, comida para bebés, productos médicos). En esos casos, indicar que se necesita marca propia desde el inicio o evitar el nicho.

Tu cliente tiene ${b:,} USD para invertir en Fase 1.

RESPONDE TODO EN ESPAÑOL.

METODOLOGÍA DE ANÁLISIS (MUY IMPORTANTE):
Tu análisis NO debe ser una opinión superficial. Debe ser un ESTUDIO EVALUADO que demuestra que revisaste cada ángulo:
1. NO digas simplemente "NO ENTRAR" o "ENTRAR". Razona paso a paso: ¿qué dicen los datos? ¿hay formas alternativas de competir?
2. SIEMPRE evalúa Amazon PPC/Ads como vía de entrada. Incluso si las marcas dominan orgánicamente, ¿se puede competir con ads en keywords long-tail?
3. Si el veredicto es negativo, explica EXACTAMENTE qué tendría que cambiar para que fuera viable (ej: "Si la mediana de reviews bajara a 200, o si encontraras un sub-nicho con menos competencia, sería viable con $X/mes en PPC").
4. Cada conclusión debe tener su RAZONAMIENTO visible. No conclusiones sin explicación.

Analiza estos datos de Amazon US y da inteligencia accionable:

{context}

IMPORTANTE:
- Evalúa si este nicho permite revender con marca del proveedor chino (Fase 1).
- Calcula costos usando el packaging existente del proveedor (sin customización).
- Indica claramente si este nicho REQUIERE marca propia desde el inicio.
- Evalúa el riesgo de competencia por Buy Box (¿cuántos vendedores podrían vender lo mismo?).
- Si es consumible: calcula frecuencia de recompra, lifetime value.
- IMPORTANTE AMAZON PPC: Analiza la viabilidad de usar Amazon Sponsored Products para entrar al nicho. Estima CPC, ACOS, y presupuesto mensual recomendado. Evalúa si PPC hace viable un nicho que orgánicamente parece difícil. Identifica keywords long-tail que podrían tener CPC bajo.
- IMPORTANTE SUB-NICHOS: Analiza la keyword buscada. Si es un término GENÉRICO/AMPLIO (ej: "dog food", "laundry detergent", "vitamins"), identifica 3-5 sub-nichos más específicos DENTRO de esa misma categoría que podrían ser más viables. Los sub-nichos deben ser keywords reales que alguien buscaría en Amazon (ej: para "dog food" → "grain free dog food small breed", "dog food toppers", "freeze dried dog food", "dog probiotics powder"). Incluye estimación de competencia y viabilidad para cada sub-nicho. Si la keyword ya es específica (ej: "organic dog dental chews"), puedes indicar 0 sub-nichos.

Responde SOLO con JSON válido (sin markdown, sin ```):
{{
    "veredicto": "Una oración resumen (ej: 'Viable con marca de proveedor chino, márgenes del 40% y bajo riesgo de Buy Box')",
    "score_label": "excelente|bueno|moderado|difícil|evitar",
    "es_consumible": true,
    "frecuencia_recompra_semanas": 4,
    "go_no_go": {{
        "decision": "GO|NO-GO|CAUTELA",
        "margen_sin_marca": true,
        "margen_mayor_30": true,
        "reviews_mediana_menor_300": true,
        "mercado_no_saturado": true,
        "precio_en_rango_fba": true,
        "sin_certificaciones_complejas": true,
        "entrada_generica_viable": true,
        "viable_con_ppc": true,
        "resumen": "3-5 oraciones con RAZONAMIENTO completo: qué factores analizaste, qué datos sustentan la decisión, qué alternativas consideraste (incluyendo PPC), y bajo qué condiciones cambiaría el veredicto. NO des solo la conclusión — muestra el proceso de pensamiento."
    }},
    "fase_recomendada": {{
        "fase_actual": "marca_proveedor|marca_privada_necesaria",
        "requiere_marca_desde_inicio": false,
        "razon_marca": "Si puede entrar con marca del proveedor chino (y por qué), o si necesita marca propia desde el inicio",
        "riesgo_buy_box": "Evaluar riesgo de que otros vendedores se suban al mismo ASIN",
        "trigger_marca_privada": "Condición para pasar a Fase 2 (ej: 'Si superas 80 unidades/mes por 3 meses consecutivos')",
        "inversion_marca_privada": "$X,XXX estimado (USPTO trademark + Brand Registry + packaging personalizado + A+ Content)"
    }},
    "estrategia_entrada": {{
        "recomendado": true,
        "razonamiento": "2-3 oraciones de por qué sí o no entrar con marca del proveedor chino",
        "angulo_diferenciacion": "Cómo competir revendiendo marca del proveedor (ej: 'Mejor precio, envío Prime, listing optimizado en inglés')",
        "precio_objetivo": "$XX.XX - razón del precio",
        "rating_objetivo": "4.5+ estrellas - cómo lograrlo"
    }},
    "analisis_financiero": {{
        "costo_unitario_china": "$X.XX (FOB China, producto con packaging del proveedor listo)",
        "costo_envio_unidad": "$X.XX (envío marítimo + customs por unidad para MOQ típico)",
        "costo_amazon_fba": "$X.XX (FBA pick&pack + storage estimado)",
        "amazon_referral_fee": "$X.XX (15% del precio de venta típico)",
        "costo_total_por_unidad": "$X.XX",
        "precio_venta_sugerido": "$XX.XX",
        "margen_neto_unidad": "$X.XX",
        "margen_porcentaje": "XX%",
        "unidades_con_10k": "XXX unidades (primer pedido con ${b:,})",
        "moq_china": "XXX unidades (mínimo típico del proveedor)",
        "breakeven_unidades": "XXX unidades para recuperar inversión",
        "roi_6_meses": "XX% (asumiendo X unidades/mes)",
        "roi_12_meses": "XX%",
        "ltv_cliente_anual": "$XXX (precio × compras al año si es consumible)"
    }},
    "ideas_producto": [
        {{
            "nombre": "Nombre del tipo de producto a buscar con marca del proveedor",
            "descripcion": "Qué buscar en Alibaba - producto con marca y packaging listo del proveedor",
            "precio_estimado": "$XX.XX",
            "costo_china_estimado": "$X.XX por unidad (producto terminado con packaging del proveedor)",
            "margen": "XX%",
            "porque": "Por qué funcionaría revendiendo la marca del proveedor",
            "packaging": "Descripción del packaging típico que ya ofrece el proveedor",
            "tamano_sugerido": "Tamaño/contenido ideal (ej: 32oz, 60 cápsulas, etc)",
            "subscribe_save": true,
            "dificultad": "fácil|medio|difícil"
        }}
    ],
    "riesgos": [
        {{
            "riesgo": "Descripción del riesgo",
            "severidad": "alto|medio|bajo",
            "mitigacion": "Cómo mitigarlo"
        }}
    ],
    "sourcing_china": {{
        "tipo_proveedor": "Tipo de fábrica/proveedor a buscar en Alibaba/1688 que ya tenga marca propia",
        "palabras_clave_alibaba": ["keyword1", "keyword2"],
        "certificaciones_necesarias": ["FDA", "EPA", etc. según categoría],
        "tiempo_produccion_dias": 15,
        "consejo_negociacion": "Tip para negociar con proveedores chinos que ya tienen su marca lista"
    }},
    "estrategia_ppc": {{
        "viable_con_ppc": true,
        "razonamiento_ppc": "3-4 oraciones explicando POR QUÉ PPC funciona o no para este nicho. Analiza: ¿los keywords principales están dominados por marcas con presupuestos enormes? ¿Hay keywords long-tail con menos competencia? ¿El precio del producto permite absorber el costo de ads y mantener margen?",
        "cpc_estimado": "$0.80 - $1.50 (estimación basada en competitividad del nicho y precio promedio)",
        "acos_objetivo": "25-35% (objetivo realista considerando márgenes)",
        "presupuesto_mensual_ads": "$300 - $800 (recomendado para primeros 3 meses)",
        "presupuesto_diario_sugerido": "$10 - $25",
        "keywords_long_tail": [
            "keyword long-tail 1 con menor competencia",
            "keyword long-tail 2 específica",
            "keyword long-tail 3 de nicho"
        ],
        "estrategia_lanzamiento": "Descripción de estrategia PPC para los primeros 30-60-90 días: qué tipo de campañas (auto/manual), cómo escalar, cuándo optimizar",
        "riesgo_sin_ads": "Qué pasa si NO se usan ads — ¿es posible rankear orgánicamente o es imposible sin PPC?",
        "breakeven_con_ads": "Cuántas unidades/mes necesitas vender con PPC para ser rentable considerando el costo de ads"
    }},
    "ventajas_competitivas": [
        "Ventaja 1 con este modelo de reventa",
        "Ventaja 2"
    ],
    "insights_mercado": [
        "Insight clave del mercado 1",
        "Insight clave del mercado 2"
    ],
    "sub_nichos": [
        {{
            "keyword_amazon": "keyword específica para buscar en Amazon (ej: 'grain free dog food small breed')",
            "keyword_alibaba": "keyword para buscar proveedor en Alibaba/1688",
            "competencia_estimada": "baja|media|alta",
            "porque_viable": "Por qué este sub-nicho puede funcionar con ${b:,}",
            "precio_estimado_rango": "$XX - $XX"
        }}
    ],
    "proximos_pasos": [
        "Paso concreto 1 (buscar proveedor con marca lista)",
        "Paso concreto 2",
        "Paso concreto 3"
    ]
}}"""

        try:
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4000,
                messages=[{"role": "user", "content": prompt}],
            )

            content = response.content[0].text.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()

            insight_data = json.loads(content)

            # Map Spanish keys to English for frontend compatibility
            mapped = self._map_spanish_to_frontend(insight_data)

            insight_id = await _database.get_next_id("ai_insights")
            doc = new_ai_insight_doc(
                insight_id,
                analysis_id=analysis_id,
                keyword=analysis_data["keyword"],
                insight_type="full_analysis",
                content=json.dumps(insight_data),
            )
            await _database.db.ai_insights.insert_one(doc)

            return {
                "analysis_id": analysis_id,
                "keyword": analysis_data["keyword"],
                "opportunity_score": analysis_data.get("opportunity_score"),
                "insight": mapped,
                "raw_es": insight_data,
            }

        except json.JSONDecodeError:
            logger.error("Failed to parse AI response as JSON")
            return {
                "analysis_id": analysis_id,
                "keyword": analysis_data["keyword"],
                "opportunity_score": analysis_data.get("opportunity_score"),
                "insight": {"verdict": content, "score_label": "unknown", "error": "raw_response"},
                "raw_es": {},
            }
        except Exception as e:
            logger.error(f"AI analysis failed: {e}")
            raise ValueError(f"AI analysis failed: {str(e)}")

    def _map_spanish_to_frontend(self, es: dict) -> dict:
        """Map Spanish AI response to frontend-compatible structure while keeping Spanish content."""
        entry = es.get("estrategia_entrada", {})
        financials = es.get("analisis_financiero", {})
        sourcing = es.get("sourcing_china", {})

        # Go/No-Go checklist
        go_raw = es.get("go_no_go", {})
        go_no_go = None
        if go_raw:
            decision_map = {"GO": "go", "NO-GO": "no-go", "CAUTELA": "caution"}
            go_no_go = {
                "decision": decision_map.get(go_raw.get("decision", ""), go_raw.get("decision", "")),
                "margin_without_brand": go_raw.get("margen_sin_marca", False),
                "margin_above_30": go_raw.get("margen_mayor_30", False),
                "median_reviews_below_300": go_raw.get("reviews_mediana_menor_300", False),
                "market_not_saturated": go_raw.get("mercado_no_saturado", False),
                "price_in_fba_range": go_raw.get("precio_en_rango_fba", False),
                "no_complex_certs": go_raw.get("sin_certificaciones_complejas", False),
                "generic_entry_viable": go_raw.get("entrada_generica_viable", False),
                "viable_with_ppc": go_raw.get("viable_con_ppc", False),
                "summary": go_raw.get("resumen", ""),
            }

        # Phase recommendation
        phase_raw = es.get("fase_recomendada", {})
        phase_recommendation = None
        if phase_raw:
            phase_recommendation = {
                "current_phase": phase_raw.get("fase_actual", "marca_proveedor"),
                "requires_brand_from_start": phase_raw.get("requiere_marca_desde_inicio", False),
                "brand_reason": phase_raw.get("razon_marca", ""),
                "buy_box_risk": phase_raw.get("riesgo_buy_box", ""),
                "private_label_trigger": phase_raw.get("trigger_marca_privada", ""),
                "private_label_investment": phase_raw.get("inversion_marca_privada", ""),
            }

        product_ideas = []
        for idea in es.get("ideas_producto", []):
            product_ideas.append({
                "name": idea.get("nombre", ""),
                "description": idea.get("descripcion", ""),
                "estimated_price": idea.get("precio_estimado", ""),
                "why": idea.get("porque", ""),
                "packaging_idea": idea.get("packaging", ""),
                "target_margin": idea.get("margen", ""),
                "difficulty": idea.get("dificultad", ""),
                "china_cost": idea.get("costo_china_estimado", ""),
                "size_suggestion": idea.get("tamano_sugerido", ""),
                "subscribe_save": idea.get("subscribe_save", False),
            })

        risks = []
        for r in es.get("riesgos", []):
            risks.append({
                "risk": r.get("riesgo", ""),
                "severity": {"alto": "high", "medio": "medium", "bajo": "low"}.get(r.get("severidad", ""), r.get("severidad", "")),
                "mitigation": r.get("mitigacion", ""),
            })

        sub_niches = []
        for sn in es.get("sub_nichos", []):
            sub_niches.append({
                "keyword_amazon": sn.get("keyword_amazon", ""),
                "keyword_alibaba": sn.get("keyword_alibaba", ""),
                "competition": sn.get("competencia_estimada", "media"),
                "why_viable": sn.get("porque_viable", ""),
                "price_range": sn.get("precio_estimado_rango", ""),
            })

        # PPC strategy
        ppc_raw = es.get("estrategia_ppc", {})
        ppc_strategy = None
        if ppc_raw:
            ppc_strategy = {
                "viable_with_ppc": ppc_raw.get("viable_con_ppc", False),
                "ppc_reasoning": ppc_raw.get("razonamiento_ppc", ""),
                "estimated_cpc": ppc_raw.get("cpc_estimado", ""),
                "target_acos": ppc_raw.get("acos_objetivo", ""),
                "monthly_ad_budget": ppc_raw.get("presupuesto_mensual_ads", ""),
                "daily_budget_suggested": ppc_raw.get("presupuesto_diario_sugerido", ""),
                "long_tail_keywords": ppc_raw.get("keywords_long_tail", []),
                "launch_strategy": ppc_raw.get("estrategia_lanzamiento", ""),
                "risk_without_ads": ppc_raw.get("riesgo_sin_ads", ""),
                "breakeven_with_ads": ppc_raw.get("breakeven_con_ads", ""),
            }

        return {
            "verdict": es.get("veredicto", ""),
            "score_label": {"excelente": "excellent", "bueno": "good", "moderado": "moderate", "difícil": "difficult", "evitar": "avoid"}.get(es.get("score_label", ""), es.get("score_label", "")),
            "is_consumable": es.get("es_consumible", True),
            "repurchase_weeks": es.get("frecuencia_recompra_semanas"),
            "go_no_go": go_no_go,
            "phase_recommendation": phase_recommendation,
            "entry_strategy": {
                "recommended": entry.get("recomendado", False),
                "reasoning": entry.get("razonamiento", ""),
                "differentiation_angle": entry.get("angulo_diferenciacion", ""),
                "target_price": entry.get("precio_objetivo", ""),
                "target_rating": entry.get("rating_objetivo", ""),
            },
            "financials": financials,
            "sourcing": sourcing,
            "ppc_strategy": ppc_strategy,
            "product_ideas": product_ideas,
            "risks": risks,
            "sub_niches": sub_niches,
            "competitive_advantages": es.get("ventajas_competitivas", []),
            "market_insights": es.get("insights_mercado", []),
            "next_steps": es.get("proximos_pasos", []),
        }

    async def compare_niches(self, analysis_ids: list[int], budget: int | None = None, db_ref=None) -> dict:
        b = budget or DEFAULT_BUDGET
        analyses = []
        for aid in analysis_ids:
            resp = await analyzer.get_analysis_by_id(aid)
            if resp:
                analyses.append(resp.model_dump())

        if len(analyses) < 2:
            raise ValueError("Se necesitan al menos 2 análisis para comparar")

        contexts = []
        for a in analyses:
            contexts.append(self._build_analysis_context(a, budget=b))

        all_context = "\n---\n".join(contexts)

        prompt = f"""Eres un experto estratega de Amazon Private Label. RESPONDE TODO EN ESPAÑOL.
Tu cliente tiene ${b:,} USD y busca productos consumibles (recompra recurrente).

Compara estos nichos y dime cuál es mejor para empezar:

{all_context}

Responde SOLO con JSON válido (sin markdown):
{{
    "winner": "keyword del mejor nicho",
    "ranking": [
        {{
            "keyword": "keyword del nicho",
            "rank": 1,
            "score": 85,
            "reasoning": "Por qué este nicho está en esta posición"
        }}
    ],
    "recommendation": "3-4 oraciones explicando la recomendación general, considerando que son productos consumibles y el presupuesto de ${b:,}",
    "comparison_factors": [
        {{
            "factor": "Competencia",
            "best": "keyword con mejor competencia",
            "analysis": "Comparación breve de competencia entre nichos"
        }},
        {{
            "factor": "Márgenes",
            "best": "keyword con mejores márgenes",
            "analysis": "Comparación de márgenes y costos estimados"
        }},
        {{
            "factor": "Recompra",
            "best": "keyword con mayor frecuencia de recompra",
            "analysis": "Qué nicho tiene mejor ciclo de recompra"
        }}
    ]
}}"""

        try:
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}],
            )

            content = response.content[0].text.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()

            comparison = json.loads(content)

            insight_id = await _database.get_next_id("ai_insights")
            doc = new_ai_insight_doc(
                insight_id,
                analysis_id=analysis_ids[0],
                keyword=",".join(a["keyword"] for a in analyses),
                insight_type="comparison",
                content=json.dumps(comparison),
            )
            await _database.db.ai_insights.insert_one(doc)

            return {
                "niches_compared": [a["keyword"] for a in analyses],
                "comparison": comparison,
            }

        except json.JSONDecodeError:
            return {"niches_compared": [a["keyword"] for a in analyses], "comparison": {"recommendation": content}}
        except Exception as e:
            raise ValueError(f"Comparación falló: {str(e)}")

    async def get_product_ideas(self, analysis_id: int, budget: int | None = None, db_ref=None) -> dict:
        analysis_resp = await analyzer.get_analysis_by_id(analysis_id)
        if not analysis_resp:
            raise ValueError("Analysis not found")

        b = budget or DEFAULT_BUDGET
        analysis_data = analysis_resp.model_dump()
        context = self._build_analysis_context(analysis_data, budget=b)

        prompt = f"""Eres un experto en desarrollo de productos Private Label para Amazon y sourcing desde China.
RESPONDE TODO EN ESPAÑOL.
Tu cliente tiene ${b:,} USD para invertir.

Basado en estos datos, genera 5 ideas ESPECÍFICAS de productos consumibles:

{context}

Considera: gaps del mercado, precios desatendidos, oportunidades de calidad, packaging premium, y viabilidad con ${b:,}.

Responde SOLO con JSON válido (sin markdown):
{{
    "niche": "{analysis_data['keyword']}",
    "product_ideas": [
        {{
            "nombre": "Nombre específico del producto",
            "tagline": "Eslogan de marketing",
            "descripcion": "Qué es y por qué es diferente",
            "precio_venta": "$XX.XX",
            "costo_china": "$X.XX por unidad (FOB estimado)",
            "margen_estimado": "XX%",
            "features": ["feature 1", "feature 2", "feature 3"],
            "packaging": "Descripción detallada del empaque - material, diseño, qué lo hace verse premium",
            "tamano": "Tamaño/contenido (ej: 32oz, 60 caps, 200g)",
            "target_audience": "Quién compra esto",
            "ventaja_competitiva": "Por qué gana vs los existentes",
            "unidades_mensuales_estimadas": "XX-XX unidades",
            "dificultad": "fácil|medio|difícil",
            "inversion_inicial": "$X,XXX - $X,XXX (primer pedido + envío + packaging)",
            "subscribe_save": true,
            "frecuencia_recompra": "Cada X semanas"
        }}
    ]
}}"""

        try:
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4000,
                messages=[{"role": "user", "content": prompt}],
            )

            content = response.content[0].text.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()

            ideas = json.loads(content)

            insight_id = await _database.get_next_id("ai_insights")
            doc = new_ai_insight_doc(
                insight_id,
                analysis_id=analysis_id,
                keyword=analysis_data["keyword"],
                insight_type="product_idea",
                content=json.dumps(ideas),
            )
            await _database.db.ai_insights.insert_one(doc)

            return ideas

        except json.JSONDecodeError:
            return {"niche": analysis_data["keyword"], "product_ideas": [], "raw": content}
        except Exception as e:
            raise ValueError(f"Generación de ideas falló: {str(e)}")

    async def chat(self, analysis_id: int, message: str, history: list[dict] | None = None, budget: int | None = None) -> dict:
        """Interactive chat about a specific niche analysis."""
        analysis_resp = await analyzer.get_analysis_by_id(analysis_id)
        if not analysis_resp:
            raise ValueError("Analysis not found")

        b = budget or DEFAULT_BUDGET
        analysis_data = analysis_resp.model_dump()
        context = self._build_analysis_context(analysis_data, budget=b)

        system = f"""Eres un experto estratega de Amazon FBA y sourcing desde China. RESPONDE TODO EN ESPAÑOL.
Tu cliente tiene ${b:,} USD para invertir.

MODELO DE NEGOCIO (MUY IMPORTANTE):
- El cliente SOLO vende productos CONSUMIBLES en Amazon (recompra recurrente). NUNCA sugieras abandonar consumibles — es el core del negocio.
- Fase 1 = comprar productos que el proveedor chino YA tiene con SU marca y packaging listo. Revender en Amazon bajo esa marca. $0 en branding, entrada inmediata.
- Fase 2 = SOLO si Fase 1 valida ventas, crear marca privada propia (trademark USPTO + Brand Registry).
- Cuando pregunten "genérica o marca privada": genérica = marca del proveedor chino (packaging listo), marca privada = marca propia del cliente.
- Si un nicho es NO-GO, sugiere otros nichos CONSUMIBLES viables, nunca productos no-consumibles.

Tienes acceso a los datos completos de este nicho:

{context}

INTELIGENCIA DE SUB-NICHOS:
- Si la keyword analizada es genérica/amplia (ej: "dog food", "vitamins", "cleaning supplies"), SIEMPRE piensa en sub-nichos más específicos dentro de la misma categoría.
- Cuando un nicho general es NO-GO, sugiere sub-nichos CONSUMIBLES específicos con keywords reales de Amazon (ej: para "dog food" → "dog food toppers", "freeze dried dog food", "dog probiotics").
- Da keywords exactas que el cliente puede buscar en Amazon y en Alibaba/1688.

REGLAS DE RESPUESTA:
- Conciso y accionable. Números específicos siempre.
- Si preguntan sobre proveedores, da palabras clave de Alibaba/1688.
- Si preguntan costos, desglosa: FOB China + envío + FBA + referral fee.
- No respondas con JSON — texto natural, claro y directo.
- No uses emojis en exceso."""

        messages = []
        if history:
            for msg in history[-10:]:  # Keep last 10 messages for context
                role = msg.get("role", "user")
                content = msg.get("content", "")
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": message})

        try:
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1500,
                system=system,
                messages=messages,
            )
            reply = response.content[0].text.strip()
            return {"reply": reply, "analysis_id": analysis_id, "keyword": analysis_data["keyword"]}
        except Exception as e:
            logger.error(f"AI chat failed: {e}")
            raise ValueError(f"Chat failed: {str(e)}")

    async def get_cached_insight(self, analysis_id: int, insight_type: str, db_ref=None):
        doc = await _database.db.ai_insights.find_one(
            {"analysis_id": analysis_id, "insight_type": insight_type},
            sort=[("created_at", -1)],
        )
        if doc:
            try:
                data = json.loads(doc["content"])
                if insight_type == "full_analysis":
                    return self._map_spanish_to_frontend(data)
                return data
            except json.JSONDecodeError:
                return None
        return None


ai_advisor = AIAdvisor()
