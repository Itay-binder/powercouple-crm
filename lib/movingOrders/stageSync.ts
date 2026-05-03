import { MOVING_ORDER_STAGES } from "@/lib/movingOrders/pipelineConstants";
import type { MovingOrderStatus } from "@/lib/movingOrders/types";

const S0 = MOVING_ORDER_STAGES[0];
const S1 = MOVING_ORDER_STAGES[1];
const S2 = MOVING_ORDER_STAGES[2];
const S3 = MOVING_ORDER_STAGES[3];
const S4 = MOVING_ORDER_STAGES[4];

export function statusFromStage(stageRaw: string): MovingOrderStatus {
  const stage = stageRaw.trim();
  if (stage === S4) return "rejected";
  if (stage === S3) return "cancelled";
  if (stage === S2) return "completed";
  if (stage === S1) return "dispatched";
  return "pending";
}

export function defaultStageForStatus(status: MovingOrderStatus): string {
  switch (status) {
    case "dispatched":
      return S1;
    case "completed":
      return S2;
    case "cancelled":
      return S3;
    case "rejected":
      return S4;
    default:
      return S0;
  }
}
