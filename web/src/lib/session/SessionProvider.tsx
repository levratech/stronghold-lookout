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
  openAuthWindow,
  persistAuthHint,
  sessionHintSnapshot,
} from "./session-client";
import type { SessionContextValue, SessionSnapshot } from "./session-types";

const defaultSnapshot: SessionSnapshot = {
  status: "loading",
  source: "unknown",
  root: null,
  activePrincipal: null,
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
        root: null,
        activePrincipal: null,
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
        root: snapshot.root,
        activePrincipal: snapshot.activePrincipal,
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
      root: snapshot.root,
      activePrincipal: snapshot.activePrincipal,
      transport: snapshot.transport,
      detail: `Opening ${lookoutEnvironment.authProvider} login through the same-origin auth bridge.`,
    });
    openAuthWindow();
  };

  const logout = () => {
    popupPending.current = false;
    clearAuthHint();
    setSnapshot({
      status: "unauthenticated",
      source: "unknown",
      root: null,
      activePrincipal: null,
      transport: defaultSnapshot.transport,
      detail:
        "Cleared the cockpit's local auth hint. No same-origin logout endpoint is exposed yet, so the browser session itself may still exist.",
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
