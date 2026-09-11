"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { InterfaceEditor } from "@/components/team/InterfaceEditor";
import {
  INTERFACE_COMPLETA,
  interfaceSettingsSchema,
  interfaceTemDestino,
} from "@/lib/navigation/interface";
import { tenantCreationFields } from "@/lib/schemas/tenant-creation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type CreateTenantResponse, useCreateTenant } from "@/hooks/useCreateTenant";
import { ApiError } from "@/lib/api/types";
import { useT } from "@/hooks/i18n/useT";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import { copyToClipboard } from "@/lib/clipboard";

// ---------------------------------------------------------------------------
// Schema (mirrors server Zod; client keeps it in sync)
// ---------------------------------------------------------------------------

const formSchema = z.object(tenantCreationFields);

type FormValues = z.infer<typeof formSchema>;

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// ---------------------------------------------------------------------------
// CNPJ mask
// ---------------------------------------------------------------------------

function maskCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/**
 * Presets de plano que Pastor pode escolher na criação do tenant. Os valores
 * viram `settings.plan_name` + `settings.plan_price_cents` + `settings.max_instances`
 * via PATCH depois do POST (a RPC `fn_create_tenant_with_owner` ainda não
 * conhece esses campos — ver `hooks/useCreateTenant.ts`).
 *
 * "custom" não tem números: Pastor edita depois no detalhe do tenant pelo
 * dialog "Editar plano".
 */
const PLAN_PRESETS = {
  standard: {
    label: "Standard — R$ 79/mês · 2 instâncias",
    plan_name: "Standard",
    plan_price_cents: 7900,
    max_instances: 2,
  },
  pro: {
    label: "Pro — R$ 129/mês · 4 instâncias",
    plan_name: "Pro",
    plan_price_cents: 12900,
    max_instances: 4,
  },
  custom: {
    label: "Personalizado (definir depois)",
    plan_name: null,
    plan_price_cents: null,
    max_instances: null,
  },
} as const;

type PlanPresetKey = keyof typeof PLAN_PRESETS;

// ---------------------------------------------------------------------------
// Form component
// ---------------------------------------------------------------------------

export function NewTenantForm() {
  const t = useT();
  const idioma = useIdioma();
  const router = useRouter();
  const createTenant = useCreateTenant();
  const [ownerInterface, setOwnerInterface] = useState(INTERFACE_COMPLETA);
  const [slugLocked, setSlugLocked] = useState(false);
  const [created, setCreated] = useState<CreateTenantResponse["data"] | null>(null);
  const [planPreset, setPlanPreset] = useState<PlanPresetKey>("standard");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      display_name: "",
      slug: "",
      legal_name: "",
      cnpj: "",
      plan: "standard",
      owner_email: "",
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = form;

  // Auto-generate slug from display_name until user edits slug manually
  const handleDisplayNameChange = (value: string) => {
    setValue("display_name", value);
    if (!slugLocked) {
      setValue("slug", slugify(value), { shouldValidate: true });
    }
  };

  const handleSlugChange = (value: string) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setValue("slug", clean, { shouldValidate: true });
    setSlugLocked(clean.length > 0);
  };

  const handleCnpjChange = (value: string) => {
    setValue("cnpj", maskCnpj(value));
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      const preset = PLAN_PRESETS[planPreset];
      const planSettings =
        preset.plan_name !== null
          ? {
              plan_name: preset.plan_name,
              plan_price_cents: preset.plan_price_cents,
              max_instances: preset.max_instances,
            }
          : undefined;

      const result = await createTenant.mutateAsync({
        display_name: values.display_name,
        slug: values.slug,
        legal_name: values.legal_name || undefined,
        cnpj: values.cnpj || undefined,
        plan: values.plan,
        owner_email: values.owner_email,
        owner_interface_settings: ownerInterface,
        ...(planSettings ? { plan_settings: planSettings } : {}),
      });

      toast.success(t("Tenant criado com sucesso!"));
      setCreated(result.data);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "conflict") {
          form.setError("slug", { message: t("Este slug já está em uso") });
          return;
        }
        toast.error(`${t("Erro ao criar tenant:")} ${err.message}`);
      } else {
        toast.error(t("Erro inesperado ao criar tenant"));
      }
    }
  });

  const planValue = useWatch({ control: form.control, name: "plan" });

  if (created)
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>{t("Organização criada")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            {t("Você já é administrador de")} {created.display_name}.
          </p>
          {created.owner_invitation && (
            <div className="space-y-3">
              <p>
                {created.owner_invitation.email_dispatched
                  ? t("Convite enviado por e-mail.")
                  : t(
                      "O envio por e-mail não foi confirmado. Copie o link e compartilhe com o responsável.",
                    )}
              </p>
              <Label htmlFor="owner-invite">{t("Link do convite")}</Label>
              <Input id="owner-invite" readOnly value={created.owner_invitation.accept_url} />
              <p>
                {t("Válido até")}{" "}
                {new Date(created.owner_invitation.expires_at).toLocaleString(idioma)}.
              </p>
              <Button
                onClick={async () => {
                  if (await copyToClipboard(created.owner_invitation!.accept_url))
                    toast.success(t("Link copiado"));
                  else toast.error(t("Selecione e copie o link acima."));
                }}
              >
                {t("Copiar convite")}
              </Button>
              <p className="text-sm text-muted-foreground">
                {t("Se o convite vencer, abra Equipe na organização para gerar outro.")}
              </p>
            </div>
          )}
          <Button asChild>
            <a href="/app">{t("Voltar ao aplicativo")}</a>
          </Button>
          <Button variant="outline" asChild>
            <a href={`/admin/tenants/${created.id}`}>{t("Ver organização")}</a>
          </Button>
        </CardContent>
      </Card>
    );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Nova organização")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Você terá acesso como administrador e poderá concluir a configuração inicial.")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Dados da organização")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            {/* display_name */}
            <div className="space-y-1.5">
              <Label htmlFor="display_name">
                {t("Nome de exibição")} <span className="text-error-fg">*</span>
              </Label>
              <Input
                id="display_name"
                placeholder={t("Loja da Maria")}
                {...register("display_name")}
                onChange={(e) => handleDisplayNameChange(e.target.value)}
                aria-invalid={!!errors.display_name}
              />
              {errors.display_name && (
                <p className="text-xs text-error-fg">{t(errors.display_name.message ?? "")}</p>
              )}
            </div>

            {/* slug */}
            <div className="space-y-1.5">
              <Label htmlFor="slug">
                Slug <span className="text-error-fg">*</span>
              </Label>
              <Input
                id="slug"
                placeholder="tienda-de-maria"
                {...register("slug")}
                onChange={(e) => handleSlugChange(e.target.value)}
                aria-invalid={!!errors.slug}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {t("Apenas letras minúsculas, números e hífens. Gerado automaticamente.")}
              </p>
              {errors.slug && (
                <p className="text-xs text-error-fg">{t(errors.slug.message ?? "")}</p>
              )}
            </div>

            {/* legal_name */}
            <div className="space-y-1.5">
              <Label htmlFor="legal_name">{t("Razão social")}</Label>
              <Input
                id="legal_name"
                placeholder={t("Maria da Silva LTDA")}
                {...register("legal_name")}
                aria-invalid={!!errors.legal_name}
              />
              {errors.legal_name && (
                <p className="text-xs text-error-fg">{t(errors.legal_name.message ?? "")}</p>
              )}
            </div>

            {/* cnpj */}
            <div className="space-y-1.5">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                placeholder="00.000.000/0000-00"
                {...register("cnpj")}
                onChange={(e) => handleCnpjChange(e.target.value)}
                inputMode="numeric"
                maxLength={18}
                aria-invalid={!!errors.cnpj}
                className="font-mono"
              />
              {errors.cnpj && (
                <p className="text-xs text-error-fg">{t(errors.cnpj.message ?? "")}</p>
              )}
            </div>

            {/* plan preset — escolha rápida do que Pastor oferece.
                "custom" não grava nada agora; Pastor edita no detalhe depois. */}
            <div className="space-y-2">
              <Label>{t("Plano sugerido")}</Label>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t("Plano sugerido")}>
                {(Object.keys(PLAN_PRESETS) as PlanPresetKey[]).map((key) => {
                  const selected = planPreset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPlanPreset(key)}
                      className={[
                        "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        selected
                          ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-950/30 dark:text-emerald-100"
                          : "border-border bg-card hover:bg-muted/50",
                      ].join(" ")}
                    >
                      {t(PLAN_PRESETS[key].label)}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Preenche o plano, preço e limite de instâncias. Edite depois no detalhe do tenant se precisar.",
                )}
              </p>
            </div>

            {/* plan (legacy) — campo do schema original. Mantido porque a RPC
                fn_create_tenant_with_owner ainda usa como chave de auditoria. */}
            <div className="space-y-1.5">
              <Label htmlFor="plan">{t("Plano (legado)")}</Label>
              <Select
                value={planValue}
                onValueChange={(v) => setValue("plan", v as "standard" | "pro" | "enterprise")}
              >
                <SelectTrigger id="plan" aria-label={t("Plano")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
              {errors.plan && (
                <p className="text-xs text-error-fg">{t(errors.plan.message ?? "")}</p>
              )}
            </div>

            {/* owner_email */}
            <div className="space-y-1.5">
              <Label htmlFor="owner_email">
                {t("E-mail do responsável")} <span className="text-error-fg">*</span>
              </Label>
              <Input
                id="owner_email"
                type="email"
                placeholder="responsable@empresa.com"
                {...register("owner_email")}
                aria-invalid={!!errors.owner_email}
              />
              {errors.owner_email && (
                <p className="text-xs text-error-fg">{t(errors.owner_email.message ?? "")}</p>
              )}
            </div>

            <InterfaceEditor
              value={ownerInterface}
              onChange={setOwnerInterface}
              role="admin"
              disabled={isSubmitting}
            />
            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  !interfaceSettingsSchema.safeParse(ownerInterface).success ||
                  !interfaceTemDestino(ownerInterface, "admin")
                }
              >
                {isSubmitting ? t("Criando...") : t("Criar organização")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={isSubmitting}
              >
                {t("Cancelar")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
