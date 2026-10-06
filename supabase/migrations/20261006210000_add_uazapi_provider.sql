-- Migration: Add 'uazapi' to channel_sessions.provider enum
-- Created: 2026-10-06
-- Reason: enable UAZAPI as a channel provider alongside WAHA, Meta Cloud, Zernio

-- Drop existing check constraint and add new one with uazapi
ALTER TABLE channel_sessions DROP CONSTRAINT IF EXISTS channel_sessions_provider_check;
ALTER TABLE channel_sessions ADD CONSTRAINT channel_sessions_provider_check
  CHECK ((provider = ANY (ARRAY['waha'::text, 'meta_cloud'::text, 'zernio'::text, 'uazapi'::text])));

-- Update provider reference constraint to allow uazapi (no specific required fields for uazapi yet)
ALTER TABLE channel_sessions DROP CONSTRAINT IF EXISTS channel_sessions_provider_ref_check;
ALTER TABLE channel_sessions ADD CONSTRAINT channel_sessions_provider_ref_check
  CHECK (
    ((provider = 'waha'::text) AND (waha_session_name IS NOT NULL)) OR
    ((provider = 'meta_cloud'::text) AND (meta_phone_number_id IS NOT NULL)) OR
    ((provider = 'zernio'::text) AND (zernio_account_id IS NOT NULL)) OR
    (provider = 'uazapi'::text)
  );

-- Add uazapi-specific columns (optional, for future metadata storage)
ALTER TABLE channel_sessions
  ADD COLUMN IF NOT EXISTS uazapi_base_url text,
  ADD COLUMN IF NOT EXISTS uazapi_instance_token_encrypted text,
  ADD COLUMN IF NOT EXISTS uazapi_instance_id text;