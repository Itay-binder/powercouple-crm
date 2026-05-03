import type { MovingOrderRecord } from "@/lib/movingOrders/types";

export type OrderByOpportunityRow = {
  id: string;
  orderId: string;
  displayName: string;
  status: MovingOrderRecord["status"];
  createdAt: string | null;
};

export type OpportunityOrdersGroup = {
  opportunityId: string;
  opportunityName: string;
  contactId: string;
  orders: OrderByOpportunityRow[];
};
