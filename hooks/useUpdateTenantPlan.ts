"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface PlanUpdate {
  max_instances?: number | null;
  plan_name?: string | null;
  plan_price_cents?: number | null;
  trial_ends_at?: string | null;
}

export interface PlanUpdateResponse {
  data: {
    id: string;
    slug: string;
    display_name: string;
    status: "active" | "suspended" | "redacted";
    trial_ends_at: string | null;
    settings: Record<string, unknown> | null;
  };
}

/**
 * Atualiza os campos de plano/limite de um tenant (platform_admin only).
 * Invalida o cache do detalhe pra refletir no card "Plano & Limites".
 */
export function useUpdateTenantPlan(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: PlanUpdate) =>
      apiClient.patch<PlanUpdateResponse>(
        `/api/v1/admin/tenants/${tenantId}`,
        patch,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "tenant", tenantId] });
      void qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
    },
  });
}
