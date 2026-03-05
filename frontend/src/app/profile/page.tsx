"use client";

import { useEffect, useState } from "react";
import { Settings, Save, Loader2, Store, Package, DollarSign, Truck, Globe, Award } from "lucide-react";
import { getUserProfile, updateUserProfile } from "@/lib/api";
import type { UserProfile } from "@/types";

const BUSINESS_MODELS = [
  { value: "generic_only", label: "Solo Genérico / Marca China", desc: "Revender productos con marca del proveedor chino. $0 en branding." },
  { value: "brand_only", label: "Solo Marca Propia", desc: "Crear tu marca privada desde el inicio (USPTO + Brand Registry)." },
  { value: "generic_then_brand", label: "Genérico → Marca Propia", desc: "Empezar con marca china, luego crear marca propia si valida." },
];

const PRODUCT_TYPES = [
  { value: "consumable_only", label: "Solo Consumibles", desc: "Productos con recompra recurrente (suplementos, limpieza, etc)." },
  { value: "any", label: "Cualquier Tipo", desc: "Tanto consumibles como no-consumibles." },
  { value: "non_consumable_only", label: "Solo No-Consumibles", desc: "Productos duraderos (accesorios, herramientas, etc)." },
];

const FULFILLMENT_OPTIONS = [
  { value: "fba", label: "FBA (Fulfilled by Amazon)", desc: "Amazon almacena, empaca y envía. Badge Prime." },
  { value: "fbm", label: "FBM (Fulfilled by Merchant)", desc: "Tú almacenas y envías. Sin badge Prime." },
  { value: "both", label: "FBA + FBM", desc: "Usar ambos según producto/situación." },
];

const EXPERIENCE_LEVELS = [
  { value: "beginner", label: "Principiante", desc: "Primera vez vendiendo en Amazon." },
  { value: "intermediate", label: "Intermedio", desc: "Ya tengo experiencia vendiendo online." },
  { value: "advanced", label: "Avanzado", desc: "Vendedor experimentado con múltiples productos." },
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
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

  useEffect(() => {
    getUserProfile()
      .then((p) => {
        setProfile(p);
        setBusinessModel(p.business_model);
        setProductType(p.product_type);
        setBudget(p.budget);
        setExperience(p.experience);
        setFulfillment(p.fulfillment);
        setMarketplace(p.marketplace);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateUserProfile({
        business_model: businessModel,
        product_type: productType,
        budget,
        experience,
        fulfillment,
        marketplace,
      });
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
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
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Award size={16} /> : <Save size={16} />}
          {saving ? "Guardando..." : saved ? "Guardado" : "Guardar"}
        </button>
      </div>

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

      {/* Budget + Marketplace */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
            USD disponible para tu primera inversión.
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
          Estas configuraciones afectan cómo la IA analiza cada nicho. Por ejemplo, si seleccionas
          &ldquo;Solo Genérico&rdquo;, la IA no te sugerirá crear marca propia. Si seleccionas
          &ldquo;Solo Consumibles&rdquo;, la IA evaluará la frecuencia de recompra y LTV en cada análisis.
        </p>
      </div>
    </div>
  );
}
