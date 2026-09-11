"use client";
import type { InterfaceSettings } from "@/lib/navigation/interface";
import { useRef } from "react";
import { createTenantSchema } from "@/lib/schemas/tenant-creation";
import { randomId } from "@/lib/random-id";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateTenantPayload {
  display_name: string;
  slug: string;
  legal_name?: string;
  cnpj?: string;
  plan?: "standard" | "pro" | "enterprise";
  owner_email: string;
  owner_interface_settings?: InterfaceSettings;
  /**
   * Configuração de plano/limite aplicada logo após a criação do tenant.
   * Vai em `organizations.settings` (jsonb) via PATCH — não exigiu migration.
   * OPOST do `useCreateTenant` faz POST e PATCH em sequência quando esses
   * campos estão presentes. Tudo opcional: sem eles, o tenant nasce sem
   * limite configurado (legado).
   */
  plan_settings?: {
    plan_name?: string;
    plan_price_cents?: number;
    max_instances?: number;
  };
}

export interface CreateTenantResponse {
  data: {
    id: string;
    slug: string;
    display_name: string;
    owner_invitation: {
      accept_url: string;
      expires_at: string;
      email_dispatched: boolean;
      email: string;
    } | null;
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCreateTenant() {
  const queryClient = useQueryClient();
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);

  return useMutation({
    mutationFn: async (payload: CreateTenantPayload) => {
      const normalized = createTenantSchema.parse(payload);
      normalized.owner_email = normalized.owner_email.toLowerCase();
      const fingerprint = JSON.stringify(normalized);
      if (!intent.current || intent.current.fingerprint !== fingerprint) {
        intent.current = { fingerprint, key: randomId() };
      }
      // POST: cria o tenant via RPC fn_create_tenant_with_owner (transacional).
      const created = await apiClient.post<CreateTenantResponse>(
        "/api/v1/admin/tenants",
        normalized,
        { idempotencyKey: intent.current.key },
      );
      // PATCH (opcional): aplica plano/limite em organizations.settings. Roda
      // só se o Pastor preencheu o preset na criação. Falha aqui NÃO desfaz
      // o tenant — Pastor pode setar depois pelo card "Editar" do detalhe.
      if (payload.plan_settings && Object.keys(payload.plan_settings).length > 0) {
        await apiClient.patch(`/api/v1/admin/tenants/${created.data.id}`, payload.plan_settings);
      }
      return created;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
    },
  });
}
