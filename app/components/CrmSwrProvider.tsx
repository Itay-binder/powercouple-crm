"use client";

import { SWRConfig, type SWRConfiguration } from "swr";
import { crmSwrFetcher } from "@/lib/swr/crmSwrFetcher";

const CRM_SWR_CONFIG: SWRConfiguration = {
  fetcher: crmSwrFetcher,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  revalidateIfStale: true,
  dedupingInterval: 4000,
  errorRetryCount: 2,
};

export default function CrmSwrProvider({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={CRM_SWR_CONFIG}>{children}</SWRConfig>;
}
