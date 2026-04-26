import { useState } from "react";
import { ResourceInterfaceShell } from "../../components/resource/ResourceInterfaceShell";
import type { ResourceRecordSummary } from "../../components/resource/resource-types";

const contractRecords: ResourceRecordSummary[] = [
  {
    id: "ctx_levratech_personal",
    title: "Levratech Personal Context",
    subtitle: "Context resource example",
    status: "active",
    statusTone: "success",
    tags: ["context", "root-visible", "list-first"],
    fields: [
      { label: "Parent", value: "none" },
      { label: "Scope", value: "identity-bound" },
    ],
    relationships: [
      {
        label: "Root identity",
        value: "id_adam_primary",
        detail: "Authority is bound to the identity acting in this context, not to every account sibling.",
        tone: "success",
      },
      {
        label: "Child contexts",
        value: "available through parent_id hierarchy",
        detail: "Inherited grant posture is computed at read/evaluation time.",
        tone: "neutral",
      },
    ],
    lifecycleActions: [
      {
        id: "inspect",
        label: "Inspect",
        kind: "inspect",
      },
      {
        id: "archive",
        label: "Archive",
        kind: "archive",
        confirmationLabel: "archive marker",
        description: "Marks the resource archived without physical delete.",
      },
    ],
    raw: {
      id: "ctx_levratech_personal",
      resource_type: "context",
      lifecycle: "active",
      parent_id: null,
      delete_policy: "soft_marker_only",
    },
  },
  {
    id: "badge_context_admin",
    title: "Context Admin Badge",
    subtitle: "Badge definition example",
    status: "draft",
    statusTone: "warning",
    tags: ["badge", "context-bound", "grantable"],
    fields: [
      { label: "Context", value: "ctx_levratech_personal" },
      { label: "Grant Scope", value: "direct or subtree" },
    ],
    relationships: [
      {
        label: "Bound context",
        value: "ctx_levratech_personal",
        detail: "Badge definitions are created inside a context and do not leap upward.",
        tone: "success",
      },
      {
        label: "Grant target",
        value: "identity paired principal",
        detail: "Grant UI should make identity-facing assignment obvious.",
        tone: "warning",
      },
    ],
    lifecycleActions: [
      {
        id: "disable",
        label: "Disable",
        kind: "disable",
        confirmationLabel: "disable marker",
        description: "Disables a badge without deleting its definition or history.",
      },
      {
        id: "archive",
        label: "Archive",
        kind: "archive",
        confirmationLabel: "archive marker",
        description: "Archives the badge definition when a backend lifecycle mutation is mounted.",
      },
    ],
    raw: {
      id: "badge_context_admin",
      resource_type: "badge_definition",
      context_id: "ctx_levratech_personal",
      lifecycle: "draft",
    },
  },
];

export function ResourceInterfaceContractPage() {
  const [selectedId, setSelectedId] = useState(contractRecords[0]?.id);

  return (
    <div className="page">
      <ResourceInterfaceShell
        eyebrow="Interface Doctrine"
        title="Resource Interface Contract"
        summary="A reusable shell for List, Create, Detail/View, Edit, and lifecycle controls. This route is a contract sandbox for future Contexts, Badges, Identities, Grants, Services, Agents, and Keys screens."
        state={{
          status: "ready",
          detail:
            "This contract route uses static records so product resource pages can adopt the shell without waiting on backend search or new mutations.",
        }}
        records={contractRecords}
        selectedId={selectedId}
        onSelectRecord={setSelectedId}
        createSlot={
          <div className="empty-state">
            Creation forms mount here per resource. The first pass keeps this inert
            so no authority mutations are implied by the contract sandbox.
          </div>
        }
        editSlot={
          <div className="empty-state">
            Edit forms mount above lifecycle markers when a resource has a safe
            backend mutation path. Hard delete is intentionally not part of the
            base contract.
          </div>
        }
      />
    </div>
  );
}
