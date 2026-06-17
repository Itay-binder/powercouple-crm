import type { WhatsAppMetaConfig } from "./repo";

/** מסיר רווחים, תווי כיוון ובלתי נראים שמקלקלים העתקה מ-Meta */
export function normalizeGraphId(raw: string): string {
  return String(raw ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u200E\u200F\u202A-\u202E]/g, "")
    .trim();
}

export function normalizeWhatsAppMetaConfigIds(config: WhatsAppMetaConfig): WhatsAppMetaConfig {
  return {
    ...config,
    appId: normalizeGraphId(config.appId),
    businessAccountId: normalizeGraphId(config.businessAccountId),
    wabaId: normalizeGraphId(config.wabaId),
    phoneNumberId: normalizeGraphId(config.phoneNumberId),
    systemUserToken: config.systemUserToken.trim(),
    updatedAt: config.updatedAt,
  };
}
