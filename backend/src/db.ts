import mongoose from 'mongoose';

export function getDbName(): string {
  return process.env.DB_NAME || 'excalidraw';
}

export function buildMongoUri(): string {
  if (process.env.MONGO_URI) {
    return process.env.MONGO_URI;
  }
  const user = process.env.DB_USERNAME;
  const pass = process.env.DB_PASSWORD;
  const host = process.env.DB_HOST || 'localhost';
  if (!user || !pass) {
    throw new Error(
      'Either MONGO_URI or (DB_USERNAME, DB_PASSWORD, DB_HOST) must be set'
    );
  }
  return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:27017/?tls=false&ssl=false&readPreference=secondaryPreferred&replicaSet=rs0`;
}

export async function connect(uri?: string): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  const finalUri = uri ?? buildMongoUri();
  return mongoose.connect(finalUri, { dbName: getDbName() });
}
