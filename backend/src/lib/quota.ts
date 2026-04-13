import { Types } from 'mongoose';
import { Scene } from '../models/Scene';
import { SceneVersion } from '../models/SceneVersion';

export const DEFAULT_STORAGE_QUOTA = 500 * 1024 * 1024;

interface BytesAggResult {
  _id: null;
  total: number;
}

// Sum of BSON bytes of:
//   - all non-trashed scenes owned by the user
//   - all SceneVersions belonging to those non-trashed scenes
//
// Uses one aggregation per collection. Optimised for clarity.
export async function computeUserStorageBytes(
  userId: string
): Promise<number> {
  const ownerObjId = new Types.ObjectId(userId);

  // Fetch the ids of non-trashed scenes up-front (used for both pipelines).
  const sceneIdsDocs = await Scene.find({
    ownerId: ownerObjId,
    deletedAt: null,
  })
    .select({ _id: 1 })
    .lean();
  const sceneIds = sceneIdsDocs.map((s) => s._id);

  if (sceneIds.length === 0) {
    return 0;
  }

  const sceneBytesAgg = await Scene.aggregate<BytesAggResult>([
    { $match: { _id: { $in: sceneIds } } },
    {
      $group: {
        _id: null,
        total: { $sum: { $bsonSize: '$$ROOT' } },
      },
    },
  ]);

  const versionBytesAgg = await SceneVersion.aggregate<BytesAggResult>([
    { $match: { sceneId: { $in: sceneIds } } },
    {
      $group: {
        _id: null,
        total: { $sum: { $bsonSize: '$$ROOT' } },
      },
    },
  ]);

  const sceneBytes = sceneBytesAgg.length > 0 ? sceneBytesAgg[0].total : 0;
  const versionBytes =
    versionBytesAgg.length > 0 ? versionBytesAgg[0].total : 0;

  return sceneBytes + versionBytes;
}
