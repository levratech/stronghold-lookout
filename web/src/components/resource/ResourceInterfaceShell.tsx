import { useMemo, useState, type ReactNode } from "react";
import { Panel } from "../ui/Panel";
import { StatusPill } from "../ui/StatusPill";
import type {
  ResourceInterfaceState,
  ResourceListColumn,
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
  listColumns?: ResourceListColumn[];
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
  listColumns,
  selectedId,
  onSelectRecord,
  createSlot,
  editSlot,
  detailSlot,
  lifecycleSlot,
}: ResourceInterfaceShellProps) {
  const columns = useMemo(
    () => listColumns?.length ? listColumns : defaultResourceColumns,
    [listColumns],
  );
  const [query, setQuery] = useState("");
  const [sortColumnId, setSortColumnId] = useState(columns[0]?.id ?? "title");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [visibleColumnIds, setVisibleColumnIds] = useState(
    () =>
      new Set(
        columns
          .filter((column) => column.defaultVisible !== false)
          .map((column) => column.id),
      ),
  );
  const visibleColumns = columns.filter((column) => visibleColumnIds.has(column.id));
  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
      ? records.filter((record) =>
          resourceSearchHaystack(record, columns).includes(normalizedQuery),
        )
      : records;
    const sortColumn = columns.find((column) => column.id === sortColumnId) ?? columns[0];
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((left, right) => {
      const leftValue = sortableValue(sortColumn?.sortValue?.(left) ?? left.title);
      const rightValue = sortableValue(sortColumn?.sortValue?.(right) ?? right.title);
      return leftValue.localeCompare(rightValue, undefined, { numeric: true }) * direction;
    });
  }, [records, columns, query, sortColumnId, sortDirection]);
  const selectedRecord =
    records.find((record) => record.id === selectedId) ?? filteredRecords[0] ?? records[0];
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
          title={`${filteredRecords.length} visible of ${records.length} loaded record${
            records.length === 1 ? "" : "s"
          }`}
          description={state.detail}
        >
          {records.length ? (
            <div className="resource-list-shell">
              <div className="resource-list-controls">
                <label className="resource-list-controls__search">
                  Quick filter
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    placeholder="Search loaded records"
                    type="search"
                  />
                </label>
                <label>
                  Sort
                  <select
                    value={sortColumnId}
                    onChange={(event) => setSortColumnId(event.currentTarget.value)}
                  >
                    {columns.map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Direction
                  <select
                    value={sortDirection}
                    onChange={(event) => setSortDirection(event.currentTarget.value as "asc" | "desc")}
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </label>
              </div>

              <fieldset className="resource-column-picker">
                <legend>Show columns</legend>
                {columns.map((column) => (
                  <label key={column.id}>
                    <input
                      checked={visibleColumnIds.has(column.id)}
                      onChange={() => {
                        setVisibleColumnIds((current) => {
                          const next = new Set(current);
                          if (next.has(column.id)) {
                            next.delete(column.id);
                          } else {
                            next.add(column.id);
                          }
                          return next;
                        });
                      }}
                      type="checkbox"
                    />
                    {column.label}
                  </label>
                ))}
              </fieldset>

              {filteredRecords.length ? (
                <div className="resource-list">
                  {filteredRecords.map((record) => (
                <button
                  className={`resource-list__row${
                    record.id === selectedRecordId ? " resource-list__row--active" : ""
                  }`}
                  key={record.id}
                  type="button"
                  onClick={() => onSelectRecord?.(record.id)}
                >
                  {visibleColumns.length ? (
                    visibleColumns.map((column) => (
                      <span className="resource-list__cell" key={column.id}>
                        <span className="resource-list__label">{column.label}</span>
                        <span className="resource-list__value">{column.render(record)}</span>
                      </span>
                    ))
                  ) : (
                    <span className="resource-list__cell">
                      <span className="resource-list__label">Columns</span>
                      <span className="resource-list__value">No columns selected</span>
                    </span>
                  )}
                </button>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  No loaded records match the current filter.
                </div>
              )}
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

const defaultResourceColumns: ResourceListColumn[] = [
  {
    id: "title",
    label: "Title",
    render: (record) => (
      <span className="resource-list__main">
        <span className="resource-list__title">{record.title}</span>
        {record.subtitle ? (
          <span className="resource-list__subtitle">{record.subtitle}</span>
        ) : null}
      </span>
    ),
    sortValue: (record) => record.title,
    searchValue: (record) => `${record.title} ${record.subtitle ?? ""}`,
  },
  {
    id: "status",
    label: "Status",
    render: (record) =>
      record.status ? (
        <StatusPill tone={record.statusTone ?? "neutral"} label={record.status} />
      ) : (
        "unmarked"
      ),
    sortValue: (record) => record.status ?? "",
    searchValue: (record) => record.status ?? "",
  },
  {
    id: "id",
    label: "ID",
    render: (record) => <span className="resource-list__id">{record.id}</span>,
    sortValue: (record) => record.id,
    searchValue: (record) => record.id,
  },
  {
    id: "tags",
    label: "Tags",
    render: (record) => record.tags?.join(", ") || "none",
    sortValue: (record) => record.tags?.join(" ") ?? "",
    searchValue: (record) => record.tags?.join(" ") ?? "",
  },
];

function sortableValue(value: string | number | null | undefined) {
  return String(value ?? "").toLowerCase();
}

function resourceSearchHaystack(record: ResourceRecordSummary, columns: ResourceListColumn[]) {
  const columnValues = columns.map((column) => column.searchValue?.(record) ?? "");
  const rawValue =
    typeof record.raw === "undefined" ? "" : JSON.stringify(record.raw);
  return [
    record.id,
    record.title,
    record.subtitle ?? "",
    record.status ?? "",
    record.tags?.join(" ") ?? "",
    rawValue,
    ...columnValues,
  ]
    .join(" ")
    .toLowerCase();
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
      {record.relationships?.length ? (
        <div className="resource-relationships">
          <div className="resource-relationships__title">Relationships</div>
          {record.relationships.map((relationship) => (
            <div className="resource-relationship" key={relationship.label}>
              <div>
                <div className="resource-relationship__label">{relationship.label}</div>
                <div className="resource-relationship__value">{relationship.value}</div>
                {relationship.detail ? (
                  <div className="resource-relationship__detail">{relationship.detail}</div>
                ) : null}
              </div>
              {relationship.tone ? (
                <StatusPill tone={relationship.tone} label={relationship.tone} />
              ) : null}
            </div>
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
