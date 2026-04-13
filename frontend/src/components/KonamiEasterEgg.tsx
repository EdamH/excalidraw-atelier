import { useCallback, useEffect, useRef, useState } from "react";
import { useKonamiCode } from "../hooks/useKonamiCode";

const BRUTALIST_DURATION = 10_000;

export function KonamiEasterEgg() {
  const activated = useKonamiCode();
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    document.documentElement.classList.remove("brutalist-mode");
    setShow(false);
  }, []);

  useEffect(() => {
    if (!activated) return;
    setShow(true);
    document.documentElement.classList.add("brutalist-mode");
    timerRef.current = setTimeout(dismiss, BRUTALIST_DURATION);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.documentElement.classList.remove("brutalist-mode");
    };
  }, [activated, dismiss]);

  // Escape key dismisses early
  useEffect(() => {
    if (!show) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [show, dismiss]);

  if (!show) return null;

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] animate-brutalist-reveal cursor-pointer"
      onClick={dismiss}
      title="Click or press Esc to dismiss"
    >
      <div className="px-6 py-3 border-2 border-[#39FF14] bg-black">
        <span className="font-mono uppercase tracking-[0.2em] text-[#39FF14] text-xs">
          // BRUTALIST MODE ACTIVATED — ESC TO DISMISS
        </span>
      </div>
    </div>
  );
}
