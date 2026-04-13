export type PetMood = 'ECSTATIC' | 'HAPPY' | 'CONTENT' | 'HUNGRY' | 'SLEEPY' | 'SICK' | 'GHOST';

const PET_SPEECH_POOL: Record<PetMood, string[]> = {
  ECSTATIC: [
    'scribble scribble scribble~!!',
    'WAIT is that a— !! *runs over* you drew ANOTHER thing!!',
    'i dreamt in shapes last night~',
    'we are on FIRE!! ...not literally. *checks canvas*',
  ],
  HAPPY: [
    'hehe~ another day another sketch~',
    'ooh what are we making today?',
    'la la la~ just watching you draw~',
    '*happy wiggle* the atelier is so cozy right now~',
  ],
  CONTENT: [
    'hmm hm hmm~ nice lil\' session today~',
    '*stretches* ...this is good. this is fine.',
    'i helped! ...i mean i watched. but i helped by believing in you!!',
    '*sits on a rectangle* ...comfy.',
  ],
  HUNGRY: [
    'draw me something pretty? ...please?',
    '*tummy rumble* ...pixels, please?',
    'the canvas is so empty and i am so small...',
    'me and this rectangle are best friends now. right, rectangle? ...rectangle?',
  ],
  SLEEPY: [
    'zzz... *mumbles* ...no that\'s a hexagon...',
    '*yaaawn* ...five more minutes...',
    'the shapes are... so... zzz...',
    'wake me when the pencils come out~ zzz',
  ],
  SICK: [
    'i miss you... come back?',
    '*sniffle* ...remember when we used to draw?',
    'the atelier is cold without you...',
    'even a tiny doodle would help... *peers at empty canvas*',
  ],
  GHOST: [
    '...',
    '...hello?',
    '*faint whisper* ...still here...',
    '...i\'ll wait.',
  ],
};

/** Pick a random speech line for the given mood. */
export function pickPetSpeech(mood: PetMood): string {
  const pool = PET_SPEECH_POOL[mood];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function computePetMood(drawingStreak: number, sceneCount: number, lastActivityAt: Date | null): PetMood {
  if (sceneCount === 0) return 'HUNGRY';
  if (drawingStreak >= 7) return 'ECSTATIC';
  if (drawingStreak >= 3) return 'HAPPY';

  if (!lastActivityAt) return 'HUNGRY';

  const now = Date.now();
  const msIdle = now - lastActivityAt.getTime();
  const daysIdle = msIdle / (1000 * 60 * 60 * 24);

  if (daysIdle <= 1) return 'CONTENT';
  if (daysIdle <= 3) return 'HUNGRY';
  if (daysIdle <= 7) return 'SLEEPY';
  if (daysIdle <= 14) return 'SICK';
  return 'GHOST';
}
