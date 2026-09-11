"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";
import { ApiError } from "@/lib/api/types";
import {
  type PlanUpdate,
  useUpdateTenantPlan,
} from "@/hooks/useUpdateTenantPlan";

interface PlanLimitsDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  current: {
    plan_name: string | null;
    plan_price_cents: number | null;
    max_instances: number | null;
  };
}

/**
 * Modal de edição de plano/limites do tenant. Pastor define:
 *  - Nome do plano (ex: "Standard", "Pro") — livre, sem catálogo fixo
 *  - Preço em centavos (ex: 7900 = R$ 79,00) — informativo, sem gateway
 *  - Limite de instâncias WhatsApp (ex: 2, 4, null = ilimitado)
 *
 * Esses valores vão em `organizations.settings` (jsonb) — sem migration,
 * sem enum, sem catálogo de planos. Quando integrar Asaas/Stripe depois,
 * dá pra trocar `plan_price_cents` por um id de plano externo.
 */
export function PlanLimitsDialog({
  open,
  onClose,
  organizationId,
  current,
}: PlanLimitsDialogProps) {
  const t = useT();
  const update = useUpdateTenantPlan(organizationId);

  // Strings pra input; conversão pra número só no submit. Estado vazio
  // significa "sem limite" (null), não 0.
  const [planName, setPlanName] = useState(current.plan_name ?? "");
  const [priceReais, setPriceReais] = useState(
    current.plan_price_cents != null
      ? (current.plan_price_cents / 100).toFixed(2).replace(".", ",")
      : "",
  );
  const [maxInstances, setMaxInstances] = useState(
    current.max_instances == null ? "" : String(current.max_instances),
  );

  async function onSave() {
    const patch: PlanUpdate = {};

    // Nome do plano: vazio → null (remove a chave)
    const trimmedName = planName.trim();
    patch.plan_name = trimmedName.length > 0 ? trimmedName : null;

    // Preço: aceita "79,90" ou "79.90" ou "79" → centavos (inteiro). Vazio → null.
    if (priceReais.trim().length > 0) {
      const cleaned = priceReais.replace(/\./g, "").replace(",", ".");
      const n = Number(cleaned);
      if (!Number.isFinite(n) || n < 0) {
        toast.error(t("Preço inválido"));
        return;
      }
      patch.plan_price_cents = Math.round(n * 100);
    } else {
      patch.plan_price_cents = null;
    }

    // Limite: vazio → null (sem limite); número ≥ 0 → guarda.
    if (maxInstances.trim().length > 0) {
      const n = Number(maxInstances);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        toast.error(t("Limite inválido (use número inteiro ≥ 0)"));
        return;
      }
      patch.max_instances = n;
    } else {
      patch.max_instances = null;
    }

    try {
      await update.mutateAsync(patch);
      toast.success(t("Plano atualizado"));
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(`${t("Erro")}: ${err.message}`);
      } else {
        toast.error(t("Falha ao atualizar plano"));
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Plano & limites")}</DialogTitle>
          <DialogDescription>
            {t(
              "Defina o plano deste cliente. O valor é só informativo nesta fase — o pagamento é combinado por WhatsApp.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="plan_name">{t("Nome do plano")}</Label>
            <Input
              id="plan_name"
              placeholder={t("Ex: Standard")}
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              maxLength={50}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan_price">{t("Preço mensal (R$)")}</Label>
            <Input
              id="plan_price"
              inputMode="decimal"
              placeholder="79,90"
              value={priceReais}
              onChange={(e) => setPriceReais(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("Vazio = sem valor definido. Quando integrar gateway, este campo vira id do plano.")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="max_instances">{t("Limite de instâncias WhatsApp")}</Label>
            <Input
              id="max_instances"
              inputMode="numeric"
              placeholder={t("Ex: 2 — vazio = ilimitado")}
              value={maxInstances}
              onChange={(e) => setMaxInstances(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("Quantos números WhatsApp o cliente pode conectar. Conexões arquivadas não contam.")}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onClose} disabled={update.isPending}>
            {t("Cancelar")}
          </Button>
          <Button onClick={onSave} disabled={update.isPending}>
            {update.isPending ? t("Salvando…") : t("Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
