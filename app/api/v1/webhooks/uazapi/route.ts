/**
 * POST /api/v1/webhooks/uazapi — global webhook receiver (no path token).
 *
 * Resolve a channel_session por `body.instanceId`. Use a rota /[token] para
 * deploys multi-instância (recomendado).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerRoteamentoUazapi, paraEnvelopeWaha } from "@/lib/uazapi/envelope";
import { dispatchWahaEvent } from "@/lib/waha/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();
  const rawBody = await req.text();

  const roteamento = lerRoteamentoUazapi(rawBody);
  if (!roteamento.ok) {
    return fail("invalid_request", roteamento.motivo, 400, { requestId });
  }

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("channel_sessions")
    .select("id, organization_id, provider, status, uazapi_instance_id, uazapi_instance_token_encrypted")
    .eq("uazapi_instance_id", roteamento.envelope.instanceId)
    .eq("provider", "uazapi")
    .maybeSingle();

  if (!session) {
    return ok(
      { accepted: false, reason: "session_not_registered", instanceId: roteamento.envelope.instanceId },
      { requestId },
    );
  }

  const envelopeWaha = paraEnvelopeWaha(roteamento.envelope);

  await admin.from("webhook_events_log").insert({
    organization_id: session.organization_id,
    channel_session_id: session.id,
    provider: "uazapi",
    webhook_path_token: null,
    http_method: "POST",
    headers: {},
    raw_body: rawBody,
    payload_parsed: roteamento.envelope as unknown as Record<string, unknown>,
    signature_header: null,
    valid_signature: true,
    event_type: roteamento.envelope.event,
    external_id: envelopeWaha?.payload?.id ?? null,
    status: "received",
    attempts: 0,
  });

  if (!envelopeWaha) {
    return ok({ accepted: true, processed: false }, { requestId });
  }

  try {
    await dispatchWahaEvent(
      admin,
      { ...session, waha_session_name: session.uazapi_instance_id } as unknown as Parameters<typeof dispatchWahaEvent>[1],
      envelopeWaha,
      requestId,
    );
  } catch (err) {
    logger.error("[uazapi.webhook] dispatch failed", { error: (err as Error).message });
  }

  return ok({ accepted: true, processed: true }, { requestId });
}