"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SuspendDialog } from "./SuspendDialog";
import { ReactivateDialog } from "./ReactivateDialog";
import { QrCodeSignupDialog } from "./QrCodeSignupDialog";
import { ImpersonateButton } from "@/components/admin/ImpersonateButton";
import { useT } from "@/hooks/i18n/useT";
import { QrCode } from "@/lib/ui/icons";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TenantActionsProps {
  organizationId: string;
  status: "active" | "suspended" | "redacted";
  displayName: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TenantActions({
  organizationId,
  status,
  displayName,
}: TenantActionsProps) {
  const t = useT();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const canSuspend = status === "active";
  const isSuspended = status === "suspended";
  const isRedacted = status === "redacted";

  return (
    <>
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t("Ações")}
        </h2>

        {/* Impersonate (S-11.07) */}
        <ImpersonateButton
          organizationId={organizationId}
          displayName={displayName}
          disabled={isRedacted}
          disabledReason={
            isRedacted ? t("Tenant redigido — ação não disponível") : undefined
          }
        />

        {/* Gerar QR / link de signup — pra enviar pro cliente pelo WhatsApp.
            Funciona em qualquer status: até em `suspended` é útil pra reenviar
            o link se o cliente perdeu. `redacted` é o único estado terminal
            onde não faz sentido. */}
        {!isRedacted && (
          <Button
            className="w-full"
            variant="outline"
            onClick={() => setQrOpen(true)}
            aria-label={t("Gerar link de cadastro / QR Code")}
          >
            <QrCode size={16} weight="regular" className="mr-2" aria-hidden />
            {t("Gerar link / QR Code")}
          </Button>
        )}

        {/* Suspend */}
        {canSuspend && (
          <Button
            className="w-full"
            variant="destructive"
            onClick={() => setSuspendOpen(true)}
            aria-label={t("Suspender tenant")}
          >
            {t("Suspender tenant")}
          </Button>
        )}

        {/* Reactivate */}
        {isSuspended && (
          <Button
            className="w-full"
            variant="outline"
            onClick={() => setReactivateOpen(true)}
            aria-label={t("Reativar tenant")}
          >
            {t("Reativar tenant")}
          </Button>
        )}

        {isRedacted && (
          <p className="text-xs text-muted-foreground text-center py-2">
            {t("Tenant redigido — ações de gestão não disponíveis.")}
          </p>
        )}
      </div>

      <SuspendDialog
        open={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        organizationId={organizationId}
      />

      <ReactivateDialog
        open={reactivateOpen}
        onClose={() => setReactivateOpen(false)}
        organizationId={organizationId}
      />

      <QrCodeSignupDialog
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        organizationId={organizationId}
      />
    </>
  );
}
