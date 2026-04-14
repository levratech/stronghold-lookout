import type { SessionSnapshot } from "../session/session-types";

export interface SentrySection {
  key: string;
  title: string;
  summary: string;
  status: "live" | "planned";
  detail: string;
}

export function buildSentrySections(snapshot: SessionSnapshot): SentrySection[] {
  const identityDetail = snapshot.operator
    ? `Principal ${snapshot.operator.principalId ?? "unknown"} is the current operator context.`
    : "No operator identity payload is exposed to the web shell yet.";

  return [
    {
      key: "users",
      title: "Users",
      summary: "User inventory, principal lookup, and future operator inspection.",
      status: "planned",
      detail:
        "No same-origin Sentry read subject or bootstrap endpoint currently lists users for the cockpit. The module boundary is ready for that adapter.",
    },
    {
      key: "badges",
      title: "Badges",
      summary: "Badge inventory, role semantics, and authority labels.",
      status: snapshot.operator?.badgeIds.length ? "live" : "planned",
      detail: snapshot.operator?.badgeIds.length
        ? `Current session advertises ${snapshot.operator.badgeIds.length} badge value(s) through session state.`
        : "Badge management actions are not faked here; the shell only reports badge values when session bootstrap exposes them.",
    },
    {
      key: "assignments",
      title: "Assignments",
      summary: "Relationships between operators, badges, and authority scope.",
      status: "planned",
      detail:
        "Assignment inspection needs an explicit authority read surface. This shell keeps the screen shape ready without pretending those relations already exist in the browser.",
    },
    {
      key: "session",
      title: "Session Context",
      summary: "Operator identity and active authority context.",
      status: snapshot.operator ? "live" : "planned",
      detail: identityDetail,
    },
  ];
}
