"use client";

import { useEffect, useState } from "react";
import {
  Settings, Save, Loader2, Store, Package, DollarSign, Truck, Globe, Award,
  Shield, Target, BookmarkPlus, Trash2, Check, FolderOpen,
} from "lucide-react";
import {
  getUserProfile, updateUserProfile,
  getSavedProfiles, createSavedProfile, loadSavedProfile, deleteSavedProfile,
} from "@/lib/api";
import type { UserProfile, SavedProfile } from "@/types";

const BUSINESS_MODELS = [
  { value: "generic_only", label: "Solo Gen\u00e9rico / Marca China", desc: "Revender productos con marca del proveedor chino. $0 en branding." },
  { value: "brand_only", label: "Solo Marca Propia", desc: "Crear tu marca privada desde el inicio (USPTO + Brand Registry)." },
  { value: "generic_then_brand", label: "Gen\u00e9rico \u2192 Marca Propia", desc: "Empezar con marca china, luego crear marca propia si valida." },
];

const PRODUCT_TYPES = [
  { value: "consumable_only", label: "Solo Consumibles", desc: "Productos con recompra recurrente (suplementos, limpieza, etc)." },
  { value: "any", label: "Cualquier Tipo", desc: "Tanto consumibles como no-consumibles." },
  { value: "non_consumable_only", label: "Solo No-Consumibles", desc: "Productos duraderos (accesorios, herramientas, etc)." },
];

const FULFILLMENT_OPTIONS = [
  { value: "fba", label: "FBA (Fulfilled by Amazon)", desc: "Amazon almacena, empaca y env\u00eda. Badge Prime." },
  { value: "fbm", label: "FBM (Fulfilled by Merchant)", desc: "T\u00fa almacenas y env\u00edas. Sin badge Prime." },
  { value: "both", label: "FBA + FBM", desc: "Usar ambos seg\u00fan producto/situaci\u00f3n." },
];

const EXPERIENCE_LEVELS = [
  { value: "beginner", label: "Principiante", desc: "Primera vez vendiendo en Amazon." },
  { value: "intermediate", label: "Intermedio", desc: "Ya tengo experiencia vendiendo online." },
  { value: "advanced", label: "Avanzado", desc: "Vendedor experimentado con m\u00faltiples productos." },
];

const RISK_TOLERANCES = [
  { value: "conservador", label: "Conservador", desc: "Nichos seguros, breakeven r\u00e1pido, baja competencia. Prioriza seguridad." },
  { value: "moderado", label: "Moderado", desc: "Balance entre seguridad y oportunidad. Competencia media aceptable." },
  { value: "agresivo", label: "Agresivo", desc: "Nichos competitivos si el margen lo justifica. OK con inversi\u00f3n alta." },
];

const MARKETPLACES = [
  { value: "US", label: "Amazon US", flag: "US" },
  { value: "MX", label: "Amazon MX", flag: "MX" },
  { value: "CA", label: "Amazon CA", flag: "CA" },
  { value: "UK", label: "Amazon UK", flag: "UK" },
  { value: "DE", label: "Amazon DE", flag: "DE" },
];

function RadioGroup({
  label,
  icon: Icon,
  options,
  value,
  onChange,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  options: { value: string; label: string; desc: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="card mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} color="var(--accent)" />
        <h3 className="text-sm font-bold">{label}</h3>
      </div>
      <div className="space-y-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all"
            style={{
              background: value === opt.value ? "var(--accent-glow)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${value === opt.value ? "rgba(249,115,22,0.3)" : "var(--border)"}`,
            }}
          >
            <input
              type="radio"
              name={label}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="mt-1"
              style={{ accentColor: "var(--accent)" }}
            />
            <div>
              <p className="text-sm font-semibold">{opt.label}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{opt.desc}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Draft state
  const [businessModel, setBusinessModel] = useState("generic_then_brand");
  const [productType, setProductType] = useState("consumable_only");
  const [budget, setBudget] = useState(10000);
  const [experience, setExperience] = useState("beginner");
  const [fulfillment, setFulfillment] = useState("fba");
  const [marketplace, setMarketplace] = useState("US");
  const [riskTolerance, setRiskTolerance] = useState("moderado");
  const [targetProfit, setTargetProfit] = useState(2000);

  // Saved profiles
  const [savedProfiles, setSavedProfiles] = useState<SavedProfile[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState<string | null>(null);

  function applyProfile(p: UserProfile) {
    setBusinessModel(p.business_model);
    setProductType(p.product_type);
    setBudget(p.budget);
    setExperience(p.experience);
    setFulfillment(p.fulfillment);
    setMarketplace(p.marketplace);
    setRiskTolerance(p.risk_tolerance || "moderado");
    setTargetProfit(p.target_monthly_profit || 2000);
  }

  function currentProfileData(): Omit<UserProfile, "updated_at"> {
    return {
      business_model: businessModel,
      product_type: productType,
      budget,
      experience,
      fulfillment,
      marketplace,
      risk_tolerance: riskTolerance,
      target_monthly_profit: targetProfit,
    };
  }

  useEffect(() => {
    Promise.all([getUserProfile(), getSavedProfiles()])
      .then(([p, sp]) => {
        applyProfile(p);
        setSavedProfiles(sp);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await updateUserProfile(currentProfileData());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAsProfile() {
    if (!newProfileName.trim()) return;
    setSavingProfile(true);
    try {
      const sp = await createSavedProfile(newProfileName.trim(), currentProfileData());
      setSavedProfiles((prev) => [...prev, sp]);
      setNewProfileName("");
      setShowSaveDialog(false);
    } catch {
      // ignore
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleLoadProfile(sp: SavedProfile) {
    setLoadingProfile(sp.id);
    try {
      await loadSavedProfile(sp.id);
      applyProfile(sp.profile);
      setSavedProfiles((prev) =>
        prev.map((p) => ({ ...p, is_active: p.id === sp.id }))
      );
    } catch {
      // ignore
    } finally {
      setLoadingProfile(null);
    }
  }

  async function handleDeleteProfile(id: string) {
    try {
      await deleteSavedProfile(id);
      setSavedProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(249,115,22,0.1)" }}>
              <Settings size={20} color="var(--accent)" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Perfil de Negocio</h1>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Configura tu modelo de negocio para que la IA adapte sus recomendaciones.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSaveDialog(true)}
            className="btn btn-secondary text-xs"
            title="Guardar como perfil"
          >
            <BookmarkPlus size={14} />
            Guardar como...
          </button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
            {saving ? "Guardando..." : saved ? "Guardado" : "Guardar"}
          </button>
        </div>
      </div>

      {/* Saved Profiles */}
      {(savedProfiles.length > 0 || showSaveDialog) && (
        <div className="card mb-6">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen size={18} color="var(--accent)" />
            <h3 className="text-sm font-bold">Perfiles Guardados</h3>
          </div>

          {savedProfiles.length > 0 && (
            <div className="space-y-2 mb-4">
              {savedProfiles.map((sp) => (
                <div
                  key={sp.id}
                  className="flex items-center justify-between p-3 rounded-xl transition-all"
                  style={{
                    background: sp.is_active ? "var(--accent-glow)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${sp.is_active ? "rgba(249,115,22,0.3)" : "var(--border)"}`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    {sp.is_active && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(249,115,22,0.2)", color: "var(--accent)" }}>
                        ACTIVO
                      </span>
                    )}
                    <div>
                      <p className="text-sm font-semibold">{sp.name}</p>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        ${sp.profile.budget.toLocaleString()} &middot; {sp.profile.risk_tolerance || "moderado"} &middot; Meta ${(sp.profile.target_monthly_profit || 2000).toLocaleString()}/mes
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleLoadProfile(sp)}
                      disabled={loadingProfile === sp.id || sp.is_active}
                      className="btn btn-secondary text-xs"
                      style={{ padding: "4px 8px" }}
                    >
                      {loadingProfile === sp.id ? <Loader2 size={12} className="animate-spin" /> : "Cargar"}
                    </button>
                    <button
                      onClick={() => handleDeleteProfile(sp.id)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                      title="Eliminar"
                    >
                      <Trash2 size={13} color="var(--text-muted)" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showSaveDialog && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="input text-sm flex-1"
                placeholder="Nombre del perfil (ej: Conservador $5K)"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveAsProfile()}
                autoFocus
              />
              <button onClick={handleSaveAsProfile} disabled={savingProfile || !newProfileName.trim()} className="btn btn-primary text-xs">
                {savingProfile ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Guardar
              </button>
              <button onClick={() => { setShowSaveDialog(false); setNewProfileName(""); }} className="btn btn-secondary text-xs">
                Cancelar
              </button>
            </div>
          )}

          {savedProfiles.length === 0 && !showSaveDialog && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              No hay perfiles guardados. Usa &ldquo;Guardar como...&rdquo; para crear uno.
            </p>
          )}
        </div>
      )}

      {/* Business Model */}
      <RadioGroup
        label="Modelo de Negocio"
        icon={Store}
        options={BUSINESS_MODELS}
        value={businessModel}
        onChange={setBusinessModel}
      />

      {/* Product Type */}
      <RadioGroup
        label="Tipo de Producto"
        icon={Package}
        options={PRODUCT_TYPES}
        value={productType}
        onChange={setProductType}
      />

      {/* Fulfillment */}
      <RadioGroup
        label="Fulfillment"
        icon={Truck}
        options={FULFILLMENT_OPTIONS}
        value={fulfillment}
        onChange={setFulfillment}
      />

      {/* Experience */}
      <RadioGroup
        label="Nivel de Experiencia"
        icon={Award}
        options={EXPERIENCE_LEVELS}
        value={experience}
        onChange={setExperience}
      />

      {/* Risk Tolerance */}
      <RadioGroup
        label="Tolerancia al Riesgo"
        icon={Shield}
        options={RISK_TOLERANCES}
        value={riskTolerance}
        onChange={setRiskTolerance}
      />

      {/* Budget + Target Profit + Marketplace */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={18} color="var(--accent)" />
            <h3 className="text-sm font-bold">Presupuesto Inicial</h3>
          </div>
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="input"
            min={500}
            max={1000000}
            step={500}
          />
          <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
            USD disponible para tu primera inversi\u00f3n.
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Target size={18} color="var(--accent)" />
            <h3 className="text-sm font-bold">Meta Mensual</h3>
          </div>
          <input
            type="number"
            value={targetProfit}
            onChange={(e) => setTargetProfit(Number(e.target.value))}
            className="input"
            min={500}
            max={100000}
            step={500}
          />
          <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
            USD ganancia mensual que buscas.
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Globe size={18} color="var(--accent)" />
            <h3 className="text-sm font-bold">Marketplace</h3>
          </div>
          <div className="space-y-2">
            {MARKETPLACES.map((m) => (
              <label
                key={m.value}
                className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all"
                style={{
                  background: marketplace === m.value ? "var(--accent-glow)" : "transparent",
                  border: `1px solid ${marketplace === m.value ? "rgba(249,115,22,0.3)" : "var(--border)"}`,
                }}
              >
                <input
                  type="radio"
                  name="marketplace"
                  checked={marketplace === m.value}
                  onChange={() => setMarketplace(m.value)}
                  style={{ accentColor: "var(--accent)" }}
                />
                <span className="text-sm font-medium">{m.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="card mb-8" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)" }}>
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Estas configuraciones afectan c\u00f3mo la IA analiza cada nicho. La tolerancia al riesgo
          controla qu\u00e9 tan agresivas son las recomendaciones. La meta mensual permite evaluar
          si un nicho puede generar la ganancia que buscas. Usa perfiles guardados para cambiar
          r\u00e1pidamente entre diferentes escenarios.
        </p>
      </div>
    </div>
  );
}
