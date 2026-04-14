import type { ReactNode } from "react";

export type LookoutModuleId = "overview" | "sentry" | "aegis";

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
    id: "sentry",
    name: "Sentry",
    navLabel: "Sentry",
    route: "/sentry",
    icon: "SE",
    description: "Authority, identities, badges, and operator context.",
    status: "partial",
    requiredCapabilities: ["identity:read", "badges:read"],
    summary: "Authority-facing structure for users, badges, assignments, and session detail.",
    surfaceLabel: "Authority Surface",
    entryHint: "Read-first now; prepared for identity inventory and badge assignment next.",
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
