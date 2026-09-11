import { type NextRequest } from "next/server";
import QRCode from "qrcode";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// GET /api/v1/admin/tenants/[id]/signup-link
//
// Retorna a URL de cadastro do tenant + QR Code como data URL PNG. O platform
// admin usa pra enviar pelo WhatsApp ao cliente final, que escaneia/copia e
// faz o signup entrando direto na organização.
//
// Por enquanto o `?ref=<slug>` é só marcador visual — não vincula a conta ao
// tenant pré-criado, porque o signup genérico abre um org NOVO e o vincula
// ao usuário como admin dele. Para vincular ao tenant já existente
// (`loja-teste` etc.), o caminho certo é o convite por e-mail (`/team/invite`),
// que já existe — esta rota é a alternativa mais simples pro começo.
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
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, slug, display_name, status, trial_ends_at")
    .eq("id", id)
    .single();

  if (orgError || !org) {
    return fail("not_found", "Tenant not found", 404, { requestId });
  }

  // URL base do app — vem de NEXT_PUBLIC_APP_URL, com fallback pro header Host.
  // O domínio público oficial é o `fbautomacao.space` (Caddy wildcard), mas o
  // env permite self-host com domínio próprio sem mexer em código.
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = `${baseUrl}/signup?ref=${encodeURIComponent(org.slug)}&t=${encodeURIComponent(org.id)}`;

  // QR Code como data URL (PNG inline) — `qrcode.toDataURL` resolve isso sem
  // exigir uma rota de imagem separada. Largura 512px é folgado pra câmera
  // de celular ler com folga, sem inflar a resposta.
  const qr_code = await QRCode.toDataURL(url, {
    width: 512,
    margin: 2,
    errorCorrectionLevel: "M",
    color: {
      dark: "#0f172a", // slate-900 — combina com a paleta da instalação
      light: "#ffffff",
    },
  });

  // Audit — fire-and-forget; não bloqueia resposta
  void (async () => {
    try {
      const { audit } = await import("@/lib/audit");
      await audit({
        action: "platform_admin.tenant_signup_link_generated",
        actorUserId: adminCtx.user.id,
        actingAsPlatformAdmin: true,
        bypassedRls: true,
        organizationId: id,
        resourceType: "organization",
        resourceId: id,
        requestId,
        metadata: { tenant_slug: org.slug, trial_ends_at: org.trial_ends_at },
      });
    } catch {
      // audit é best-effort — falha aqui não bloqueia o signup-link
    }
  })();

  return ok(
    {
      url,
      qr_code,
      tenant: {
        id: org.id,
        slug: org.slug,
        display_name: org.display_name,
        status: org.status,
        trial_ends_at: org.trial_ends_at,
      },
    },
    { requestId },
  );
}
