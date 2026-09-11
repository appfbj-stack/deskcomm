"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";

interface SignupLinkResponse {
  data: {
    url: string;
    qr_code: string; // data URL PNG
    tenant: {
      id: string;
      slug: string;
      display_name: string;
      status: "active" | "suspended" | "redacted";
      trial_ends_at: string | null;
    };
  };
}

interface QrCodeSignupDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
}

/**
 * Modal que mostra o QR Code + URL de signup do tenant, prontos pra enviar
 * pelo WhatsApp ao cliente final. Gera sob demanda (lazy query) — só bate
 * na API quando o modal abre de verdade, pra não desperdiçar auditoria em
 * quem abre e fecha sem usar.
 */
export function QrCodeSignupDialog({
  open,
  onClose,
  organizationId,
}: QrCodeSignupDialogProps) {
  const t = useT();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "tenant", organizationId, "signup-link"] as const,
    queryFn: () =>
      apiClient.get<SignupLinkResponse>(
        `/api/v1/admin/tenants/${organizationId}/signup-link`,
      ),
    enabled: open,
    staleTime: 5 * 60_000, // 5min — link não muda dentro de uma sessão
  });

  const url = data?.data.url;
  const qr = data?.data.qr_code;
  const trialEndsAt = data?.data.tenant.trial_ends_at;

  // Reset state when modal closes — sem isso, próximo open mostra dados antigos
  // enquanto refetch roda.
  const [active, setActive] = useState(open);
  useEffect(() => {
    if (open) setActive(true);
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setActive(false);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Link de cadastro do cliente")}</DialogTitle>
          <DialogDescription>
            {t(
              "Envie este QR ou link pelo WhatsApp. O cliente escaneia, faz o cadastro e entra direto na organização.",
            )}
          </DialogDescription>
        </DialogHeader>

        {active && isLoading && (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            {t("Gerando QR Code…")}
          </div>
        )}

        {active && isError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
            <p className="text-destructive">
              {t("Falha ao gerar o link")}: {(error as Error)?.message ?? "—"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => refetch()}
            >
              {t("Tentar de novo")}
            </Button>
          </div>
        )}

        {active && data && (
          <div className="space-y-4">
            {qr && (
              <div className="flex justify-center rounded-lg border bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qr}
                  alt={t("QR Code para cadastro")}
                  width={256}
                  height={256}
                  className="h-64 w-64"
                />
              </div>
            )}

            {url && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("Link")}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={url}
                    className="flex-1 rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs"
                    onClick={(e) => e.currentTarget.select()}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (await copyToClipboard(url))
                        toast.success(t("Link copiado"));
                      else toast.error(t("Não foi possível copiar"));
                    }}
                  >
                    {t("Copiar")}
                  </Button>
                </div>
              </div>
            )}

            {trialEndsAt && (
              <div className="rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs dark:border-amber-700/40 dark:bg-amber-950/20">
                <p className="text-amber-900 dark:text-amber-200">
                  {t("Trial configurado até")}{" "}
                  <strong>
                    {new Date(trialEndsAt).toLocaleDateString("pt-BR")}
                  </strong>
                  {t(" — após essa data, suspenda o tenant manualmente se o cliente não pagou.")}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {url && (
            <Button
              variant="outline"
              onClick={async () => {
                if (await copyToClipboard(url))
                  toast.success(t("Link copiado — cole no WhatsApp"));
                else toast.error(t("Não foi possível copiar"));
              }}
            >
              {t("Copiar link pro WhatsApp")}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t("Fechar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
