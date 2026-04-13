import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type {
  ExcalidrawImperativeAPI,
  Collaborator,
} from "@excalidraw/excalidraw/types/types";
import { reconcileElements } from "../lib/reconcile";
import { useAuth } from "../auth/AuthContext";

export interface CollabUser {
  userId: string;
  username: string;
  color: string;
  role: "owner" | "editor" | "viewer";
  lastActiveAt: number;
}

interface UseExcalidrawCollabOpts {
  docId: string;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  enabled: boolean;
}

interface UseExcalidrawCollabResult {
  collaborators: CollabUser[];
  isConnected: boolean;
  collabError: string | null;
  ignoreNextOnChange: React.MutableRefObject<number>;
  lastActiveMap: React.MutableRefObject<Map<string, number>>;
  onCollabChange: (elements: readonly unknown[]) => void;
  onCollabPointerUpdate: (payload: {
    pointer: { x: number; y: number; tool: string };
    button: string;
  }) => void;
}

export function useExcalidrawCollab(
  opts: UseExcalidrawCollabOpts,
): UseExcalidrawCollabResult {
  const { docId, excalidrawAPI, enabled } = opts;
  const { token } = useAuth();

  const socketRef = useRef<Socket | null>(null);
  const ignoreNextOnChange = useRef(0);
  const pointerMapRef = useRef<Map<string, Collaborator>>(new Map());
  const lastActiveMapRef = useRef<Map<string, number>>(new Map());
  const lastPointerEmitRef = useRef(0);
  const sceneUpdateTimerRef = useRef<number | undefined>(undefined);
  const pendingElementsRef = useRef<readonly unknown[] | null>(null);

  const [collaborators, setCollaborators] = useState<CollabUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [collabError, setCollabError] = useState<string | null>(null);

  // Connect socket and set up event listeners
  useEffect(() => {
    if (!enabled || !token || !docId) return;

    const base = import.meta.env.VITE_API_URL as string | undefined;
    const socketUrl = base || window.location.origin;

    const socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      setCollabError(null);
      socket.emit("join-room", { sceneId: docId });
    });

    socket.on("disconnect", (reason) => {
      setIsConnected(false);
      if (reason === "io server disconnect") {
        // Server forcefully disconnected us — try reconnecting
        setCollabError("Disconnected by server — reconnecting...");
        socket.connect();
      } else if (reason === "io client disconnect") {
        // We called disconnect() intentionally (e.g. auth failure)
        // Don't reconnect
      } else {
        // transport close, ping timeout, etc. — Socket.IO auto-reconnects
        setCollabError("Connection lost — reconnecting...");
      }
    });

    socket.on("connect_error", (err: Error) => {
      const msg = err.message.toLowerCase();
      if (msg.includes("unauthorized") || msg.includes("jwt") || msg.includes("disabled")) {
        // Genuine auth failure — stop trying
        setCollabError("Session expired — please refresh");
        socket.disconnect();
      } else {
        // Transient error — Socket.IO will auto-retry
        setCollabError("Reconnecting...");
      }
    });

    socket.io.on("reconnect", () => {
      // Successfully reconnected — join-room is re-emitted via the
      // "connect" handler above, so just clear the error
      setCollabError(null);
    });

    socket.io.on("reconnect_failed", () => {
      setCollabError("Unable to reconnect — collab unavailable");
    });

    socket.on(
      "scene-init",
      (data: {
        elements?: readonly Record<string, unknown>[];
        collaborators: CollabUser[];
      }) => {
        setCollaborators(
          data.collaborators.map((c) => ({
            ...c,
            lastActiveAt: c.lastActiveAt ?? Date.now(),
          })),
        );
        // Reconcile server state with local canvas to catch any changes
        // made between the HTTP load and the socket join
        if (excalidrawAPI && data.elements) {
          const localElements = excalidrawAPI.getSceneElements() as readonly {
            id: string;
            version: number;
            versionNonce: number;
            [key: string]: unknown;
          }[];
          const remoteElements = data.elements as readonly {
            id: string;
            version: number;
            versionNonce: number;
            [key: string]: unknown;
          }[];
          const merged = reconcileElements(localElements, remoteElements);
          ignoreNextOnChange.current++;
          excalidrawAPI.updateScene({
            elements: merged as unknown as Parameters<
              typeof excalidrawAPI.updateScene
            >[0]["elements"],
            commitToHistory: false,
          });
        }
      },
    );

    socket.on(
      "scene-update",
      (data: { elements: readonly Record<string, unknown>[] }) => {
        if (!excalidrawAPI) return;

        const localElements = excalidrawAPI.getSceneElements() as readonly {
          id: string;
          version: number;
          versionNonce: number;
          [key: string]: unknown;
        }[];

        const remoteElements = data.elements as readonly {
          id: string;
          version: number;
          versionNonce: number;
          [key: string]: unknown;
        }[];

        const merged = reconcileElements(localElements, remoteElements);

        // CRITICAL: increment counter BEFORE updateScene to prevent re-broadcast
        ignoreNextOnChange.current++;
        excalidrawAPI.updateScene({
          elements: merged as unknown as Parameters<
            typeof excalidrawAPI.updateScene
          >[0]["elements"],
          commitToHistory: false,
        });
      },
    );

    socket.on(
      "pointer-update",
      (data: {
        fromUserId: string;
        pointer: { x: number; y: number; tool?: string };
        button: "up" | "down";
        username: string;
        color: string;
      }) => {
        if (!excalidrawAPI) return;

        pointerMapRef.current.set(data.fromUserId, {
          pointer: {
            x: data.pointer.x,
            y: data.pointer.y,
            tool: (data.pointer.tool as "pointer" | "laser") || "pointer",
          },
          button: data.button,
          username: data.username,
          color: {
            background: data.color,
            stroke: data.color,
          },
        });

        // Track last activity for ghost mode (ref to avoid re-renders on every pointer event)
        lastActiveMapRef.current.set(data.fromUserId, Date.now());

        excalidrawAPI.updateScene({
          collaborators: new Map(pointerMapRef.current),
        });
      },
    );

    socket.on(
      "collaborator-joined",
      (data: Record<string, unknown>) => {
        setCollaborators((prev) => {
          if (prev.some((c) => c.userId === data.userId)) {
            return prev;
          }
          return [
            ...prev,
            {
              userId: data.userId as string,
              username: data.username as string,
              color: data.color as string,
              role: data.role as CollabUser["role"],
              lastActiveAt: Date.now(),
            },
          ];
        });
      },
    );

    socket.on(
      "collaborator-left",
      (data: { userId: string }) => {
        pointerMapRef.current.delete(data.userId);
        if (excalidrawAPI) {
          excalidrawAPI.updateScene({
            collaborators: new Map(pointerMapRef.current),
          });
        }
        setCollaborators((prev) =>
          prev.filter((c) => c.userId !== data.userId),
        );
      },
    );

    return () => {
      socket.emit("leave-room", { sceneId: docId });
      socket.disconnect();
      socketRef.current = null;
      pointerMapRef.current.clear();
      if (sceneUpdateTimerRef.current !== undefined) {
        window.clearTimeout(sceneUpdateTimerRef.current);
        sceneUpdateTimerRef.current = undefined;
      }
      pendingElementsRef.current = null;
      setIsConnected(false);
      setCollaborators([]);
      setCollabError(null);
    };
  }, [enabled, token, docId, excalidrawAPI]);

  const onCollabChange = useCallback(
    (elements: readonly unknown[]) => {
      if (ignoreNextOnChange.current > 0) {
        // The persistence hook decrements; skip broadcast
        return;
      }
      const socket = socketRef.current;
      if (!socket?.connected) return;

      // Debounce scene-update broadcasts to 200ms to prevent flooding
      pendingElementsRef.current = elements;
      if (sceneUpdateTimerRef.current !== undefined) return;
      sceneUpdateTimerRef.current = window.setTimeout(() => {
        sceneUpdateTimerRef.current = undefined;
        const pending = pendingElementsRef.current;
        if (pending && socketRef.current?.connected) {
          socketRef.current.emit("scene-update", {
            sceneId: docId,
            elements: pending,
          });
        }
        pendingElementsRef.current = null;
      }, 200);
    },
    [docId],
  );

  const onCollabPointerUpdate = useCallback(
    (payload: {
      pointer: { x: number; y: number; tool: string };
      button: string;
    }) => {
      const now = Date.now();
      if (now - lastPointerEmitRef.current < 60) return;
      lastPointerEmitRef.current = now;

      const socket = socketRef.current;
      if (!socket?.connected) return;

      socket.emit("pointer-update", {
        sceneId: docId,
        pointer: payload.pointer,
        button: payload.button,
      });
    },
    [docId],
  );

  return {
    collaborators,
    isConnected,
    collabError,
    ignoreNextOnChange,
    lastActiveMap: lastActiveMapRef,
    onCollabChange,
    onCollabPointerUpdate,
  };
}
