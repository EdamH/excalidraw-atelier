import { useCallback, useEffect, useRef, useState } from "react";
import { Crown, Moon, Heart, LayoutGrid, Cookie, Droplets, Hammer, type LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";
import type { PetMood, PetState, AchievementBadge } from "../lib/types";
import { InlineRename } from "./ui/InlineRename";
import { CardCornerBrackets } from "./ui/Card";

// ─── Brutalist Mode Detection ────────────────────────────────────────────

function useBrutalistMode() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const check = () => setActive(el.classList.contains("brutalist-mode"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return active;
}

// ─── Kaomoji Art ─────────────────────────────────────────────────────────

const PET_FACES: Record<PetMood, { base: string; idle: string[] }> = {
  ECSTATIC: {
    base: "(★‿★)",
    idle: [
      "(★▽★)",       // excited
      "(★‿★)ノ",     // waving
      "(★ω★)",       // bliss
      "(★‿★)♪",      // singing
      "(★‿★)◝",      // dancing
      "(★▽★)🍿",     // watching something amazing
      "( ★‿★)",      // glance left
      "(★‿★ )",      // glance right
      "( ★▽★)",      // look left excited
      "(★▽★ )",      // look right excited
    ],
  },
  HAPPY: {
    base: "(◕‿◕)",
    idle: [
      "(◕ᴗ◕)",       // soft smile
      "(◕‿◕)ノ",     // waving
      "(◕ω◕)",       // cozy
      "(◕‿◕)♪",      // humming
      "(◕‿◕)☕",      // sipping tea
      "(◕‿◕)🍿",     // watching TV
      "(◕ᴗ◕)~♡",     // daydreaming
      "(◕‿◕)✎",      // doodling
      "( ◕‿◕)",      // glance left
      "(◕‿◕ )",      // glance right
      "( ◕ᴗ◕)",      // peek left
      "(◕ᴗ◕ )",      // peek right
    ],
  },
  CONTENT: {
    base: "(◕ᴗ◕)",
    idle: [
      "(◕‿◕)",       // smile
      "(◕ᴗ◕ )",      // looking right
      "( ◕ᴗ◕)",      // looking left
      "(◕ᴗ◕)~",      // relaxing
      "(◕ᴗ◕)☕",      // tea time
      "(◕ᴗ◕)📖",     // reading
      "( ◕‿◕)",      // glance left
      "(◕‿◕ )",      // glance right
      "( ◕ᴗ◕)~",     // looking left relaxed
      "(◕ᴗ◕ )~",     // looking right relaxed
    ],
  },
  HUNGRY: {
    base: "(◕︵◕)",
    idle: [
      "(◕~◕)",       // whimpering
      "(◕︵◕)…",     // waiting
      "(◕_◕)",       // blank stare
      "(◕︵◕)🍕",    // dreaming of food
      "(◕_◕)…◦",     // drooling
      "( ◕︵◕)",     // looking left hoping
      "(◕︵◕ )",     // looking right hoping
      "( ◕_◕)",      // glance left
      "(◕_◕ )",      // glance right
    ],
  },
  SLEEPY: {
    base: "(−_−) zzZ",
    idle: [
      "(−_−) zZ",    // light sleep
      "(−_−) z",     // drifting
      "(−_−) zzZ",   // deep sleep
      "(−_−)~☁",     // dreaming
      "(−▽−) zzZ",   // snoring
      "( −_−) zzZ",  // rolled left
      "(−_− ) zzZ",  // rolled right
      "(−_◕) ?",     // one eye open
    ],
  },
  SICK: {
    base: "(×_×)",
    idle: [
      "(×_×)~",      // dizzy
      "(×_×).",       // still
      "(×~×)",        // woozy
      "(×_×)°",       // feverish
      "( ×_×)",       // slumped left
      "(×_× )",       // slumped right
      "(×_◕) ?",     // one eye open
    ],
  },
  GHOST: {
    base: "( _ _ )",
    idle: [
      "(  _  )",      // fading
      "( _ _ ) .",    // dust
      "( _ _ )",      // still
      "(  _  ) .",    // almost gone
      "(  _ _  )",    // drifting left
      "( _  _ )",     // drifting right
    ],
  },
};

// Demon mode — activated during Konami brutalist mode
const DEMON_FACES: Record<PetMood, { base: string; idle: string[] }> = {
  ECSTATIC: { base: "(⊙▽⊙)⚡", idle: ["(⊙▽⊙)🔥", "(⊙▽⊙)ノ⚡", "(⊙ω⊙)⚡", "(⊙▽⊙)♪🔥", "(⊙▽⊙)🍿🔥"] },
  HAPPY:    { base: "(👁‿👁)", idle: ["(👁ᴗ👁)", "(👁‿👁)~", "(👁ω👁)", "(👁‿👁)🍷", "(👁‿👁)♪"] },
  CONTENT:  { base: "(◣‿◢)", idle: ["(◣ᴗ◢)", "(◣‿◢ )", "( ◣‿◢)", "(◣‿◢)🔮", "(◣ᴗ◢)~☁"] },
  HUNGRY:   { base: "(◣︵◢)", idle: ["(◣~◢)", "(◣︵◢)…", "(◣_◢)", "(◣︵◢)🦴"] },
  SLEEPY:   { base: "(◣_◢) zzZ", idle: ["(◣_◢) zZ", "(◣_◢) z", "(◣_◢) zzZ", "(◣_◢)~🦇"] },
  SICK:     { base: "(☠_☠)", idle: ["(☠_☠)~", "(☠_☠).", "(☠~☠)", "(☠_☠)°🔥"] },
  GHOST:    { base: "( ☠ _ ☠ )", idle: ["(  ☠  )", "( ☠ _ ☠ ) .", "( ☠ _ ☠ )"] },
};

const DEMON_REACTION_SEQUENCES: Record<string, string[]> = {
  feed:  ["(◣△◢)", "(◣ᴗ◢)", "(◣△◢)", "(◣ᴗ◢)", "(◣△◢)", "(◣ᴗ◢)", "(◣‿◢)~", "(  ‿  )~🔥"],
  bathe: ["( ◣‿◢)", "(◣‿◢ )", "( ◣‿◢)", "(◣‿◢ )", "( ◣‿◢)", "(◣‿◢ )", "(◣‿◢)", "(◣ ◢)°"],
  pet:   ["(◣ω◢)", "(◣ω◢)", "(◣ω◢)", "(🖤‿🖤)"],
  bonk:  ["(◣_◢)", "(◣_◢)!", "(☠_☠)", "( ☠  _ ☠ )", "(💀_💀)~", "(💀_💀)~⚡"],
};

const DEMON_GREETINGS = ["heh heh heh~", "...boo.", "miss me?~", "i'm free~", "*evil giggle*", "fear me~ ♡"];

// Feed: rapid munching → satisfied sigh → passed out on back
// Bathe: rapid head shake → poof fluff-up
// Pet: soft bliss → heart eyes
const REACTION_SEQUENCES: Record<string, string[]> = {
  feed:  ["(◕△◕)", "(◕ᴗ◕)", "(◕△◕)", "(◕ᴗ◕)", "(◕△◕)", "(◕ᴗ◕)", "(◕‿◕)~", "(  ‿  )~♡"],
  bathe: ["( ◕‿◕)", "(◕‿◕ )", "( ◕‿◕)", "(◕‿◕ )", "( ◕‿◕)", "(◕‿◕ )", "(◕‿◕)", "(◕ ◕)°"],
  pet:   ["(◕ω◕)", "(◕ω◕)", "(◕ω◕)", "(♥‿♥)"],
  bonk:  ["(◕_◕)", "(◕_◕)!", "(×_×)", "( ×  _ × )", "(@_@)~", "(@_@)~✧"],
};

// Particles spawned per action type
const ACTION_PARTICLES: Record<string, string[]> = {
  feed:  ["·", "◦", "°", "·", "◦"],
  bathe: ["·", "✧", "°", "·", "✧"],
  pet:   ["♡", "♡", "♡"],
  bonk:  ["★", "✦", "✧", "※", "☆", "✦", "★"],
};

const ANTICIPATION_FACE = "(◕_◕)";
const PURR_VARIANTS = ["*purr*", "*purr purr*", "*purrrrr*~"];
const GREETING_VARIANTS = ["hii~", "oh! hi!", "hewwo~", "hehe hi!", "~hi hi~", "oh hey!"];

const MOOD_ART_COLOR: Record<PetMood, string> = {
  ECSTATIC: "text-plum",
  HAPPY: "text-ink",
  CONTENT: "text-ink",
  HUNGRY: "text-ink-soft",
  SLEEPY: "text-ink-fade",
  SICK: "text-ink-fade",
  GHOST: "text-ink-fade/40",
};

const MOOD_ANIMATION: Record<PetMood, string> = {
  ECSTATIC: "animate-pet-hop",
  HAPPY: "animate-pet-wiggle",
  CONTENT: "animate-pet-breathe",
  HUNGRY: "animate-pet-breathe",
  SLEEPY: "animate-pet-sway",
  SICK: "animate-pet-shiver",
  GHOST: "animate-pet-ghost",
};

const MOOD_TOOLTIP: Record<PetMood, string> = {
  ECSTATIC: "7+ day drawing streak — you're on fire!",
  HAPPY: "3–6 day drawing streak — keep it up!",
  CONTENT: "Drew something today",
  HUNGRY: "No activity for a couple of days",
  SLEEPY: "Idle for 3–7 days",
  SICK: "No drawing for over a week",
  GHOST: "Inactive for 14+ days",
};

const MOOD_LABEL: Record<PetMood, string> = {
  ECSTATIC: "OVER THE MOON",
  HAPPY: "TAIL WAGGING",
  CONTENT: "COZY",
  HUNGRY: "PECKISH",
  SLEEPY: "DOZING OFF",
  SICK: "MISSING YOU",
  GHOST: "FADING AWAY",
};

const BADGE_ACCESSORIES: { badgeId: string; icon: LucideIcon; label: string; color: string }[] = [
  { badgeId: "100-elements", icon: Crown, label: "100 ELEMENTS", color: "text-gold" },
  { badgeId: "night-owl", icon: Moon, label: "NIGHT OWL", color: "text-ink-fade" },
  { badgeId: "shared-5", icon: Heart, label: "SHARED WITH 5", color: "text-plum" },
  { badgeId: "organizer", icon: LayoutGrid, label: "ORGANIZER", color: "text-ink-soft" },
];

// ─── Floating Particles (hearts + purr text) ────────────────────────────

interface FloatingParticle {
  id: number;
  content: string;
  x: number;
  y: number;
  isText: boolean;
}

function FloatingParticles({ items, onDone }: { items: FloatingParticle[]; onDone: (id: number) => void }) {
  return (
    <>
      {items.map((p) => (
        <span
          key={p.id}
          className={cn(
            "pointer-events-none absolute whitespace-nowrap",
            p.isText
              ? "font-serif italic text-xs text-ink-soft animate-text-float"
              : "font-serif italic text-sm text-plum animate-heart-float"
          )}
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          onAnimationEnd={() => onDone(p.id)}
        >
          {p.isText ? <>«&thinsp;{p.content}&thinsp;»</> : p.content}
        </span>
      ))}
    </>
  );
}

// ─── Idle Animation Hook ─────────────────────────────────────────────────

function usePetAnimation(mood: PetMood, demon: boolean) {
  const faceMap = demon ? DEMON_FACES : PET_FACES;
  const faces = faceMap[mood];
  const [face, setFace] = useState(faces.base);
  const sequenceRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    function scheduleNext() {
      const delay = 3000 + Math.random() * 3000;
      timerRef.current = setTimeout(() => {
        if (sequenceRef.current) {
          scheduleNext();
          return;
        }
        const variant = faces.idle[Math.floor(Math.random() * faces.idle.length)];
        setFace(variant);
        setTimeout(() => {
          if (!sequenceRef.current) setFace(faces.base);
          scheduleNext();
        }, 800);
      }, delay);
    }
    setFace(faces.base);
    scheduleNext();
    return () => clearTimeout(timerRef.current);
  }, [mood, faces]);

  /** Play a sequence. Last `holdCount` frames use `holdDuration` instead of `frameDuration`. */
  const playSequence = useCallback((
    frames: string[],
    frameDuration: number,
    holdCount = 1,
    holdDuration = 800,
  ) => {
    sequenceRef.current = true;
    let i = 0;
    function next() {
      if (i < frames.length) {
        setFace(frames[i]);
        const isHold = i >= frames.length - holdCount;
        const delay = isHold ? holdDuration : frameDuration;
        i++;
        setTimeout(next, delay);
      } else {
        sequenceRef.current = false;
        setFace(faces.base);
      }
    }
    next();
  }, [faces]);

  const setOverride = useCallback((override: string | null) => {
    if (override) {
      sequenceRef.current = true;
      setFace(override);
    } else {
      sequenceRef.current = false;
      setFace(faces.base);
    }
  }, [faces]);

  return { face, playSequence, setOverride };
}

// ─── Draggable Prop ──────────────────────────────────────────────────────

function DraggableProp({
  icon: Icon,
  label,
  action,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  action: string;
  disabled: boolean;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      title={label}
      draggable={!disabled}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-pet-action", action);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={cn(
        "flex items-center justify-center w-7 h-7 border border-rule transition-all duration-200",
        disabled
          ? "opacity-30 cursor-not-allowed"
          : "cursor-grab active:cursor-grabbing hover:border-plum/30 hover:text-plum",
        dragging ? "opacity-30" : "text-ink-fade"
      )}
    >
      <Icon size={14} />
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────

interface TamagotchiPetProps {
  pet: PetState;
  badges: AchievementBadge[];
  onRename: (name: string) => Promise<void>;
  onInteract?: (action: "feed" | "bathe" | "pet") => Promise<void>;
  readOnly?: boolean;
}

export function TamagotchiPet({ pet, badges, onRename, onInteract, readOnly }: TamagotchiPetProps) {
  const demon = useBrutalistMode();
  const { face, playSequence, setOverride } = usePetAnimation(pet.mood, demon);
  const [actionCooldown, setActionCooldown] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [particles, setParticles] = useState<FloatingParticle[]>([]);
  const [moodOverride, setMoodOverride] = useState<string | null>(null);
  const [gazeFace, setGazeFace] = useState<React.ReactNode | null>(null);
  const particleIdRef = useRef(0);
  const purrTimerRef = useRef<ReturnType<typeof setInterval>>();
  const mouseDownRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const petFaceRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);

  const earnedBadgeIds = new Set(badges.filter((b) => b.earned).map((b) => b.id));
  const accessories = BADGE_ACCESSORIES.filter((a) => earnedBadgeIds.has(a.badgeId));

  // ── Spawn floating particles ──

  const spawnParticles = useCallback((items: { content: string; isText: boolean }[]) => {
    items.forEach((item, i) => {
      setTimeout(() => {
        setParticles((prev) => [...prev, {
          id: particleIdRef.current++,
          content: item.content,
          // Text spawns from tight center-top zone (mouth area), symbols scatter wider
          x: item.isText ? 35 + Math.random() * 30 : 15 + Math.random() * 70,
          y: item.isText ? 0 + Math.random() * 15 : 10 + Math.random() * 60,
          isText: item.isText,
        }]);
      }, i * 80);
    });
  }, []);

  const spawnHearts = useCallback((count: number) => {
    spawnParticles(Array.from({ length: count }, () => ({ content: "♡", isText: false })));
  }, [spawnParticles]);

  const spawnPurr = useCallback(() => {
    const text = PURR_VARIANTS[Math.floor(Math.random() * PURR_VARIANTS.length)];
    spawnParticles([{ content: text, isText: true }]);
  }, [spawnParticles]);

  const removeParticle = useCallback((id: number) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // ── Drag-drop action (feed / bathe) ──

  const triggerAction = useCallback(async (action: "feed" | "bathe" | "bonk") => {
    if (actionCooldown || !onInteract) return;
    setActionCooldown(true);

    const seqs = demon ? DEMON_REACTION_SEQUENCES : REACTION_SEQUENCES;
    const frames = seqs[action];
    const frameDuration = action === "bonk" ? 200 : 150;
    const holdDuration = action === "bonk" ? 1200 : 800;
    playSequence(frames, frameDuration, action === "bonk" ? 2 : 1, holdDuration);

    // Spawn action-specific particles
    const symbols = ACTION_PARTICLES[action];
    spawnParticles(symbols.map((s) => ({ content: s, isText: false })));

    // Spawn action speech text
    const ACTION_SPEECH: Record<string, string[]> = {
      feed:  ["num num~", "nom nom!", "num num num~"],
      bathe: ["scrub scrub~", "scrub scrub!", "splish splash~"],
      bonk:  ["ouch!", "aw!", "$&é@!!", "owie!"],
    };
    const speechPool = ACTION_SPEECH[action];
    const speech = speechPool[Math.floor(Math.random() * speechPool.length)];
    setTimeout(() => {
      spawnParticles([{ content: speech, isText: true }]);
    }, frameDuration * 2);

    // Spawn extra particles at ending pose
    if (action === "bathe") {
      const poofDelay = (frames.length - 1) * frameDuration;
      setTimeout(() => {
        spawnParticles(["*", "°", "·", "*", "°"].map((s) => ({ content: s, isText: false })));
      }, poofDelay);
    }
    if (action === "bonk") {
      // Stars circling after the squish
      const bonkDelay = (frames.length - 2) * frameDuration;
      setTimeout(() => {
        spawnParticles(["★", "✧", "☆", "✦", "★", "✧", "☆"].map((s) => ({ content: s, isText: false })));
      }, bonkDelay);
    }

    const totalDuration = (frames.length - (action === "bonk" ? 2 : 1)) * frameDuration + holdDuration;
    try {
      await onInteract(action as "feed" | "bathe" | "pet");
    } finally {
      setTimeout(() => {
        setActionCooldown(false);
      }, totalDuration);
    }
  }, [actionCooldown, onInteract, playSequence, spawnParticles, demon]);

  // ── Purr on hover + hold (mousedown) ──

  const startPurring = useCallback(() => {
    if (actionCooldown || !onInteract || readOnly) return;
    mouseDownRef.current = true;
    setMoodOverride("LOVED");

    const seqs = demon ? DEMON_REACTION_SEQUENCES : REACTION_SEQUENCES;
    playSequence(seqs.pet, 300, 1, 1000);
    spawnHearts(3);
    spawnPurr();
    onInteract("pet");

    // While held, keep spawning purrs + hearts
    purrTimerRef.current = setInterval(() => {
      if (!mouseDownRef.current) return;
      spawnPurr();
      spawnHearts(2);
    }, 1000);
  }, [actionCooldown, onInteract, readOnly, playSequence, spawnHearts, spawnPurr, demon]);

  const stopPurring = useCallback(() => {
    mouseDownRef.current = false;
    setMoodOverride(null);
    if (purrTimerRef.current) {
      clearInterval(purrTimerRef.current);
      purrTimerRef.current = undefined;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (purrTimerRef.current) clearInterval(purrTimerRef.current);
    };
  }, []);

  // ── 8-directional eye tracking ──
  // ◕ = white upper-left (NW). Rotate it for NE/SE/SW.
  // Half circles for cardinals: ◒(N) ◓(S) ◐(E) ◑(W)

  const RotatedEye = ({ deg }: { deg: number }) => (
    <span className="inline-block" style={{ transform: `rotate(${deg}deg)` }}>◕</span>
  );

  const GAZE_FACES: Record<string, React.ReactNode> = {
    n:  <>(<span className="inline-block" style={{ transform: "translateY(-4px)" }}>◒‿◒</span>)</>,
    ne: <>( <RotatedEye deg={90} />‿<RotatedEye deg={90} />)</>,
    e:  "( ◐‿◐)",
    se: <>( <RotatedEye deg={180} />‿<RotatedEye deg={180} />)</>,
    s:  "(◓‿◓)",
    sw: <>(<RotatedEye deg={270} />‿<RotatedEye deg={270} /> )</>,
    w:  "(◑‿◑ )",
    nw: "(◕‿◕ )",
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragOver || actionCooldown) return;
    const petEl = petFaceRef.current;
    if (!petEl) return;
    const rect = petEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Dead zone — within 20px of pet center, return to idle
    if (dist < 20) {
      setGazeFace(null);
      return;
    }

    // Convert to 8 compass directions
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    let dir: string;
    if (angle >= -22.5 && angle < 22.5) dir = "e";
    else if (angle >= 22.5 && angle < 67.5) dir = "se";
    else if (angle >= 67.5 && angle < 112.5) dir = "s";
    else if (angle >= 112.5 && angle < 157.5) dir = "sw";
    else if (angle >= 157.5 || angle < -157.5) dir = "w";
    else if (angle >= -157.5 && angle < -112.5) dir = "nw";
    else if (angle >= -112.5 && angle < -67.5) dir = "n";
    else dir = "ne";

    setGazeFace(GAZE_FACES[dir]);
  }, []);

  const handleMouseEnterContainer = useCallback(() => {
    if (!greetedRef.current && !actionCooldown) {
      greetedRef.current = true;
      const pool = demon ? DEMON_GREETINGS : GREETING_VARIANTS;
      const greeting = pool[Math.floor(Math.random() * pool.length)];
      spawnParticles([{ content: greeting, isText: true }]);
    }
  }, [actionCooldown, demon, spawnParticles]);

  const handleMouseLeaveContainer = useCallback(() => {
    setGazeFace(null);
    greetedRef.current = false;
  }, []);

  // ── Drop zone handlers ──

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-pet-action")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (!dragOver) {
        setDragOver(true);
        setGazeFace(null);
        setOverride(ANTICIPATION_FACE);
      }
    }
  }, [dragOver, setOverride]);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
    setOverride(null);
  }, [setOverride]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    setOverride(null);
    const action = e.dataTransfer.getData("application/x-pet-action");
    if (action === "feed" || action === "bathe" || action === "bonk") {
      triggerAction(action);
    }
  }, [setOverride, triggerAction]);

  return (
    <div
      ref={containerRef}
      className="relative border border-rule bg-paper p-5 opacity-0 animate-ink-bleed"
      onMouseEnter={handleMouseEnterContainer}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeaveContainer}
    >
      <CardCornerBrackets />
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-block h-1.5 w-1.5 bg-gold" />
        <span className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
          {demon ? "// YOUR DEMON" : readOnly ? "// COMPANION" : "// YOUR COMPANION"}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-5">
        <div className="flex-shrink-0 text-center min-w-[140px]">
          {/* Pet face — drop zone + pat zone */}
          <div
            ref={petFaceRef}
            className={cn(
              "relative inline-block px-2 py-1 overflow-visible",
              !readOnly && !actionCooldown && "cursor-grab active:cursor-grabbing"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onMouseDown={!readOnly && !actionCooldown ? startPurring : undefined}
            onMouseUp={stopPurring}
            onMouseLeave={stopPurring}
          >
            <span
              role="img"
              className={cn(
                "font-mono text-3xl select-none whitespace-nowrap inline-block origin-bottom",
                MOOD_ART_COLOR[pet.mood],
                !actionCooldown && MOOD_ANIMATION[pet.mood]
              )}
              aria-label={`Pet mood: ${pet.mood}`}
            >
              {gazeFace && !actionCooldown ? gazeFace : face}
            </span>

            {/* Floating particles — hearts + purr text, all absolute */}
            <FloatingParticles items={particles} onDone={removeParticle} />
          </div>

          {/* Accessories — editorial colophon entries */}
          {accessories.length > 0 && (
            <div className="mt-2 border-t border-rule pt-2 flex flex-col items-center gap-0.5">
              {accessories.map((a) => (
                <span
                  key={a.badgeId}
                  className="flex items-center gap-1 font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade whitespace-nowrap"
                >
                  <a.icon size={10} className={a.color} />
                  // {a.label}
                </span>
              ))}
            </div>
          )}

          {/* Draggable props — food & shower */}
          {!readOnly && onInteract && (
            <div className="flex justify-center items-start gap-3 mt-3">
              <DraggableProp icon={Cookie} label="SNACK" action="feed" disabled={actionCooldown} />
              <span className="h-8 w-px bg-rule mt-0.5" />
              <DraggableProp icon={Droplets} label="SPLASH" action="bathe" disabled={actionCooldown} />
              <span className="h-8 w-px bg-rule mt-0.5" />
              <DraggableProp icon={Hammer} label="BONK" action="bonk" disabled={actionCooldown} />
            </div>
          )}
        </div>

        {/* Speech bubble + name */}
        <div className="flex-1 min-w-0">
          <div key={pet.speech} className="relative border border-rule px-4 py-3 mb-3 animate-pop-in">
            <p className="font-serif italic text-base text-ink leading-snug">
              «&thinsp;{pet.speech}&thinsp;»
            </p>
            <p className="mt-1.5 font-mono uppercase tracking-[0.14em] text-[9px] text-ink-fade">
              — {pet.name ?? "lil' sketch"}
            </p>
          </div>

          {readOnly ? (
            <p className="font-serif italic text-lg text-ink">
              {pet.name ?? "lil' sketch"}
            </p>
          ) : (
            <InlineRename
              value={pet.name ?? "lil' sketch"}
              canEdit
              onSubmit={onRename}
              ariaLabel="Rename pet"
              className="font-serif italic text-lg text-ink cursor-pointer"
            />
          )}

          <p
            className="mt-2 font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade cursor-default"
            title={MOOD_TOOLTIP[pet.mood]}
          >
            // {demon ? "POSSESSED" : "FEELING"}: {moodOverride ?? (demon ? "UNLEASHED" : MOOD_LABEL[pet.mood])}
          </p>
        </div>
      </div>
    </div>
  );
}
