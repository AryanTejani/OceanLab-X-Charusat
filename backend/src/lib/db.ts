import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '../.env') });

import { DataSource } from 'typeorm';
import { Meeting } from '../entities/Meeting';
import { Transcript } from '../entities/Transcript';

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
    entities: [Meeting, Transcript],
    synchronize: true,
    logging: false,
    extra: { family: 4 }, // force IPv4 — Supabase resolves to IPv6 on some networks
  });
}

export async function getDb(): Promise<DataSource> {
  if (!global._typeormDs) {
    global._typeormDs = createDataSource();
  }
  if (!global._typeormDs.isInitialized) {
    await global._typeormDs.initialize();
  }
  return global._typeormDs;
}
