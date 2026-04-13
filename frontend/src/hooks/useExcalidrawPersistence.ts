import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";
import { ApiError, getScene, saveScene, consumePrefetchedScene } from "../lib/api";
import { sanitizeAppState } from "../lib/sanitizeAppState";
import { useAuth } from "../auth/AuthContext";
import type { SceneDetail } from "../lib/types";

interface Options {
  token: string | null;
  ignoreNextOnChange?: React.MutableRefObject<number>;
}

interface PersistenceState {
  setExcalidrawAPI: (api: ExcalidrawImperativeAPI | null) => void;
  onChange: (
    elements: readonly unknown[],
    appState: Record<string, unknown>,
  ) => void;
  loading: boolean;
  saving: boolean;
  saved: boolean;
  scene: SceneDetail | null;
  error: string | null;
  reload: () => void;
}

export function useExcalidrawPersistence(
  docId: string,
  opts: Options,
): PersistenceState {
  const { token, ignoreNextOnChange } = opts;
  const sceneRef = useRef<SceneDetail | null>(null);
  const { logout } = useAuth();

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const initialLoadDone = useRef(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const retryRef = useRef<number | undefined>(undefined);
  const latestRef = useRef<{
    elements: readonly unknown[];
    appState: Record<string, unknown>;
  } | null>(null);
  const sentRef = useRef<{
    elements: readonly unknown[];
    appState: Record<string, unknown>;
  } | null>(null);
  const lastSignalRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const retryCountRef = useRef(0);
  const aliveRef = useRef(true);

  const walKey = `exc_wal_${docId}`;

  const writeWAL = useCallback((elements: readonly unknown[], appState: Record<string, unknown>) => {
    try {
      localStorage.setItem(walKey, JSON.stringify({
        elements,
        appState: sanitizeAppState(appState),
        timestamp: Date.now(),
      }));
    } catch {
      // localStorage full or unavailable — best effort
    }
  }, [walKey]);

  const clearWAL = useCallback(() => {
    try { localStorage.removeItem(walKey); } catch { /* noop */ }
  }, [walKey]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scene, setScene] = useState<SceneDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const setExcalidrawAPI = useCallback(
    (api: ExcalidrawImperativeAPI | null) => {
      apiRef.current = api;
      // The Excalidraw component is now mounted with our initialData.
      // It is safe to start accepting onChange events for autosave.
      if (api) initialLoadDone.current = true;
    },
    [],
  );

  // Load scene on mount / docId change / reload
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    initialLoadDone.current = false;
    lastSignalRef.current = null;
    latestRef.current = null;
    sentRef.current = null;
    setLoading(true);
    setError(null);
    setSaved(false);
    setScene(null);

    const prefetched = consumePrefetchedScene(docId);
    (prefetched ? Promise.resolve(prefetched) : getScene(docId, token))
      .then((data) => {
        if (cancelled) return;
        // Check for WAL recovery (skip if using prefetched data — its
        // updatedAt may be stale, making the timestamp comparison unsafe)
        try {
          const walRaw = !prefetched ? localStorage.getItem(walKey) : null;
          if (walRaw) {
            const wal = JSON.parse(walRaw) as {
              elements: readonly unknown[];
              appState: Record<string, unknown>;
              timestamp: number;
            };
            const serverTime = new Date(data.updatedAt).getTime();
            if (wal.timestamp > serverTime && Array.isArray(wal.elements) && wal.elements.length > 0) {
              // WAL has newer data — use it and clear WAL
              data = {
                ...data,
                elements: wal.elements as SceneDetail["elements"],
                appState: wal.appState as SceneDetail["appState"],
              };
              localStorage.removeItem(walKey);
            } else {
              localStorage.removeItem(walKey);
            }
          }
        } catch {
          // WAL parse failed — ignore
          try { localStorage.removeItem(walKey); } catch { /* noop */ }
        }
        sceneRef.current = data;
        setScene(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          if (err.status === 401) {
            logout();
            return;
          }
          setError(err.message);
        } else {
          setError("Failed to load scene");
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, token, reloadTick]);

  // Cleanup debounce + retry on unmount, and flush one final save.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (debounceRef.current !== undefined) {
        window.clearTimeout(debounceRef.current);
      }
      if (retryRef.current !== undefined) {
        window.clearTimeout(retryRef.current);
      }
      const payload = latestRef.current;
      if (payload && payload !== sentRef.current) {
        // Write WAL as safety net before unmount
        writeWAL(payload.elements, payload.appState);
        try {
          const authToken =
            token ?? window.localStorage.getItem("exc_token");
          if (authToken) {
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            };
            const base = import.meta.env.VITE_API_URL ?? "";
            fetch(
              `${base}/api/scenes/${encodeURIComponent(docId)}`,
              {
                method: "PUT",
                headers,
                body: JSON.stringify({
                  elements: payload.elements,
                  appState: sanitizeAppState(payload.appState),
                }),
                keepalive: true,
              },
            ).catch(() => {
              // best-effort
            });
          }
        } catch {
          // best-effort
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, token]);

  const doSave = useCallback(async () => {
    if (!token) return;
    const payload = latestRef.current;
    if (!payload) return;
    if (inFlightRef.current) {
      if (retryRef.current !== undefined) window.clearTimeout(retryRef.current);
      retryRef.current = window.setTimeout(() => {
        void doSave();
      }, 300);
      return;
    }
    inFlightRef.current = true;
    sentRef.current = payload;
    writeWAL(payload.elements, payload.appState);
    setSaving(true);
    setSaved(false);
    try {
      await saveScene(
        docId,
        {
          elements: payload.elements,
          appState: sanitizeAppState(payload.appState),
        },
        token,
      );
      if (!aliveRef.current) return;
      setSaving(false);
      setSaved(true);
      setError(null);
      retryCountRef.current = 0;
      clearWAL();
    } catch (err: unknown) {
      if (!aliveRef.current) return;
      setSaving(false);
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout();
          return;
        }
        if (err.status === 413) {
          // Quota exceeded — no retry
          setError(err.message);
          retryCountRef.current = 0;
          return;
        }
        // Transient error (network=0, 5xx) — schedule retry with backoff
        if (err.status === 0 || err.status >= 500) {
          retryCountRef.current++;
          if (retryCountRef.current <= 5) {
            const delay = Math.min(2000 * Math.pow(2, retryCountRef.current - 1), 30000);
            setError(`Save failed — retrying (${retryCountRef.current}/5)`);
            retryRef.current = window.setTimeout(() => {
              void doSave();
            }, delay);
            return;
          }
        }
        setError(err.message);
      } else {
        setError("Save failed");
      }
      retryCountRef.current = 0;
    } finally {
      inFlightRef.current = false;
    }
  }, [docId, token, logout, writeWAL, clearWAL]);

  const onChange = useCallback(
    (
      elements: readonly unknown[],
      appState: Record<string, unknown>,
    ) => {
      if (ignoreNextOnChange && ignoreNextOnChange.current > 0) {
        ignoreNextOnChange.current--;
        return;
      }
      if (!initialLoadDone.current) return;
      const current = sceneRef.current;
      if (!current || current.role === "viewer") return;
      // Content-aware dedupe: rolling int32 hash over element ids + versions
      // catches moves (version bump), reorders, adds/deletes without walking
      // the full payload.
      let signal = elements.length * 31;
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i] as { version?: number; id?: string };
        signal = (signal * 31 + (el.version ?? 0)) | 0;
        const id = el.id ?? "";
        for (let j = 0; j < id.length; j++) {
          signal = (signal * 31 + id.charCodeAt(j)) | 0;
        }
      }
      if (lastSignalRef.current === signal) return;
      lastSignalRef.current = signal;
      latestRef.current = { elements, appState };
      writeWAL(elements, appState);
      setSaved(false);
      if (debounceRef.current !== undefined) {
        window.clearTimeout(debounceRef.current);
      }
      debounceRef.current = window.setTimeout(() => {
        void doSave();
      }, 1000);
    },
    [doSave, writeWAL],
  );

  const reload = useCallback(() => {
    setReloadTick((t) => t + 1);
  }, []);

  // Warn user before closing tab with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const payload = latestRef.current;
      if (payload && payload !== sentRef.current) {
        writeWAL(payload.elements, payload.appState);
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [writeWAL]);

  // Write WAL when tab goes to background; flush pending save when it returns
  useEffect(() => {
    if (!token || !docId) return;
    let lastHidden = 0;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        lastHidden = Date.now();
        const payload = latestRef.current;
        if (payload) writeWAL(payload.elements, payload.appState);
      } else if (document.visibilityState === 'visible' && lastHidden > 0) {
        const elapsed = Date.now() - lastHidden;
        // If hidden for >30s, flush any pending save immediately
        if (elapsed > 30_000 && latestRef.current && latestRef.current !== sentRef.current) {
          void doSave();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [token, docId, writeWAL, doSave]);

  return {
    setExcalidrawAPI,
    onChange,
    loading,
    saving,
    saved,
    scene,
    error,
    reload,
  };
}
