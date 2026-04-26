import type { ReactNode } from "react";
import { Panel } from "../ui/Panel";
import { StatusPill } from "../ui/StatusPill";
import type {
  ResourceInterfaceState,
  ResourceRecordSummary,
} from "./resource-types";

function statusTone(status: ResourceInterfaceState["status"]) {
  switch (status) {
    case "ready":
      return "success" as const;
    case "loading":
    case "empty":
      return "warning" as const;
    case "denied":
    case "error":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

export interface ResourceInterfaceShellProps {
  eyebrow: string;
  title: string;
  summary: string;
  state: ResourceInterfaceState;
  records: ResourceRecordSummary[];
  selectedId?: string;
  onSelectRecord?: (id: string) => void;
  createSlot?: ReactNode;
  editSlot?: ReactNode;
  detailSlot?: ReactNode;
  lifecycleSlot?: ReactNode;
}

export function ResourceInterfaceShell({
  eyebrow,
  title,
  summary,
  state,
  records,
  selectedId,
  onSelectRecord,
  createSlot,
  editSlot,
  detailSlot,
  lifecycleSlot,
}: ResourceInterfaceShellProps) {
  const selectedRecord =
    records.find((record) => record.id === selectedId) ?? records[0];
  const selectedRecordId = selectedRecord?.id;

  return (
    <div className="resource-interface">
      <header className="page__header">
        <div className="page__title-block">
          <div className="panel__eyebrow">{eyebrow}</div>
          <h1 className="page__title">{title}</h1>
          <p className="page__summary">{summary}</p>
        </div>
        <StatusPill tone={statusTone(state.status)} label={state.status} />
      </header>

      <section className="resource-interface__grid">
        <Panel
          eyebrow="List"
          title={`${records.length} loaded record${records.length === 1 ? "" : "s"}`}
          description={state.detail}
        >
          {records.length ? (
            <div className="resource-list">
              {records.map((record) => (
                <button
                  className={`resource-list__row${
                    record.id === selectedRecordId ? " resource-list__row--active" : ""
                  }`}
                  key={record.id}
                  type="button"
                  onClick={() => onSelectRecord?.(record.id)}
                >
                  <span className="resource-list__main">
                    <span className="resource-list__title">{record.title}</span>
                    {record.subtitle ? (
                      <span className="resource-list__subtitle">{record.subtitle}</span>
                    ) : null}
                    <span className="resource-list__id">{record.id}</span>
                  </span>
                  {record.status ? (
                    <StatusPill
                      tone={record.statusTone ?? "neutral"}
                      label={record.status}
                    />
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state">{state.detail}</div>
          )}
        </Panel>

        <Panel
          eyebrow="Create"
          title="New Resource"
          description="Creation controls belong in a dedicated region so the list remains scan-first."
        >
          {createSlot ?? (
            <div className="empty-state">
              This resource has not mounted a create form yet.
            </div>
          )}
        </Panel>

        <Panel
          eyebrow="Detail"
          title={selectedRecord?.title ?? "No record selected"}
          description="Detail/view exposes relationships, lifecycle state, and raw IDs before mutation."
        >
          {selectedRecord ? (
            detailSlot ?? <ResourceRecordDetail record={selectedRecord} />
          ) : (
            <div className="empty-state">Select a record to inspect it.</div>
          )}
        </Panel>

        <Panel
          eyebrow="Edit and Lifecycle"
          title="Controlled Actions"
          description="Edits and lifecycle markers are explicit, confirmation-friendly, and audit-aware."
        >
          {editSlot}
          {lifecycleSlot ??
            (selectedRecord ? (
              <ResourceLifecycleActions record={selectedRecord} />
            ) : (
              <div className="empty-state">
                Select a record before lifecycle controls are shown.
              </div>
            ))}
        </Panel>
      </section>
    </div>
  );
}

function ResourceRecordDetail({ record }: { record: ResourceRecordSummary }) {
  return (
    <div className="stack">
      <div className="kv-grid">
        <div className="kv">
          <div className="kv__label">Resource ID</div>
          <div className="kv__value">{record.id}</div>
        </div>
        <div className="kv">
          <div className="kv__label">Lifecycle</div>
          <div className="kv__value">{record.status ?? "unmarked"}</div>
        </div>
        {record.fields?.map((field) => (
          <div className="kv" key={field.label}>
            <div className="kv__label">{field.label}</div>
            <div className="kv__value">{field.value}</div>
          </div>
        ))}
      </div>
      {record.tags?.length ? (
        <div className="tag-row">
          {record.tags.map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <pre className="resource-raw">
        {JSON.stringify(record.raw ?? { id: record.id, title: record.title }, null, 2)}
      </pre>
    </div>
  );
}

function ResourceLifecycleActions({ record }: { record: ResourceRecordSummary }) {
  const actions = record.lifecycleActions ?? [];

  if (!actions.length) {
    return (
      <div className="empty-state">
        No lifecycle actions are mounted for this resource yet.
      </div>
    );
  }

  return (
    <div className="resource-actions">
      {actions.map((action) => (
        <button
          className={`button ${
            action.kind === "archive" || action.kind === "disable" || action.kind === "revoke"
              ? "button--danger"
              : "button--secondary"
          }`}
          disabled={action.disabled}
          key={action.id}
          type="button"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
