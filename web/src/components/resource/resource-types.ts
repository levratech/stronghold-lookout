import type { ReactNode } from "react";

export type ResourceInterfaceStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "denied"
  | "error";

export type ResourceLifecycleKind =
  | "archive"
  | "disable"
  | "revoke"
  | "restore"
  | "inspect";

export interface ResourceLifecycleAction {
  id: string;
  label: string;
  kind: ResourceLifecycleKind;
  disabled?: boolean;
  description?: string;
}

export interface ResourceRecordField {
  label: string;
  value: ReactNode;
}

export interface ResourceRecordRelationship {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: "success" | "warning" | "danger" | "neutral";
}

export interface ResourceRecordSummary {
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  statusTone?: "success" | "warning" | "danger" | "neutral";
  tags?: string[];
  fields?: ResourceRecordField[];
  relationships?: ResourceRecordRelationship[];
  raw?: unknown;
  lifecycleActions?: ResourceLifecycleAction[];
}

export interface ResourceListColumn {
  id: string;
  label: string;
  defaultVisible?: boolean;
  render: (record: ResourceRecordSummary) => ReactNode;
  sortValue?: (record: ResourceRecordSummary) => string | number | null | undefined;
  searchValue?: (record: ResourceRecordSummary) => string;
}

export interface ResourceInterfaceState {
  status: ResourceInterfaceStatus;
  detail: string;
}
