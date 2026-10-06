/**
 * A porta de entrada do seam. Feature nenhuma importa `lib/waha/*` direto —
 * pede o adapter do provider da conversa e o descritor de capabilities.
 */
import { metaCloudAdapter } from "./adapters/meta-cloud";
import { wahaAdapter } from "./adapters/waha";
import { zernioAdapter } from "./adapters/zernio";
import type { ChannelAdapter, ChannelProvider } from "./types";

const ADAPTERS: Record<ChannelProvider, ChannelAdapter | null> = {
  waha: wahaAdapter,
  meta_cloud: metaCloudAdapter,
  zernio: zernioAdapter,
  // UAZAPI é o MESMO adapter do WAHA: a única diferença é o TRANSPORTE do webhook
  // e do envio, e `lib/uazapi/envelope.ts` traduz o webhook UAZAPI para WahaEnvelope.
  // Para envio, ainda não temos client UAZAPI — usar wahaAdapter resultaria em
  // enviar pelo WAHA errado; por isso `null` aqui até `lib/channels/adapters/uazapi.ts`
  // existir. O webhook de ENTRADA funciona porque o envelope alimenta o dispatchWahaEvent,
  // que NÃO chama `getAdapter` para entrada.
  uazapi: null,
};

/**
 * Fail-closed: provider sem adapter (ou fora da matriz) lança em vez de cair no
 * WAHA por default. Enviar pelo canal errado é pior que não enviar.
 */
export function getAdapter(provider: ChannelProvider): ChannelAdapter {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`unknown_channel_provider: ${provider}`);
  return adapter;
}

export { capabilitiesOf, CHANNEL_CAPABILITIES, DEFAULT_CHANNEL_PROVIDER } from "./capabilities";
export { CHANNEL_SESSION_REF_COLUMNS, resolveSessionRef } from "./session-ref";
export type { ChannelSessionRef } from "./session-ref";
export type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelProvider,
  OutboundEnvelope,
  OutboundKind,
  OutboundMedia,
  RecipientInput,
} from "./types";
