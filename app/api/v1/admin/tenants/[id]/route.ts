import { type NextRequest } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// GET /api/v1/admin/tenants/[id]
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  const { id } = await params;

  let adminCtx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    adminCtx = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }

  const admin = createAdminClient();

  // Load the organization (service-role bypasses RLS — intentional cross-tenant)
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select(
      `
      id,
      slug,
      display_name,
      legal_name,
      cnpj,
      status,
      onboarded_at,
      suspended_at,
      trial_ends_at,
      created_at,
      settings
    `,
    )
    .eq("id", id)
    .single();

  if (orgError || !org) {
    return fail("not_found", "Tenant not found", 404, { requestId });
  }

  // Run counts in parallel — service role, all cross-tenant reads are intentional
  const [
    usersRes,
    conversationsRes,
    messagesRes,
    leadsRes,
    ordersRes,
    lgpdRes,
    aiRes,
    wahaRes,
    integrationRes,
  ] = await Promise.all([
    admin
      .from("user_organizations")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", id),
    admin
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", id),
    admin
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", id),
    admin
      .from("crm_leads")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", id),
    admin
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", id),
    admin
      .from("lgpd_requests")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", id)
      // `pending` não existe em `lgpd_requests_status_check`
      // (received/processing/completed/failed/expired), então este contador era
      // sempre 0 e a tela jurava que o tenant não devia nada à LGPD. Aqui
      // pendente = TUDO que ainda não fechou, sem recorte de prazo. O KPI de
      // plataforma (`app/api/v1/admin/dashboard/kpis/route.ts`) parte do mesmo
      // "não fechado" mas soma só o que vence nos próximos 5 dias — os dois
      // números divergem de propósito: este é o total do tenant, aquele é a
      // fila de SLA da plataforma.
      .not("status", "in", "(completed,failed)"),
    // `llm_calls` e não `ai_invocations`: a migration 0130 deixou a segunda sem
    // nenhum escritor (`lib/ai/log-invocation.ts` passou a gravar na primeira).
    // Lendo a tabela morta, este contador viraria ZERO em 30 dias para todo
    // tenant — com o dinheiro saindo. É o mesmo sintoma que a 0130 veio matar.
    admin
      .from("llm_calls")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", id)
      .gte(
        "created_at",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      ),
    admin
      .from("channel_sessions")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", id),
    admin
      .from("tenant_integrations")
      // `connected_at` não existe: a linha passa a existir quando a integração
      // é conectada, então `created_at` é essa mesma data com o nome real.
      .select("id, provider, status, created_at")
      .eq("organization_id", id)
      .eq("provider", "nuvemshop")
      .limit(1),
  ]);

  const counts = {
    user_count: usersRes.count ?? 0,
    conversations_count: conversationsRes.count ?? 0,
    messages_count: messagesRes.count ?? 0,
    leads_count: leadsRes.count ?? 0,
    orders_count: ordersRes.count ?? 0,
    lgpd_requests_pending: lgpdRes.count ?? 0,
    ai_invocations_30d: aiRes.count ?? 0,
    waha_sessions_count: wahaRes.count ?? 0,
  };

  const nuvemshopIntegration =
    integrationRes.data && integrationRes.data.length > 0
      ? integrationRes.data[0]
      : null;

  const integrations = {
    nuvemshop_status: nuvemshopIntegration?.status ?? null,
    // Nome de SAÍDA preservado: é o que TenantOverview já lê. Só a coluna de
    // origem estava errada.
    nuvemshop_connected_at: nuvemshopIntegration?.created_at ?? null,
  };

  // Audit lightweight — fire-and-forget
  void audit({
    action: "platform_admin.tenant_viewed",
    actorUserId: adminCtx.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    organizationId: id,
    resourceType: "organization",
    resourceId: id,
    requestId,
    metadata: { tenant_slug: org.slug },
  });

  return ok({ organization: org, counts, integrations }, { requestId });
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/admin/tenants/[id]
//
// Atualiza os campos de plano/limite do tenant. Platform_admin only.
//
// O schema é enxuto — cada campo é opcional, e o que NÃO vier no body é
// preservado. Fazemos merge por cima de `settings` (jsonb) em vez de substituir
// a coluna inteira, porque `settings` já guarda outras chaves (branding,
// notifications, etc) que não pertencem a esta rota.
//
// `max_instances` aceita `null` pra significar "sem limite" — é o default
// antes do platform_admin setar. `trial_ends_at` também — Pastor pode limpar
// se quiser tirar o trial.
// ---------------------------------------------------------------------------

const patchSchema = z
  .object({
    max_instances: z.number().int().min(0).max(1000).nullable().optional(),
    plan_name: z.string().min(1).max(50).nullable().optional(),
    plan_price_cents: z.number().int().min(0).nullable().optional(),
    trial_ends_at: z.string().datetime().nullable().optional(),
  })
  .strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  const { id } = await params;

  let adminCtx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    adminCtx = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("validation_failed", "JSON inválido.", 422, { requestId });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const admin = createAdminClient();

  // Carrega settings atual pra fazer merge — sem isso, um PATCH só com
  // `max_instances` apagaria `branding`, `notifications`, etc. Carga é só
  // do jsonb; barato.
  const { data: current, error: curErr } = await admin
    .from("organizations")
    .select("settings, slug")
    .eq("id", id)
    .single();
  if (curErr || !current) {
    return fail("not_found", "Tenant not found", 404, { requestId });
  }
  const merged: Record<string, unknown> = {
    ...(current.settings ?? {}),
  };
  if (parsed.data.max_instances !== undefined) {
    if (parsed.data.max_instances === null) delete merged.max_instances;
    else merged.max_instances = parsed.data.max_instances;
  }
  if (parsed.data.plan_name !== undefined) {
    if (parsed.data.plan_name === null) delete merged.plan_name;
    else merged.plan_name = parsed.data.plan_name;
  }
  if (parsed.data.plan_price_cents !== undefined) {
    if (parsed.data.plan_price_cents === null) delete merged.plan_price_cents;
    else merged.plan_price_cents = parsed.data.plan_price_cents;
  }

  // Campos fora de `settings` — atualização direta
  const directUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.trial_ends_at !== undefined) {
    directUpdate.trial_ends_at = parsed.data.trial_ends_at;
  }

  const { data: org, error } = await admin
    .from("organizations")
    .update({ ...directUpdate, settings: merged })
    .eq("id", id)
    .select("id, slug, display_name, status, trial_ends_at, settings")
    .single();
  if (error || !org) {
    return fail("internal_error", error?.message ?? "Falha ao atualizar tenant", 500, { requestId });
  }

  void audit({
    action: "platform_admin.tenant_plan_updated",
    actorUserId: adminCtx.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    organizationId: id,
    resourceType: "organization",
    resourceId: id,
    requestId,
    metadata: {
      tenant_slug: current.slug,
      changes: parsed.data,
    },
  });

  return ok(
    {
      id: org.id,
      slug: org.slug,
      display_name: org.display_name,
      status: org.status,
      trial_ends_at: org.trial_ends_at,
      settings: org.settings,
    },
    { requestId },
  );
}
