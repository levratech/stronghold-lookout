function buildWebSocketURL(pathname: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${pathname}`;
}

export const lookoutEnvironment = {
  estateName: import.meta.env.VITE_LOOKOUT_ESTATE_NAME ?? "Stronghold Estate",
  cockpitName: import.meta.env.VITE_LOOKOUT_COCKPIT_NAME ?? "Lookout Cockpit",
  authBasePath: import.meta.env.VITE_LOOKOUT_AUTH_BASE_PATH ?? "/_/auth",
  authProvider: import.meta.env.VITE_LOOKOUT_AUTH_PROVIDER ?? "google",
  authProvidersPath:
    import.meta.env.VITE_LOOKOUT_AUTH_PROVIDERS_PATH ?? "/_/auth/providers",
  authorityReadBasePath:
    import.meta.env.VITE_LOOKOUT_AUTHORITY_READ_BASE_PATH ?? "/_/authority/read",
  sessionBootstrapPath:
    import.meta.env.VITE_LOOKOUT_SESSION_BOOTSTRAP_PATH ?? "/_/auth/session",
  logoutPath: import.meta.env.VITE_LOOKOUT_LOGOUT_PATH ?? "/_/auth/logout",
  natsPath: import.meta.env.VITE_LOOKOUT_NATS_PATH ?? "/_/nats",
};

export function getNatsServerURL() {
  return buildWebSocketURL(lookoutEnvironment.natsPath);
}
