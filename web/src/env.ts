function buildWebSocketURL(pathname: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${pathname}`;
}

export const lookoutEnvironment = {
  estateName: import.meta.env.VITE_LOOKOUT_ESTATE_NAME ?? "Stronghold Estate",
  cockpitName: import.meta.env.VITE_LOOKOUT_COCKPIT_NAME ?? "Lookout Cockpit",
  authBasePath: import.meta.env.VITE_LOOKOUT_AUTH_BASE_PATH ?? "/_/auth",
  authProvider: import.meta.env.VITE_LOOKOUT_AUTH_PROVIDER ?? "google",
  sessionBootstrapPath:
    import.meta.env.VITE_LOOKOUT_SESSION_BOOTSTRAP_PATH ?? "/_/auth/session",
  natsPath: import.meta.env.VITE_LOOKOUT_NATS_PATH ?? "/_/nats",
};

export function getNatsServerURL() {
  return buildWebSocketURL(lookoutEnvironment.natsPath);
}
