import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

/**
 * Custom event used by keyboard shortcuts to ask the home page to focus
 * its search input. The home page listens for this event and either
 * focuses the input directly (when already mounted) or focuses on mount
 * if a navigation is in progress.
 */
export const FOCUS_HOME_SEARCH_EVENT = "focus-home-search";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

interface ShortcutsState {
  helpOpen: boolean;
  setHelpOpen: Dispatch<SetStateAction<boolean>>;
}

/**
 * Mount-once global keyboard shortcut handler.
 * Wires Cmd/Ctrl+K (focus search), Cmd/Ctrl+N (new doc),
 * vim-style g+h / g+t / g+a navigation, and ? to show help.
 */
export function useKeyboardShortcuts({ setHelpOpen }: ShortcutsState): void {
  const navigate = useNavigate();
  const { user } = useAuth();
  const lastKeyRef = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    function focusHomeSearch(): void {
      // Dispatch custom event so the home page (if mounted) can focus
      // its search input. Use a microtask delay so navigation has a
      // chance to mount the page first.
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent(FOCUS_HOME_SEARCH_EVENT));
      }, 0);
    }

    function onKey(e: KeyboardEvent): void {
      // Always allow Escape — but the Modal primitive already handles it.
      if (e.key === "Escape") return;

      const editable = isEditableTarget(e.target);
      const meta = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + K → focus the search input on home
      if (meta && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        if (window.location.pathname !== "/") {
          navigate("/");
        }
        focusHomeSearch();
        return;
      }

      // Cmd/Ctrl + N → new document on home
      if (meta && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        if (window.location.pathname !== "/") {
          navigate("/");
        }
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("home-new-doc"));
        }, 0);
        return;
      }

      // Anything below this point should be ignored when typing.
      if (editable) {
        lastKeyRef.current = null;
        return;
      }

      // / → focus search (only when not typing)
      if (e.key === "/") {
        e.preventDefault();
        if (window.location.pathname !== "/") {
          navigate("/");
        }
        focusHomeSearch();
        return;
      }

      // ? (shift-/) → show help
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      // Two-key g sequences
      const now = Date.now();
      const last = lastKeyRef.current;
      if (last && last.key === "g" && now - last.at < 1000) {
        if (e.key === "h") {
          e.preventDefault();
          lastKeyRef.current = null;
          navigate("/");
          return;
        }
        if (e.key === "t") {
          e.preventDefault();
          lastKeyRef.current = null;
          navigate("/");
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("home-goto-trash"));
          }, 0);
          return;
        }
        if (e.key === "a") {
          e.preventDefault();
          lastKeyRef.current = null;
          if (user?.isAdmin) navigate("/admin");
          return;
        }
        // Unknown follow-up — clear and fall through.
        lastKeyRef.current = null;
      }

      if (e.key === "g") {
        lastKeyRef.current = { key: "g", at: now };
        return;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, user, setHelpOpen]);
}
