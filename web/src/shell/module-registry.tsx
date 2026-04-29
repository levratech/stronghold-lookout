import type { ReactNode } from "react";

export type LookoutModuleId =
  | "dashboard"
  | "overview"
  | "resource-interface"
  | "accounts"
  | "auth-methods"
  | "identities"
  | "contexts"
  | "badges"
  | "grants"
  | "services"
  | "principals"
  | "keys"
  | "providers"
  | "transport"
  | "audit"
  | "sentry"
  | "aegis";

export interface LookoutModuleDefinition {
  id: LookoutModuleId;
  name: string;
  navLabel: string;
  route: string;
  icon: string;
  description: string;
  status: "available" | "partial";
  requiredCapabilities?: string[];
  summary: string;
  surfaceLabel: string;
  entryHint: string;
  badge?: string;
  renderStatus?: () => ReactNode;
}

export const lookoutModules: LookoutModuleDefinition[] = [
  {
    id: "dashboard",
    name: "Dashboard",
    navLabel: "Dashboard",
    route: "/",
    icon: "DB",
    description: "Primary product landing surface.",
    status: "available",
    summary: "Reserved dashboard canvas for the future product experience.",
    surfaceLabel: "Home",
    entryHint: "Intentionally blank until the dashboard plan is ready.",
  },
  {
    id: "overview",
    name: "Debug Cockpit",
    navLabel: "Debug Cockpit",
    route: "/debug/overview",
    icon: "OV",
    description: "Estate posture, session state, and control-rail visibility.",
    status: "available",
    summary: "Confirms whether the cockpit is authenticated, connected, and structurally sound.",
    surfaceLabel: "Shell Surface",
    entryHint: "Default command deck for operators entering the estate.",
  },
  {
    id: "resource-interface",
    name: "Resource UI Contract",
    navLabel: "Resource UI",
    route: "/debug/resource-interface",
    icon: "RI",
    description: "Reusable List/Create/Detail/Edit/Lifecycle interface contract.",
    status: "available",
    summary: "Static contract sandbox for future resource manager screens.",
    surfaceLabel: "Interface Doctrine",
    entryHint: "Defines the product resource shell without depending on debug cockpit state.",
  },
  {
    id: "accounts",
    name: "Account",
    navLabel: "Account",
    route: "/authority/accounts",
    icon: "AC",
    description: "User account record and ownership root posture.",
    status: "partial",
    requiredCapabilities: ["accounts:read"],
    summary: "Account posture, login namespace, and enrollment posture for identities owned by the signed-in user.",
    surfaceLabel: "Account Surface",
    entryHint: "Review account posture without treating authentication methods or identities as the account itself.",
  },
  {
    id: "auth-methods",
    name: "Auth Methods",
    navLabel: "Auth Methods",
    route: "/authority/auth-methods",
    icon: "AM",
    description: "Account authentication methods and access posture.",
    status: "partial",
    requiredCapabilities: ["accounts:read", "accounts:manage"],
    summary: "Google, password, and future provider bindings that prove access to an account without becoming identities.",
    surfaceLabel: "Auth Surface",
    entryHint: "Manage account login bindings while keeping account, authentication, identity, and badges separate.",
  },
  {
    id: "identities",
    name: "People & Identities",
    navLabel: "People",
    route: "/authority/identities",
    icon: "ID",
    description: "User-facing identities, managed people, and paired principal lineage.",
    status: "partial",
    requiredCapabilities: ["identities:read"],
    summary: "Account-owned identities and managed people shown as context-bound operating roles rather than account-wide power.",
    surfaceLabel: "People Surface",
    entryHint: "Manage identities as scoped roles tied to contexts, not as global account permissions.",
  },
  {
    id: "contexts",
    name: "Spaces",
    navLabel: "Spaces",
    route: "/authority/contexts",
    icon: "CX",
    description: "Personal, organization, and child spaces visible to the active identity.",
    status: "partial",
    requiredCapabilities: ["contexts:read"],
    summary: "Spaces you can see or manage, with hierarchy and scope kept visible without exposing unrelated spaces.",
    surfaceLabel: "Space Manager",
    entryHint: "Manage only spaces visible to the active identity.",
  },
  {
    id: "badges",
    name: "Access",
    navLabel: "Access",
    route: "/authority/badges",
    icon: "AX",
    description: "Context-scoped access labels built from badge definitions.",
    status: "partial",
    requiredCapabilities: ["badges:read"],
    summary: "Access labels inside spaces, backed by badge definitions and granted to specific identities.",
    surfaceLabel: "Access Surface",
    entryHint: "Manage access labels under a space before assigning them to identities.",
  },
  {
    id: "grants",
    name: "Access Assignments",
    navLabel: "Assignments",
    route: "/authority/grants",
    icon: "GR",
    description: "Raw badge grant records and revocation posture.",
    status: "partial",
    requiredCapabilities: ["grants:read"],
    summary: "Diagnostic view of explicit access assignments, including inherited and revoked state.",
    surfaceLabel: "Diagnostics Surface",
    entryHint: "Inspect raw grant records when the product access view needs explanation.",
  },
  {
    id: "services",
    name: "Service Bindings",
    navLabel: "Services",
    route: "/authority/services",
    icon: "SV",
    description: "Service definitions, context bindings, and permission lanes.",
    status: "partial",
    requiredCapabilities: ["services:read", "services:manage"],
    summary: "Diagnostic view of shared service bindings with context scope, service-held keys, and badge-scoped lanes.",
    surfaceLabel: "Diagnostics Surface",
    entryHint: "Inspect service bindings without exposing private key material.",
  },
  {
    id: "principals",
    name: "Principal Diagnostics",
    navLabel: "Principals",
    route: "/authority/principals",
    icon: "PR",
    description: "Raw human, service, agent, and ephemeral principal posture.",
    status: "partial",
    requiredCapabilities: ["principals:read"],
    summary: "Diagnostic view of root/active principal relationships and principal type visibility.",
    surfaceLabel: "Diagnostics Surface",
    entryHint: "Inspect principal lineage when debugging authorship, execution, or transport posture.",
  },
  {
    id: "keys",
    name: "Keys",
    navLabel: "Keys",
    route: "/authority/keys",
    icon: "KY",
    description: "Principal key records, status, expiry, and revocation posture.",
    status: "partial",
    requiredCapabilities: ["keys:read"],
    summary: "Cryptographic key metadata and browser Level 3 signing setup without exposing private key material.",
    surfaceLabel: "Security Surface",
    entryHint: "Generate and register the active principal's browser Ed25519 command-signing key before sensitive mutations.",
  },
  {
    id: "providers",
    name: "Portals & Domains",
    navLabel: "Domains",
    route: "/authority/providers",
    icon: "DM",
    description: "White-label portals, domain bindings, and redacted auth-provider posture.",
    status: "partial",
    requiredCapabilities: ["providers:read"],
    summary: "Organization-owned portals, domains, and provider bindings without exposing OAuth secrets.",
    surfaceLabel: "Portal Manager",
    entryHint: "Manage the public interface a space is reached through, not the space authority itself.",
  },
  {
    id: "transport",
    name: "Transport",
    navLabel: "Transport",
    route: "/authority/transport",
    icon: "TR",
    description: "Browser rail readiness and NATS session posture.",
    status: "partial",
    requiredCapabilities: ["transport:read"],
    summary: "Transport state stays separate from authentication and authority.",
    surfaceLabel: "Control Rail",
    entryHint: "Shows browser rail posture and signed delegated service/agent transport drills without rendering native creds.",
  },
  {
    id: "audit",
    name: "Audit",
    navLabel: "Audit",
    route: "/authority/audit",
    icon: "AU",
    description: "Authority audit events and mutation evidence.",
    status: "partial",
    requiredCapabilities: ["audit:read"],
    summary: "Live key lifecycle audit readback for operator evidence.",
    surfaceLabel: "Evidence Surface",
    entryHint: "Reads Sentry-backed audit events; broader mutation/session coverage remains roadmap work.",
  },
  {
    id: "aegis",
    name: "Aegis",
    navLabel: "Aegis",
    route: "/aegis",
    icon: "AE",
    description: "Edge interfaces, routes, and config-state visibility.",
    status: "partial",
    requiredCapabilities: ["edge:read", "routes:read"],
    summary: "Edge-facing structure for interfaces, routes, requirements, and config provenance.",
    surfaceLabel: "Edge Surface",
    entryHint: "Read-first now; prepared for live route and config inspection when those subjects land.",
  },
];
