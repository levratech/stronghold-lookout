import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { lookoutEnvironment } from "../../env";
import {
  clearAuthHint,
  fetchSessionSnapshot,
  logoutSession,
  openAuthWindow,
  persistAuthHint,
  sessionHintSnapshot,
} from "./session-client";
import type { SessionContextValue, SessionSnapshot } from "./session-types";

const defaultSnapshot: SessionSnapshot = {
  status: "loading",
  source: "unknown",
  account: null,
  identity: null,
  context: null,
  interfaceMode: "unknown",
  root: null,
  activePrincipal: null,
  badgeSummary: {
    badgeIds: [],
    count: 0,
  },
  transport: {
    path: lookoutEnvironment.natsPath,
    mode: "session_backed",
    ready: false,
    detail:
      "Checking whether a browser-safe transport rail is available without exposing reusable secrets.",
  },
  detail: "Checking same-origin session bootstrap.",
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(defaultSnapshot);
  const popupPending = useRef(false);

  const refresh = async () => {
    setSnapshot((current) =>
      current.status === "loading"
        ? current
        : { ...current, status: "loading", detail: "Refreshing operator session state." },
    );

    const controller = new AbortController();
    try {
      const nextSnapshot = await fetchSessionSnapshot(controller.signal);
      setSnapshot(nextSnapshot);
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : "Unknown failure while checking session state.";
      setSnapshot({
        status: "error",
        source: "unknown",
        account: null,
        identity: null,
        context: null,
        interfaceMode: "unknown",
        root: null,
        activePrincipal: null,
        badgeSummary: {
          badgeIds: [],
          count: 0,
        },
        transport: defaultSnapshot.transport,
        detail: `Session bootstrap failed: ${detail}`,
      });
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (!event.data || typeof event.data !== "object") {
        return;
      }

      const payload = event.data as Record<string, unknown>;
      if (payload.type !== "stronghold:auth" || payload.status !== "ok") {
        return;
      }

      popupPending.current = false;
      persistAuthHint();
      setSnapshot({
        status: "authenticated",
        source: "callback",
        account: snapshot.account,
        identity: snapshot.identity,
        context: snapshot.context,
        interfaceMode: snapshot.interfaceMode,
        root: snapshot.root,
        activePrincipal: snapshot.activePrincipal,
        badgeSummary: snapshot.badgeSummary,
        transport: snapshot.transport,
        detail:
          "Drawbridge completed the auth flow and stored the session cookie. Revalidating bootstrap state.",
      });
      void refresh();
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const login = () => {
    popupPending.current = true;
    setSnapshot({
      status: "authenticating",
      source: "unknown",
      account: snapshot.account,
      identity: snapshot.identity,
      context: snapshot.context,
      interfaceMode: snapshot.interfaceMode,
      root: snapshot.root,
      activePrincipal: snapshot.activePrincipal,
      badgeSummary: snapshot.badgeSummary,
      transport: snapshot.transport,
      detail: `Opening ${lookoutEnvironment.authProvider} login through the same-origin auth bridge.`,
    });
    openAuthWindow();
  };

  const logout = () => {
    popupPending.current = false;
    setSnapshot({
      ...snapshot,
      status: "loading",
      detail: "Clearing same-origin Stronghold session state.",
    });

    void logoutSession()
      .catch(() => {
        // Local hint cleanup is still safe even when the remote logout endpoint is unavailable.
      })
      .finally(() => {
        clearAuthHint();
        setSnapshot({
          status: "unauthenticated",
          source: "unknown",
          account: null,
          identity: null,
          context: null,
          interfaceMode: "unknown",
          root: null,
          activePrincipal: null,
          badgeSummary: {
            badgeIds: [],
            count: 0,
          },
          transport: defaultSnapshot.transport,
          detail:
            "Cleared the same-origin logout endpoint and local cockpit auth hint.",
        });
      });
  };

  return (
    <SessionContext.Provider
      value={{
        snapshot:
          snapshot.status === "loading" && sessionStorage.getItem("lookout.session.hint")
            ? sessionHintSnapshot()
            : snapshot,
        login,
        logout,
        refresh,
        authBasePath: lookoutEnvironment.authBasePath,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
