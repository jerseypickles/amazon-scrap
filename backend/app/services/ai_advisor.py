from __future__ import annotations

import json
import logging

import anthropic

from app.config import settings
import app.database as _database
from app.models.watchlist import new_ai_insight_doc
from app.services.analyzer import analyzer
from app.routers.profile import get_user_profile

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

    # ── context builder (unchanged — sends real scraper data) ──

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
- % Best Sellers: {analysis_data.get('best_seller_percentage', 'N/A')}%
- % Amazon's Choice: {analysis_data.get('amazon_choice_percentage', 'N/A')}%
- Margen Neto Estimado: {analysis_data.get('estimated_margin', 'N/A')}% (basado en precio mediano, 15% referral, $3.50 FBA, 25% sourcing, $1.50 inbound)
- Resultados Totales en Amazon: {analysis_data.get('search_result_count') or 'N/A'}

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

        sat = analysis_data.get('saturation')
        if sat and isinstance(sat, dict):
            ctx += f"\nSATURACIÓN DEL MERCADO:\n"
            ctx += f"- Newcomers (<50 reviews): {sat.get('newcomers', 0)} ({sat.get('newcomers_pct', 0):.0f}%)\n"
            ctx += f"- Growing (50-200 reviews): {sat.get('growing', 0)} ({sat.get('growing_pct', 0):.0f}%)\n"
            ctx += f"- Established (200-1000 reviews): {sat.get('established', 0)} ({sat.get('established_pct', 0):.0f}%)\n"
            ctx += f"- Dominant (>1000 reviews): {sat.get('dominant', 0)} ({sat.get('dominant_pct', 0):.0f}%)\n"
            ctx += f"- Veredicto saturación: {sat.get('verdict', 'N/A')}\n"

        price_opp = analysis_data.get('price_opportunity')
        if price_opp and isinstance(price_opp, dict):
            ctx += f"\nVENTANA DE OPORTUNIDAD DE PRECIO:\n"
            ctx += f"- Mejor rango: {price_opp.get('best_range', 'N/A')}\n"
            ranges = price_opp.get('ranges', [])
            for r in ranges:
                if isinstance(r, dict):
                    ctx += f"  · {r.get('range', '?')}: {r.get('count', 0)} productos, avg reviews={r.get('avg_reviews', 0):.0f}, entrada={r.get('entry_ease', '?')}, demanda={'Sí' if r.get('has_demand') else 'No'}\n"

        brands = analysis_data.get('top_brands', [])
        if brands:
            ctx += "\nTOP MARCAS (con nivel de amenaza):\n"
            for b_item in brands[:8]:
                if isinstance(b_item, dict):
                    threat = b_item.get('threat_level', 'low')
                    badges = []
                    if b_item.get('best_seller_count', 0) > 0:
                        badges.append(f"{b_item['best_seller_count']} Best Seller")
                    if b_item.get('amazon_choice_count', 0) > 0:
                        badges.append(f"{b_item['amazon_choice_count']} Amazon Choice")
                    badge_str = f" [{', '.join(badges)}]" if badges else ""
                    ctx += (
                        f"- {b_item.get('name', '?')}: {b_item.get('count', 0)} productos, "
                        f"{b_item.get('market_share', 0):.1f}% share, avg ${b_item.get('avg_price', 'N/A')}, "
                        f"{b_item.get('avg_rating', 'N/A')}★, {b_item.get('total_reviews', 0)} reviews totales, "
                        f"amenaza={threat}{badge_str}\n"
                    )

        price_dist = analysis_data.get('price_distribution', [])
        if price_dist:
            ctx += "\nDISTRIBUCIÓN DE PRECIOS:\n"
            for p in price_dist:
                if isinstance(p, dict):
                    ctx += f"- {p.get('range', '?')}: {p.get('count', 0)} productos\n"

        # Data quality warnings (condensed)
        warnings = []
        prime_pct = analysis_data.get('prime_percentage')
        brand_count = analysis_data.get('brand_count', 0)
        total_products = analysis_data.get('total_products', 0)
        avg_reviews = analysis_data.get('avg_reviews', 0)

        if prime_pct is not None and prime_pct == 0 and total_products > 20:
            warnings.append("PRIME 0%: Probable error de scraper. Asume ~80-90% Prime real.")
        if brand_count == 0 and total_products > 10:
            warnings.append("MARCAS 0: Scraper no extrajo marcas. Infiere competencia por reviews/ratings.")
        if avg_reviews and avg_reviews > 5000 and brand_count == 0:
            warnings.append("Reviews muy altas + 0 marcas = nicho de marcas FUERTES no detectadas.")

        if warnings:
            ctx += "\n⚠️ ALERTAS DATOS:\n"
            for i, w in enumerate(warnings, 1):
                ctx += f"{i}. {w}\n"

        return ctx

    # ── profile prompt (condensed) ──

    def _build_profile_prompt(self, profile, b: int) -> str:
        model = profile.business_model
        product_type = profile.product_type
        fulfillment = profile.fulfillment
        experience = profile.experience

        sections = []

        if model == "generic_only":
            sections.append("MODELO: SOLO GENÉRICO — Revende marca del proveedor chino, $0 en branding, riesgo Buy Box. NO sugieras marca propia.")
        elif model == "brand_only":
            sections.append("MODELO: SOLO MARCA PROPIA — Trademark USPTO + Brand Registry desde inicio. Evalúa packaging, A+ Content, diferenciación.")
        else:
            sections.append("MODELO: GENÉRICO → MARCA PROPIA — Fase 1: revender marca china para validar. Fase 2: marca propia si Fase 1 funciona. Indica si el nicho requiere marca desde inicio.")

        if product_type == "consumable_only":
            sections.append("PRODUCTO: SOLO CONSUMIBLES — Calcula recompra, LTV, Subscribe & Save. Si no es consumible = NO-GO.")
        elif product_type == "non_consumable_only":
            sections.append("PRODUCTO: SOLO NO-CONSUMIBLES — Diferenciación, margen unitario, calidad.")
        else:
            sections.append("PRODUCTO: CUALQUIER TIPO — Consumibles: evalúa recompra. No-consumibles: evalúa diferenciación.")

        if fulfillment == "fba":
            sections.append("FULFILLMENT: FBA. Evalúa costos FBA y ventaja Prime.")
        elif fulfillment == "fbm":
            sections.append("FULFILLMENT: FBM. Sin costos FBA, evalúa envío propio.")
        else:
            sections.append("FULFILLMENT: FBA + FBM según convenga.")

        if experience == "beginner":
            sections.append("EXPERIENCIA: Principiante. Sé claro y detallado.")
        elif experience == "advanced":
            sections.append("EXPERIENCIA: Avanzado. Sé directo, profundiza en estrategia.")

        sections.append(f"PRESUPUESTO: ${b:,} USD")

        return "\n".join(sections)

    # ── model-specific instructions (condensed) ──

    def _build_model_instructions(self, profile) -> str:
        model = profile.business_model
        product_type = profile.product_type

        lines = []
        if model == "generic_only":
            lines.append("- Evalúa viabilidad de reventa con marca del proveedor chino y riesgo Buy Box.")
        elif model == "brand_only":
            lines.append("- Evalúa para MARCA PROPIA: packaging, trademark, A+ Content. NO evalúes reventa genérica.")
        else:
            lines.append("- Evalúa Fase 1 (marca proveedor) y si requiere marca propia desde inicio.")

        if product_type == "consumable_only":
            lines.append("- Calcula frecuencia de recompra y LTV. Si NO es consumible = NO-GO.")
        elif product_type == "non_consumable_only":
            lines.append("- Enfócate en margen unitario y diferenciación. NO evalúes recompra.")

        return "\n".join(lines)

    # ── JSON template (REDUCED — ~10 sections instead of ~20) ──

    def _build_json_template(self, profile, b: int) -> str:
        model = profile.business_model

        # Adapt fase_recomendada by model
        if model == "brand_only":
            fase_block = """    "fase_recomendada": {
        "fase_actual": "marca_privada",
        "requiere_marca_desde_inicio": true,
        "razon_marca": "Razón por la que necesita marca propia",
        "trigger_marca_privada": "Desde el inicio",
        "inversion_marca_privada": "$X,XXX estimado"
    }"""
        elif model == "generic_only":
            fase_block = """    "fase_recomendada": {
        "fase_actual": "marca_proveedor",
        "requiere_marca_desde_inicio": false,
        "razon_marca": "Evaluación de viabilidad con marca del proveedor",
        "trigger_marca_privada": "N/A",
        "inversion_marca_privada": "N/A"
    }"""
        else:
            fase_block = """    "fase_recomendada": {
        "fase_actual": "marca_proveedor|marca_privada_necesaria",
        "requiere_marca_desde_inicio": false,
        "razon_marca": "Razón de fase recomendada",
        "trigger_marca_privada": "Condición para pasar a Fase 2",
        "inversion_marca_privada": "$X,XXX estimado"
    }"""

        return f"""{{
    "veredicto": "Una oración directa y honesta sobre la viabilidad del nicho",
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
        "vmv_alcanzable": true,
        "resumen": "2-3 oraciones: datos concretos que justifican la decisión. Si es NO-GO, di por qué sin buscar ángulos forzados."
    }},
{fase_block},
    "estrategia_entrada": {{
        "recomendado": true,
        "razonamiento": "2-3 oraciones honestas sobre por qué sí o no entrar",
        "angulo_diferenciacion": "Cómo diferenciarse de la competencia existente",
        "precio_objetivo": "$XX.XX - razón del precio",
        "rating_objetivo": "X.X+ estrellas"
    }},
    "estimacion_costos": {{
        "margen_rango": "XX-XX% (rango estimado, no número exacto)",
        "inversion_minima": "$X,XXX - $X,XXX (primer pedido + envío + FBA)",
        "breakeven_meses": "X-X meses (estimación conservadora)"
    }},
    "volumen_minimo_viable": {{
        "unidades_breakeven": "XX unidades/mes mínimo para ser rentable",
        "alcanzable": true,
        "razon": "1-2 oraciones: por qué es o no alcanzable basado en los datos de saturación y newcomers"
    }},
    "ppc": {{
        "viable": true,
        "razon": "1-2 oraciones sobre viabilidad de PPC en este nicho",
        "keywords_sugeridas": ["keyword long-tail 1", "keyword long-tail 2", "keyword long-tail 3"]
    }},
    "ideas_producto": [
        {{
            "nombre": "Nombre del producto",
            "descripcion": "Qué es y por qué funcionaría",
            "precio_estimado": "$XX.XX",
            "margen": "XX%",
            "porque": "Por qué esta idea específica tiene oportunidad",
            "dificultad": "fácil|medio|difícil"
        }}
    ],
    "riesgos": [
        {{
            "riesgo": "Descripción concisa del riesgo",
            "severidad": "alto|medio|bajo",
            "mitigacion": "Cómo mitigarlo"
        }}
    ],
    "sub_nichos": [
        {{
            "keyword_amazon": "keyword específica y real para buscar en Amazon",
            "keyword_alibaba": "keyword para buscar en Alibaba/1688",
            "porque_viable": "Por qué este sub-nicho puede funcionar con ${b:,}",
            "precio_estimado_rango": "$XX - $XX"
        }}
    ],
    "proximos_pasos": [
        "Paso concreto 1",
        "Paso concreto 2",
        "Paso concreto 3"
    ]
}}"""

    # ══════════════════════════════════════════════════════════
    #  MAIN ANALYSIS — reduced prompt, honest tone
    # ══════════════════════════════════════════════════════════

    async def analyze_niche_ai(self, analysis_id: int, budget: int | None = None, db_ref=None) -> dict:
        analysis_resp = await analyzer.get_analysis_by_id(analysis_id)
        if not analysis_resp:
            raise ValueError("Analysis not found")

        profile = await get_user_profile()
        b = budget or profile.budget or DEFAULT_BUDGET
        analysis_data = analysis_resp.model_dump()
        context = self._build_analysis_context(analysis_data, budget=b)
        profile_prompt = self._build_profile_prompt(profile, b)

        prompt = f"""Eres un analista de Amazon FBA. RESPONDE TODO EN ESPAÑOL.

{profile_prompt}

REGLAS CLAVE:
- Sé honesto y directo. Si un nicho es NO-GO, dilo con datos concretos. No busques ángulos forzados.
- Solo recomienda GO si los datos lo justifican. CAUTELA o NO-GO honesto es más valioso que un GO forzado.
- NO inventes números exactos que no puedes saber (CPC exacto, precio FOB exacto, ROI exacto). Usa rangos estimados.
- Los datos del scraper pueden tener errores — si un dato parece imposible (ej: 0% Prime en nicho grande), menciónalo.
- Calcula VMV (Volumen Mínimo Viable): unidades/mes para breakeven. Evalúa si es realista según la saturación del mercado.
- Si la keyword es genérica/amplia, sugiere sub-nichos más específicos con keywords reales de Amazon.
- Evalúa múltiples escenarios: (A) entrada directa, (B) sub-nicho específico, (C) formato diferente.
- Busca en los datos de saturación si hay newcomers (<50 reviews) — eso indica si hay espacio para nuevos vendedores.
- Máximo 3 ideas de producto, 3 riesgos, 5 sub-nichos. Sé conciso.
- Para ideas de producto: usa la ventana de oportunidad de precio (rangos con demanda pero pocas reviews) y el desglose de calidad (espacio para mejorar = productos populares con rating bajo). Basa las ideas en gaps reales de los datos.
- Para sub-nichos: sugiere keywords REALES y específicas que un usuario buscaría en Amazon. NO inventes la competencia — solo explica por qué el sub-nicho podría ser más accesible que el nicho principal.

Analiza estos datos de Amazon US:

{context}

IMPORTANTE:
{self._build_model_instructions(profile)}

Responde SOLO con JSON válido (sin markdown, sin ```):
{self._build_json_template(profile, b)}"""

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

    # ── mapper (simplified — removed financials, fba_evaluation, sourcing) ──

    def _map_spanish_to_frontend(self, es: dict) -> dict:
        entry = es.get("estrategia_entrada", {})

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
                "mvv_achievable": go_raw.get("vmv_alcanzable", False),
                "summary": go_raw.get("resumen", ""),
            }

        # Minimum Viable Volume (simplified)
        vmv_raw = es.get("volumen_minimo_viable", {})
        min_viable_volume = None
        if vmv_raw:
            min_viable_volume = {
                "units_breakeven": vmv_raw.get("unidades_breakeven", vmv_raw.get("unidades_mes_breakeven", "")),
                "achievable": vmv_raw.get("alcanzable", vmv_raw.get("vmv_alcanzable", False)),
                "reasoning": vmv_raw.get("razon", vmv_raw.get("razonamiento_vmv", "")),
            }

        # Phase recommendation
        phase_raw = es.get("fase_recomendada", {})
        phase_recommendation = None
        if phase_raw:
            phase_recommendation = {
                "current_phase": phase_raw.get("fase_actual", "marca_proveedor"),
                "requires_brand_from_start": phase_raw.get("requiere_marca_desde_inicio", False),
                "brand_reason": phase_raw.get("razon_marca", ""),
                "private_label_trigger": phase_raw.get("trigger_marca_privada", ""),
                "private_label_investment": phase_raw.get("inversion_marca_privada", ""),
            }

        # Cost estimate (new)
        cost_raw = es.get("estimacion_costos", {})
        cost_estimate = None
        if cost_raw:
            cost_estimate = {
                "margin_range": cost_raw.get("margen_rango", ""),
                "min_investment": cost_raw.get("inversion_minima", ""),
                "breakeven_months": cost_raw.get("breakeven_meses", ""),
            }

        # PPC (simplified)
        ppc_raw = es.get("ppc", es.get("estrategia_ppc", {}))
        ppc_strategy = None
        if ppc_raw:
            ppc_strategy = {
                "viable": ppc_raw.get("viable", ppc_raw.get("viable_con_ppc", False)),
                "reasoning": ppc_raw.get("razon", ppc_raw.get("razonamiento_ppc", "")),
                "keywords": ppc_raw.get("keywords_sugeridas", ppc_raw.get("keywords_long_tail", [])),
            }

        product_ideas = []
        for idea in es.get("ideas_producto", []):
            product_ideas.append({
                "name": idea.get("nombre", ""),
                "description": idea.get("descripcion", ""),
                "estimated_price": idea.get("precio_estimado", ""),
                "why": idea.get("porque", ""),
                "target_margin": idea.get("margen", ""),
                "difficulty": idea.get("dificultad", ""),
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
                "why_viable": sn.get("porque_viable", ""),
                "price_range": sn.get("precio_estimado_rango", ""),
            })

        return {
            "verdict": es.get("veredicto", ""),
            "score_label": {"excelente": "excellent", "bueno": "good", "moderado": "moderate", "difícil": "difficult", "evitar": "avoid"}.get(es.get("score_label", ""), es.get("score_label", "")),
            "is_consumable": es.get("es_consumible", True),
            "repurchase_weeks": es.get("frecuencia_recompra_semanas"),
            "go_no_go": go_no_go,
            "min_viable_volume": min_viable_volume,
            "phase_recommendation": phase_recommendation,
            "cost_estimate": cost_estimate,
            "entry_strategy": {
                "recommended": entry.get("recomendado", False),
                "reasoning": entry.get("razonamiento", ""),
                "differentiation_angle": entry.get("angulo_diferenciacion", ""),
                "target_price": entry.get("precio_objetivo", ""),
                "target_rating": entry.get("rating_objetivo", ""),
            },
            "ppc_strategy": ppc_strategy,
            "product_ideas": product_ideas,
            "risks": risks,
            "sub_niches": sub_niches,
            "next_steps": es.get("proximos_pasos", []),
        }

    # ── compare niches (unchanged) ──

    async def compare_niches(self, analysis_ids: list[int], budget: int | None = None, db_ref=None) -> dict:
        profile = await get_user_profile()
        b = budget or profile.budget or DEFAULT_BUDGET
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
        profile_prompt = self._build_profile_prompt(profile, b)

        prompt = f"""Eres un experto estratega de Amazon. RESPONDE TODO EN ESPAÑOL.

{profile_prompt}

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
    "recommendation": "3-4 oraciones con la recomendación general",
    "comparison_factors": [
        {{
            "factor": "Competencia",
            "best": "keyword con mejor competencia",
            "analysis": "Comparación breve"
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

    # ── product ideas (unchanged) ──

    async def get_product_ideas(self, analysis_id: int, budget: int | None = None, db_ref=None) -> dict:
        analysis_resp = await analyzer.get_analysis_by_id(analysis_id)
        if not analysis_resp:
            raise ValueError("Analysis not found")

        profile = await get_user_profile()
        b = budget or profile.budget or DEFAULT_BUDGET
        analysis_data = analysis_resp.model_dump()
        context = self._build_analysis_context(analysis_data, budget=b)

        product_type_label = {
            "consumable_only": "consumibles (recompra recurrente)",
            "non_consumable_only": "no-consumibles (duraderos)",
            "any": "cualquier tipo (consumibles y no-consumibles)",
        }.get(profile.product_type, "consumibles")

        prompt = f"""Eres un experto en productos para Amazon. RESPONDE TODO EN ESPAÑOL.
Tu cliente tiene ${b:,} USD para invertir.

Genera 5 ideas ESPECÍFICAS de productos {product_type_label} basado en estos datos:

{context}

Responde SOLO con JSON válido (sin markdown):
{{
    "niche": "{analysis_data['keyword']}",
    "product_ideas": [
        {{
            "nombre": "Nombre específico del producto",
            "tagline": "Eslogan corto",
            "descripcion": "Qué es y por qué es diferente",
            "precio_venta": "$XX.XX",
            "costo_china": "$X.XX por unidad (FOB estimado)",
            "margen_estimado": "XX%",
            "features": ["feature 1", "feature 2", "feature 3"],
            "packaging": "Descripción del empaque",
            "tamano": "Tamaño/contenido",
            "target_audience": "Quién compra esto",
            "ventaja_competitiva": "Por qué gana vs los existentes",
            "dificultad": "fácil|medio|difícil",
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

    # ── chat (unchanged) ──

    async def chat(self, analysis_id: int, message: str, history: list[dict] | None = None, budget: int | None = None) -> dict:
        analysis_resp = await analyzer.get_analysis_by_id(analysis_id)
        if not analysis_resp:
            raise ValueError("Analysis not found")

        profile = await get_user_profile()
        b = budget or profile.budget or DEFAULT_BUDGET
        analysis_data = analysis_resp.model_dump()
        context = self._build_analysis_context(analysis_data, budget=b)
        profile_prompt = self._build_profile_prompt(profile, b)

        system = f"""Eres un experto estratega de Amazon FBA y sourcing desde China. RESPONDE TODO EN ESPAÑOL.

{profile_prompt}

Datos del nicho:

{context}

REGLAS: Conciso y accionable. Números específicos. Si preguntan costos, da rangos estimados (no exactos).
Si preguntan proveedores, da keywords de Alibaba/1688. Texto natural, no JSON. Sin emojis excesivos."""

        messages = []
        if history:
            for msg in history[-10:]:
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
