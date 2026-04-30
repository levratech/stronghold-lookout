import { useMemo, useState, type ReactNode } from "react";
import { Panel } from "../ui/Panel";
import { StatusPill } from "../ui/StatusPill";
import type {
  ResourceInterfaceState,
  ResourceListColumn,
  ResourceLifecycleAction,
  ResourceLifecycleResult,
  ResourceRecordSummary,
} from "./resource-types";

type ResourceInterfaceMode = "list" | "create" | "detail" | "edit" | "lifecycle";
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
  createLabel?: string;
  editLabel?: string;
  showHeader?: boolean;
  onCreateRequested?: () => void;
  onEditRequested?: (record: ResourceRecordSummary) => void;
  onLifecycleAction?: (
    record: ResourceRecordSummary,
    action: ResourceLifecycleAction,
  ) => Promise<ResourceLifecycleResult> | ResourceLifecycleResult;
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
  createLabel = "Create",
  editLabel = "Edit Resource",
  showHeader = true,
  onCreateRequested,
  onEditRequested,
  onLifecycleAction,
}: ResourceInterfaceShellProps) {
  const columns = useMemo(
    () => listColumns?.length ? listColumns : defaultResourceColumns,
    [listColumns],
  );
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ResourceInterfaceMode>("list");
  const [internalSelectedId, setInternalSelectedId] = useState<string>();
  const [sortColumnId, setSortColumnId] = useState(columns[0]?.id ?? "title");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [pendingLifecycle, setPendingLifecycle] = useState<{
    record: ResourceRecordSummary;
    action: ResourceLifecycleAction;
  }>();
  const [lifecycleResult, setLifecycleResult] = useState<ResourceLifecycleResult>({
    status: "accepted",
    detail: "No lifecycle action has been submitted in this view.",
  });
  const visibleColumns = columns.filter((column) => column.defaultVisible !== false);
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
  const effectiveSelectedId = selectedId ?? internalSelectedId;
  const selectedRecord = effectiveSelectedId
    ? records.find((record) => record.id === effectiveSelectedId)
    : undefined;
  const selectedRecordId = selectedRecord?.id;
  const createAvailable = Boolean(createSlot || onCreateRequested);
  const editAvailable = Boolean(selectedRecord && (editSlot || onEditRequested));
  const lifecycleAvailable = Boolean(
    selectedRecord && (lifecycleSlot || selectedRecord.lifecycleActions?.length),
  );

  function selectRecord(record: ResourceRecordSummary) {
    setInternalSelectedId(record.id);
    onSelectRecord?.(record.id);
    setMode("detail");
  }

  function requestCreate() {
    if (onCreateRequested) {
      onCreateRequested();
      return;
    }
    setMode("create");
  }

  function requestEdit(record: ResourceRecordSummary) {
    if (onEditRequested) {
      onEditRequested(record);
      return;
    }
    setMode("edit");
  }

  return (
    <div className="resource-interface">
      {showHeader ? (
        <header className="page__header">
          <div className="page__title-block">
            <div className="panel__eyebrow">{eyebrow}</div>
            <h1 className="page__title">{title}</h1>
            <p className="page__summary">{summary}</p>
          </div>
          {createAvailable ? (
            <button className="button" type="button" onClick={requestCreate}>
              {createLabel}
            </button>
          ) : null}
        </header>
      ) : null}

      <section className="resource-interface__grid">
        {mode === "list" ? (
          <Panel
            eyebrow={eyebrow}
            title={title}
            description={summary}
            actions={
              createAvailable && !showHeader ? (
                <button className="button" type="button" onClick={requestCreate}>
                  {createLabel}
                </button>
              ) : undefined
            }
          >
            {records.length ? (
              <div className="resource-list-shell">
                <div className="resource-list-controls">
                  <label className="resource-list-controls__search">
                    Search
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.currentTarget.value)}
                      placeholder={`Search ${title.toLowerCase()}`}
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

                <div className="resource-list-count">
                  {query.trim()
                    ? `${filteredRecords.length} matching ${records.length === 1 ? "record" : "records"}`
                    : `${records.length} ${records.length === 1 ? "record" : "records"}`}
                </div>

                {filteredRecords.length ? (
                  <div className="resource-list">
                    {filteredRecords.map((record) => (
                      <button
                        className={`resource-list__row${
                          record.id === selectedRecordId ? " resource-list__row--active" : ""
                        }`}
                        key={record.id}
                        type="button"
                        onClick={() => selectRecord(record)}
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
                    No records match the current search.
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">{state.detail}</div>
            )}
          </Panel>
        ) : null}

        {mode === "create" ? (
          <Panel
            eyebrow="Create"
            title={createLabel}
            actions={
              <button className="button button--ghost" type="button" onClick={() => setMode("list")}>
                Back to list
              </button>
            }
          >
            {createSlot ?? (
              <div className="empty-state">
                This resource has not mounted a create form yet.
              </div>
            )}
          </Panel>
        ) : null}

        {mode === "detail" ? (
          <Panel
            eyebrow="Detail"
            title={selectedRecord?.title ?? "No record selected"}
            actions={
              <div className="resource-view-actions">
                <button className="button button--ghost" type="button" onClick={() => setMode("list")}>
                  Back to list
                </button>
                {selectedRecord && editAvailable ? (
                  <button className="button" type="button" onClick={() => requestEdit(selectedRecord)}>
                    Edit
                  </button>
                ) : null}
                {selectedRecord && lifecycleAvailable ? (
                  <button className="button button--secondary" type="button" onClick={() => setMode("lifecycle")}>
                    Archive / Disable
                  </button>
                ) : null}
              </div>
            }
          >
            {selectedRecord ? (
              detailSlot ?? <ResourceRecordDetail record={selectedRecord} />
            ) : (
              <div className="empty-state">Select a record to inspect it.</div>
            )}
          </Panel>
        ) : null}

        {mode === "edit" ? (
          <Panel
            eyebrow="Edit"
            title={selectedRecord ? `${editLabel}: ${selectedRecord.title}` : editLabel}
            actions={
              <button className="button button--ghost" type="button" onClick={() => setMode(selectedRecord ? "detail" : "list")}>
                {selectedRecord ? "Back to detail" : "Back to list"}
              </button>
            }
          >
            {editSlot ?? (
              <div className="empty-state">
                This resource has not mounted an edit form yet.
              </div>
            )}
          </Panel>
        ) : null}

        {mode === "lifecycle" ? (
          <Panel
            eyebrow="Lifecycle"
            title={selectedRecord ? `Archive / Disable: ${selectedRecord.title}` : "Archive / Disable"}
            actions={
              <button className="button button--ghost" type="button" onClick={() => setMode(selectedRecord ? "detail" : "list")}>
                {selectedRecord ? "Back to detail" : "Back to list"}
              </button>
            }
          >
            {lifecycleSlot ??
              (selectedRecord ? (
                <ResourceLifecycleActions
                  record={selectedRecord}
                  result={lifecycleResult}
                  pending={pendingLifecycle}
                  onCancel={() => setPendingLifecycle(undefined)}
                  onConfirm={async () => {
                    if (!pendingLifecycle) {
                      return;
                    }
                    if (!onLifecycleAction) {
                      setLifecycleResult({
                        status: "invalid",
                        detail:
                          "No backend lifecycle handler is mounted for this resource contract yet.",
                      });
                      setPendingLifecycle(undefined);
                      return;
                    }
                    try {
                      const result = await onLifecycleAction(
                        pendingLifecycle.record,
                        pendingLifecycle.action,
                      );
                      setLifecycleResult(result);
                    } catch (error) {
                      setLifecycleResult({
                        status: "error",
                        detail:
                          error instanceof Error
                            ? error.message
                            : "Lifecycle action failed without a typed error.",
                      });
                    } finally {
                      setPendingLifecycle(undefined);
                    }
                  }}
                  onRequest={(action) =>
                    setPendingLifecycle({ record: selectedRecord, action })
                  }
                />
              ) : (
                <div className="empty-state">
                  Select a record before lifecycle controls are shown.
                </div>
              ))}
          </Panel>
        ) : null}
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
    defaultVisible: false,
    render: (record) => <span className="resource-list__id">{record.id}</span>,
    sortValue: (record) => record.id,
    searchValue: (record) => record.id,
  },
  {
    id: "tags",
    label: "Tags",
    defaultVisible: false,
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
      <details className="advanced-details">
        <summary>Technical details</summary>
        <pre className="resource-raw">
          {JSON.stringify(record.raw ?? { id: record.id, title: record.title }, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function ResourceLifecycleActions({
  record,
  result,
  pending,
  onRequest,
  onConfirm,
  onCancel,
}: {
  record: ResourceRecordSummary;
  result: ResourceLifecycleResult;
  pending?: { record: ResourceRecordSummary; action: ResourceLifecycleAction };
  onRequest: (action: ResourceLifecycleAction) => void;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const actions = record.lifecycleActions ?? [];

  if (!actions.length) {
    return (
      <div className="empty-state">
        No lifecycle actions are mounted for this resource yet.
      </div>
    );
  }

  return (
    <div className="stack">
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
            onClick={() => onRequest(action)}
            type="button"
          >
            {action.label}
          </button>
        ))}
      </div>
      {pending ? (
        <div className="resource-confirmation">
          <div>
            <div className="resource-confirmation__title">
              Confirm {pending.action.confirmationLabel ?? pending.action.label}
            </div>
            <div className="resource-confirmation__body">
              {pending.action.description ??
                "This action should call a resource-specific backend mutation and leave evidence."}
            </div>
            <div className="resource-confirmation__body">
              Target: {pending.record.title} ({pending.record.id})
            </div>
          </div>
          <div className="button-row">
            <button className="button button--danger" onClick={() => void onConfirm()} type="button">
              Confirm
            </button>
            <button className="button button--ghost" onClick={onCancel} type="button">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {result.detail !== "No lifecycle action has been submitted in this view." ? (
        <div className={`state-notice ${
          result.status === "accepted"
            ? "state-notice--success"
            : result.status === "denied" || result.status === "error"
              ? "state-notice--error"
              : "state-notice--warning"
        }`}>
          <div className="state-notice__title">Lifecycle result</div>
          <div className="state-notice__body">
            {result.detail}
            {result.evidenceId ? ` Evidence: ${result.evidenceId}` : ""}
          </div>
        </div>
      ) : null}
    </div>
  );
}
