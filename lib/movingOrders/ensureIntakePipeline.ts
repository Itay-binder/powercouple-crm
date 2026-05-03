import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  MOVING_ORDERS_INTAKE_PIPELINE_ID,
  MOVING_ORDER_PIPELINE_NAME,
  MOVING_ORDER_STAGES,
} from "@/lib/movingOrders/pipelineConstants";
import { upsertCustomField } from "@/lib/customFields/repo";

function mapTs(ts: unknown): Date | null {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ts as any).toDate?.() ?? null;
  }
  return null;
}

export type MovingOrderPipelineDoc = {
  id: string;
  name: string;
  stages: string[];
  scope: "moving_order";
  createdAt: Date | null;
  updatedAt: Date | null;
};

/**
 * מבטיח פייפליין ברירת מחדל "קליטת הזמנות" + שדות מותאמים (idempotent).
 */
export async function ensureMovingOrdersIntakePipeline(): Promise<MovingOrderPipelineDoc> {
  const db = await getAdminDb();
  const ref = db.collection("pipelines").doc(MOVING_ORDERS_INTAKE_PIPELINE_ID);
  const snap = await ref.get();
  const now = FieldValue.serverTimestamp();
  if (!snap.exists) {
    await ref.set({
      name: MOVING_ORDER_PIPELINE_NAME,
      stages: [...MOVING_ORDER_STAGES],
      scope: "moving_order",
      createdAt: now,
      updatedAt: now,
    });
    const { seedMovingOrderCustomFields } = await import("@/lib/movingOrders/seedOrderFields");
    await seedMovingOrderCustomFields();
  } else {
    const d = (snap.data() ?? {}) as Record<string, unknown>;
    const cur = Array.isArray(d.stages) ? (d.stages as string[]).map((s) => String(s).trim()) : [];
    if (cur.length === 0) {
      await ref.set(
        {
          stages: [...MOVING_ORDER_STAGES],
          updatedAt: now,
        },
        { merge: true }
      );
    } else {
      let merged = [...cur];
      for (const s of MOVING_ORDER_STAGES) {
        if (!merged.includes(s)) merged.push(s);
      }
      if (merged.length !== cur.length) {
        await ref.set({ stages: merged, updatedAt: now }, { merge: true });
      }
    }
  }

  const again = await ref.get();
  const d = (again.data() ?? {}) as Record<string, unknown>;

  // Keep newly added system fields visible in existing workspaces too.
  await upsertCustomField({
    entityType: "moving_order",
    fieldId: "moving_timing",
    label: "למתי ההובלה",
    type: "text",
    pipelineIds: [MOVING_ORDERS_INTAKE_PIPELINE_ID],
    isRequired: false,
    isActive: true,
  });

  return {
    id: again.id,
    name: String(d.name ?? MOVING_ORDER_PIPELINE_NAME),
    stages: Array.isArray(d.stages) ? (d.stages as string[]).map((s) => String(s).trim()).filter(Boolean) : [...MOVING_ORDER_STAGES],
    scope: "moving_order",
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}
