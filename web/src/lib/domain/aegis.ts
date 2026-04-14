import { lookoutModules } from "../../shell/module-registry";
import { lookoutEnvironment } from "../../env";
import type { NatsContextValue } from "../nats/nats-types";

export interface AegisSection {
  key: string;
  title: string;
  summary: string;
  status: "live" | "planned";
  detail: string;
}

export function buildAegisSections(nats: NatsContextValue): AegisSection[] {
  return [
    {
      key: "interfaces",
      title: "Interfaces",
      summary: "Host and domain entry points that define the visible estate boundary.",
      status: "planned",
      detail:
        "The cockpit currently knows the expected same-origin estate boundary, but no live interface listing subject is exposed to the browser yet.",
    },
    {
      key: "routes",
      title: "Routes",
      summary: "Path matching, auth mode, and upstream destination visibility.",
      status: "planned",
      detail:
        "Tracked Lookout JSON files remain templates only. Live route inspection needs a dedicated Aegis read adapter over NATS before the browser can enumerate route truth.",
    },
    {
      key: "requirements",
      title: "Access Requirements",
      summary: "Required badges, auth mode, and route intent.",
      status: "planned",
      detail: `The shell is already centered on same-origin auth (${lookoutEnvironment.authBasePath}) and transport (${lookoutEnvironment.natsPath}), but route-by-route access requirements are not yet exported to the web client.`,
    },
    {
      key: "config",
      title: "Config Source",
      summary: "Where live edge state should come from, and whether the shell can reach it.",
      status: nats.state === "connected" ? "live" : "planned",
      detail:
        nats.state === "connected"
          ? "The browser transport is live. The next Aegis step is to expose structured config and route inspection subjects over that rail."
          : "The browser transport is not yet live, so the shell reports the intended control rail without misrepresenting tracked template files as estate truth.",
    },
  ];
}

export function getAvailableSurfaceCount() {
  return lookoutModules.length;
}
