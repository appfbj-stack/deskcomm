/**
 * lib/uazapi/envelope.ts
 *
 * Lê o payload bruto do UAZAPI e mapeia pro formato WahaEnvelope que o resto do
 * Deskcomm já entende (lib/waha/ingest.ts, dispatchWahaEvent). UAZAPI e WAHA têm
 * schemas parecidos mas com nomes diferentes — esta é a única ponte entre os
 * dois mundos.
 *
 * UAZAPI: https://docs.uazapi.com
 *   webhook events: "messages", "messages_update", "connection"
 *   payload messages: { event, instanceId, data: { key, message: {...}, pushName } }
 *
 * WAHA: { event, session, payload: { id, from, to, body, ... } }
 */

import { logger } from "@/lib/logger";

export type UazapiEvent =
  | "messages"
  | "messages_update"
  | "connection"
  | "unknown";

export interface UazapiEnvelope {
  event: UazapiEvent;
  instanceId: string;
  message?: {
    id: string;
    fromMe: boolean;
    chatId: string; // e.g. "5515999999999@c.us"
    senderId?: string; // e.g. "5515999999999@c.us"
    senderName?: string;
    text?: string;
    type: string; // "text", "image", "audio", etc
    timestamp: number;
    from?: string; // legacy
    to?: string; // legacy
    body?: string; // legacy
  };
  connection?: {
    state: "open" | "close" | "connecting" | "connected" | "disconnected";
    reason?: string;
  };
}

export type RoteamentoUazapi =
  | { ok: true; envelope: UazapiEnvelope }
  | { ok: false; motivo: "json_invalido" | "sem_instance"; campos: string[] };

export function lerRoteamentoUazapi(rawBody: string): RoteamentoUazapi {
  let parsed: any;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, motivo: "json_invalido", campos: ["json"] };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, motivo: "sem_instance", campos: ["body"] };
  }
  const instanceId = String(parsed.instanceId ?? parsed.instance_id ?? "");
  if (!instanceId) {
    return { ok: false, motivo: "sem_instance", campos: ["instanceId"] };
  }
  const event = normalizeEvent(String(parsed.event ?? "unknown"));
  const envelope: UazapiEnvelope = { event, instanceId };
  if (parsed.data && typeof parsed.data === "object") {
    const d = parsed.data;
    if (event === "messages" || event === "messages_update") {
      // UAZAPI: data vem como { key, message, pushName, messageTimestamp, ... }.
      // O `key` é SEMPRE o que identifica a thread (remoteJid = chatId, fromMe,
      // id = wamid). Sem ele, handleInbound cai na guarda `chatId vazio` e
      // ignora a mensagem — sintoma clássico: webhook 200 mas zero persistido.
      const k = d.key && typeof d.key === "object" ? d.key : {};
      const m = d.message ?? d;
      const remoteJid = k.remoteJid ?? m.chatId ?? m.from ?? m.to ?? "";
      const text = m.text?.body ?? m.body ?? m.conversation ?? m.extendedTextMessage?.text;
      envelope.message = {
        id: String(k.id ?? m.id ?? ""),
        fromMe: Boolean(k.fromMe ?? m.fromMe ?? false),
        chatId: String(remoteJid),
        senderId: m.senderId ? String(m.senderId) : (m.from ? String(m.from) : undefined),
        senderName: m.pushName ? String(m.pushName) : (m.senderName ? String(m.senderName) : (d.pushName ? String(d.pushName) : undefined)),
        text: text ? String(text) : undefined,
        type: String(m.type ?? (m.conversation ? "chat" : "text")),
        timestamp: Number(d.messageTimestamp ?? m.messageTimestamp ?? m.timestamp ?? Date.now()),
        from: k.remoteJid ? String(k.remoteJid) : (m.from ? String(m.from) : undefined),
        to: m.to ? String(m.to) : undefined,
        body: text ? String(text) : undefined,
      };
    } else if (event === "connection") {
      envelope.connection = {
        state: String(d.state ?? "unknown") as UazapiEnvelope["connection"] extends infer T ? T extends { state: infer S } ? S : never : never,
        reason: d.reason ? String(d.reason) : undefined,
      };
    }
  }
  return { ok: true, envelope };
}

function normalizeEvent(e: string): UazapiEvent {
  const lower = e.toLowerCase();
  if (lower === "messages" || lower === "message" || lower === "messages.upsert") return "messages";
  if (lower === "messages_update" || lower === "message_update" || lower === "messages.update") return "messages_update";
  if (lower === "connection" || lower === "connection.update") return "connection";
  logger.warn("[uazapi.envelope] evento desconhecido", { event: e });
  return "unknown";
}

/**
 * Converte UazapiEnvelope -> WahaEnvelope-like para reusar dispatchWahaEvent.
 * Retorna null se não tem informação útil de mensagem.
 */
export function paraEnvelopeWaha(u: UazapiEnvelope): {
  event: string;
  session: string;
  payload: {
    id: string;
    from?: string;
    to?: string;
    body?: string;
    type?: string;
    timestamp?: number;
    fromMe?: boolean;
    pushName?: string;
    chatId?: string;
  };
} | null {
  if (u.event === "messages" || u.event === "messages_update") {
    if (!u.message) return null;
    return {
      event: u.event === "messages" ? "message" : "message.ack",
      session: u.instanceId,
      payload: {
        id: u.message.id,
        from: u.message.from ?? (u.message.fromMe ? u.message.to : u.message.senderId),
        to: u.message.to ?? (u.message.fromMe ? u.message.from : undefined),
        body: u.message.text ?? u.message.body,
        type: u.message.type,
        timestamp: u.message.timestamp,
        fromMe: u.message.fromMe,
        pushName: u.message.senderName,
        chatId: u.message.chatId,
      },
    };
  }
  if (u.event === "connection") {
    return {
      event: `connection.${u.connection?.state ?? "unknown"}`,
      session: u.instanceId,
      payload: { id: `conn-${u.instanceId}-${Date.now()}` },
    };
  }
  return null;
}