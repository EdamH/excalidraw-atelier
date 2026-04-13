// Ported from excalidraw upstream (MIT license)
// Ref: https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/
// The reconciliation algorithm: union elements by ID, keep higher version,
// tiebreak on lower versionNonce.

interface ReconcilableElement {
  id: string;
  version: number;
  versionNonce: number;
  [key: string]: unknown;
}

export function reconcileElements(
  localElements: readonly ReconcilableElement[],
  remoteElements: readonly ReconcilableElement[],
): ReconcilableElement[] {
  const localMap = new Map<string, ReconcilableElement>();
  const remoteMap = new Map<string, ReconcilableElement>();

  for (const el of localElements) localMap.set(el.id, el);
  for (const el of remoteElements) remoteMap.set(el.id, el);

  const result: ReconcilableElement[] = [];

  // Preserve order: local elements first (in order), then remote-only elements
  const seen = new Set<string>();
  for (const el of localElements) {
    if (!seen.has(el.id)) {
      seen.add(el.id);
    }
  }
  for (const el of remoteElements) {
    if (!seen.has(el.id)) {
      seen.add(el.id);
    }
  }

  // Build ordered ID list: local order first, then remote-only
  const orderedIds: string[] = [];
  const addedIds = new Set<string>();
  for (const el of localElements) {
    if (!addedIds.has(el.id)) {
      orderedIds.push(el.id);
      addedIds.add(el.id);
    }
  }
  for (const el of remoteElements) {
    if (!addedIds.has(el.id)) {
      orderedIds.push(el.id);
      addedIds.add(el.id);
    }
  }

  for (const id of orderedIds) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);

    if (local && remote) {
      if (remote.version > local.version) {
        result.push(remote);
      } else if (remote.version < local.version) {
        result.push(local);
      } else {
        // Tie: lower versionNonce wins
        result.push(remote.versionNonce < local.versionNonce ? remote : local);
      }
    } else if (remote) {
      result.push(remote);
    } else if (local) {
      result.push(local);
    }
  }

  return result;
}
