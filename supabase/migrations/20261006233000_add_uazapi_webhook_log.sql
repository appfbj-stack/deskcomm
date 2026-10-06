-- Migration: add 'uazapi' to webhook_events_log provider check
-- Reason: UAZAPI adapter envia webhook events com provider='uazapi'; sem o literal,
--         o INSERT viola webhook_events_log_provider_check (23514).
--         Assegura-se ANTES da Fase 1 fechar, porque o provider já foi adicionado ao
--         check de channel_sessions em 20261006210000_add_uazapi_provider.sql mas
--         este aqui foi esquecido.

alter table public.webhook_events_log
  drop constraint if exists webhook_events_log_provider_check;

alter table public.webhook_events_log
  add constraint webhook_events_log_provider_check check (provider in (
    'waha', 'nuvemshop', 'generic', 'meta_cloud', 'zernio', 'uazapi'
  ));