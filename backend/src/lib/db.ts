import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '../.env') });

import { DataSource } from 'typeorm';
import { Meeting } from '../entities/Meeting';
import { Transcript } from '../entities/Transcript';
import { TeamMember } from '../entities/TeamMember';

declare global {
  // eslint-disable-next-line no-var
  var _typeormDs: DataSource | undefined;
}

function createDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('supabase')
      ? { rejectUnauthorized: false }
      : undefined,
    entities: [Meeting, Transcript, TeamMember],
    synchronize: process.env.NODE_ENV !== 'production',
    logging: false,
    extra: { family: 4 }, // force IPv4 — Supabase resolves to IPv6 on some networks
  });
}

async function runMigrations(ds: DataSource): Promise<void> {
  const migrations = [
    `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS "participantInsights" jsonb NOT NULL DEFAULT '[]'`,
    `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS "participantUserIds" jsonb NOT NULL DEFAULT '[]'`,
  ];
  for (const sql of migrations) {
    try {
      await ds.query(sql);
    } catch (err) {
      console.error('Migration failed:', sql, err);
    }
  }
}

export async function getDb(): Promise<DataSource> {
  if (!global._typeormDs) {
    global._typeormDs = createDataSource();
  }
  if (!global._typeormDs.isInitialized) {
    try {
      await global._typeormDs.initialize();
    } catch (err) {
      // Pool was ended (e.g. nodemon hot-reload) — create a fresh DataSource
      global._typeormDs = createDataSource();
      await global._typeormDs.initialize();
    }
    await runMigrations(global._typeormDs);
  }
  return global._typeormDs;
}
