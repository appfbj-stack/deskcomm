"use client";
import Link from "next/link";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { ShieldCheck } from "@/lib/ui/icons";

/**
 * Botão de atalho pro Modo Plataforma.
 *
 * Aparece SÓ pra platform_admins (não-support). É a porta de entrada pra /admin/*
 * sem precisar decorar URL — quem tem `is_platform_admin=true` vê o botão no TopBar
 * em qualquer rota do app pessoal, e um clique cai direto no painel admin.
 */
export function PlatformAdminButton() {
  const { user } = useAuth();
  const t = useT();
  if (!user.is_platform_admin || user.support) return null;
  return (
    <Link
      href="/admin/dashboard"
      aria-label={t("Modo Plataforma")}
      title={t("Modo Plataforma")}
      data-testid="platform-admin-button"
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-900 lg:h-9 lg:w-9"
    >
      <ShieldCheck size={18} weight="fill" aria-hidden />
    </Link>
  );
}
