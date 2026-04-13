import { useEffect, useRef, useState } from "react";

const KONAMI_SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

const TIMEOUT_MS = 3000;

export function useKonamiCode(): number {
  const [activated, setActivated] = useState(0);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;

      const expected = KONAMI_SEQUENCE[indexRef.current];
      if (e.key.toLowerCase() === expected.toLowerCase()) {
        indexRef.current++;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          indexRef.current = 0;
        }, TIMEOUT_MS);

        if (indexRef.current === KONAMI_SEQUENCE.length) {
          indexRef.current = 0;
          if (timerRef.current) clearTimeout(timerRef.current);
          setActivated((n) => n + 1);
        }
      } else {
        indexRef.current = 0;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return activated;
}
