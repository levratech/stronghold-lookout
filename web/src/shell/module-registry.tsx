import type { ReactNode } from "react";

export type LookoutModuleId =
  | "overview"
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
    id: "overview",
    name: "Overview",
    navLabel: "Overview",
    route: "/",
    icon: "OV",
    description: "Estate posture, session state, and control-rail visibility.",
    status: "available",
    summary: "Confirms whether the cockpit is authenticated, connected, and structurally sound.",
    surfaceLabel: "Shell Surface",
    entryHint: "Default command deck for operators entering the estate.",
  },
  {
    id: "accounts",
    name: "Accounts",
    navLabel: "Accounts",
    route: "/authority/accounts",
    icon: "AC",
    description: "Account records and user-level ownership roots.",
    status: "partial",
    requiredCapabilities: ["accounts:read"],
    summary: "Account inventory and enrollment posture for identities owned by users.",
    surfaceLabel: "Authority Surface",
    entryHint: "Placeholder now; becomes the account/user read surface in this phase.",
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
    name: "Identities",
    navLabel: "Identities",
    route: "/authority/identities",
    icon: "ID",
    description: "Identity records, paired principals, and lineage.",
    status: "partial",
    requiredCapabilities: ["identities:read"],
    summary: "Identity graph view across account, context, and principal relationships.",
    surfaceLabel: "Authority Surface",
    entryHint: "Placeholder now; becomes the identity lineage read surface in this phase.",
  },
  {
    id: "contexts",
    name: "Contexts",
    navLabel: "Contexts",
    route: "/authority/contexts",
    icon: "CX",
    description: "Context tree and scoped authority boundaries.",
    status: "partial",
    requiredCapabilities: ["contexts:read"],
    summary: "Context hierarchy and scoping surface for authority decisions.",
    surfaceLabel: "Authority Surface",
    entryHint: "Placeholder now; becomes the context read surface in this phase.",
  },
  {
    id: "badges",
    name: "Badges",
    navLabel: "Badges",
    route: "/authority/badges",
    icon: "BA",
    description: "Badge catalog and context-scoped authority labels.",
    status: "partial",
    requiredCapabilities: ["badges:read"],
    summary: "Badge definitions before any grant/revoke mutations are exposed.",
    surfaceLabel: "Authority Surface",
    entryHint: "Placeholder now; becomes the badge catalog read surface in this phase.",
  },
  {
    id: "grants",
    name: "Grants",
    navLabel: "Grants",
    route: "/authority/grants",
    icon: "GR",
    description: "Principal badge grants and revocation posture.",
    status: "partial",
    requiredCapabilities: ["grants:read"],
    summary: "Explicit permissions granted to principals, including revoked state.",
    surfaceLabel: "Authority Surface",
    entryHint: "Placeholder now; becomes the grant inspection surface in this phase.",
  },
  {
    id: "services",
    name: "Services",
    navLabel: "Services",
    route: "/authority/services",
    icon: "SV",
    description: "Service definitions, context bindings, and permission lanes.",
    status: "partial",
    requiredCapabilities: ["services:read", "services:manage"],
    summary: "Shared service bindings with context scope, service-held keys, and badge-scoped permission lane posture.",
    surfaceLabel: "Service Surface",
    entryHint: "Inspect service bindings and provision service principals without exposing private key material.",
  },
  {
    id: "principals",
    name: "Principals",
    navLabel: "Principals",
    route: "/authority/principals",
    icon: "PR",
    description: "Human, service, agent, and ephemeral principal posture.",
    status: "partial",
    requiredCapabilities: ["principals:read"],
    summary: "Root/active principal relationships and principal type visibility.",
    surfaceLabel: "Authority Surface",
    entryHint: "Placeholder now; becomes the principal lineage surface in this phase.",
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
    summary: "Cryptographic key metadata without exposing key material.",
    surfaceLabel: "Authority Surface",
    entryHint: "Placeholder now; becomes the principal-key posture surface in this phase.",
  },
  {
    id: "providers",
    name: "Providers",
    navLabel: "Providers",
    route: "/authority/providers",
    icon: "PV",
    description: "Auth provider posture and redacted configuration health.",
    status: "partial",
    requiredCapabilities: ["providers:read"],
    summary: "Drawbridge provider status without OAuth secrets.",
    surfaceLabel: "Auth Surface",
    entryHint: "Provider posture is already visible; this page becomes its stable cockpit home.",
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
