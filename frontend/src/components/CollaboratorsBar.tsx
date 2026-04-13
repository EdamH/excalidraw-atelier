import { useEffect, useState, type MutableRefObject } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from './ui/Spinner';

const GHOST_TIMEOUT_MS = 30_000;

interface CollaboratorsBarProps {
  collaborators: Array<{
    userId: string;
    username: string;
    color: string;
    role: 'owner' | 'editor' | 'viewer';
    lastActiveAt: number;
  }>;
  isConnected: boolean;
  collabError?: string | null;
  lastActiveMap?: MutableRefObject<Map<string, number>>;
}

export function CollaboratorsBar({ collaborators, isConnected, collabError, lastActiveMap }: CollaboratorsBarProps) {
  // Re-render every 10s to update ghost states — only when collaborators exist
  const [, setTick] = useState(0);
  const hasCollaborators = isConnected && collaborators.length > 0;
  useEffect(() => {
    if (!hasCollaborators) return;
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, [hasCollaborators]);

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-6 w-px bg-paper/25" />
        {!collabError && <Spinner size={10} />}
        <span className="font-mono uppercase tracking-[0.14em] text-[10px] text-paper/50">
          // {collabError || 'CONNECTING'}
        </span>
      </div>
    );
  }

  if (collaborators.length === 0) return null;

  const visible = collaborators.slice(0, 4);
  const overflow = collaborators.length - visible.length;
  const editingCount = collaborators.filter(c => c.role !== 'viewer').length;

  return (
    <div className="flex items-center gap-3">
      <div className="h-6 w-px bg-paper/25" />
      {visible.map((c) => {
        const lastActive = lastActiveMap?.current.get(c.userId) ?? c.lastActiveAt ?? Date.now();
        const isGhost = Date.now() - lastActive > GHOST_TIMEOUT_MS;
        return (
          <div
            key={c.userId}
            className="flex items-center gap-1.5 transition-opacity duration-500"
            style={{ opacity: isGhost ? 0.3 : 1 }}
            title={isGhost ? `${c.username} (idle)` : c.username}
          >
            <span
              className="inline-block h-2.5 w-[3px] shrink-0"
              style={{ backgroundColor: c.color }}
            />
            <Link
              to={`/profile/${c.userId}`}
              className="font-mono uppercase tracking-[0.14em] text-[10px] text-paper/60 whitespace-nowrap hover:text-gold transition-colors"
            >
              {c.username}
              {isGhost && <span className="text-paper/30 font-mono text-[9px]"> (IDLE)</span>}
            </Link>
          </div>
        );
      })}
      {overflow > 0 && (
        <span className="font-mono uppercase tracking-[0.14em] text-[10px] text-paper/50">
          +{overflow}
        </span>
      )}
      <span className="font-mono uppercase tracking-[0.14em] text-[10px] text-paper/50">
        // {editingCount} EDITING
      </span>
    </div>
  );
}
