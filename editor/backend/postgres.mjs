// Durable single-writer state with lazy reconnect after database suspension.
// Never log connection URLs or payloads. A revision fence rejects stale writers.
import pg from 'pg';
// Public endpoints use certificate verification. Render's private network uses
// self-signed certificates: opt in only on Render and pin the exact internal host.
export function hostedDatabaseTls(env = {}) {
 const mode = env.DATABASE_TLS_MODE || 'verify-full';
 if (mode === 'verify-full') return {rejectUnauthorized:true,...(env.DATABASE_CA?{ca:env.DATABASE_CA}:{})};
 if (mode !== 'render-internal') throw Error('Unsupported DATABASE_TLS_MODE.');
 const url = new URL(env.DATABASE_URL);
 const expected = env.DATABASE_RENDER_INTERNAL_HOST;
 if (env.RENDER !== 'true' || !/^dpg-[a-z0-9]+-[a-z]$/.test(expected || '') ||
     url.hostname !== expected || (url.port && url.port !== '5432') || env.DATABASE_CA ||
     !['postgres:', 'postgresql:'].includes(url.protocol)) {
  throw Error('Render internal TLS requires the exact private database host on Render.');
 }
 // TLS is mandatory; this mode does not authenticate the self-signed server.
 // Isolation relies on Render's private network, not a public TLS certificate.
 return {rejectUnauthorized:false,minVersion:'TLSv1.2'};
}
export function postgresConfig(connectionString,ssl){
 const url=new URL(connectionString);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('PostgreSQL URL required.');
 if(url.hostname.includes('-pooler.'))throw Error('Use the direct Neon endpoint, not transaction pooling.');
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert','ssl'])url.searchParams.delete(key);
 return {connectionString:url.toString(),ssl,connectionTimeoutMillis:15000,query_timeout:30000,application_name:'fpb-pond-desk'};
}
export async function openPostgres({connectionString,ssl,onFailure=()=>{}}) {
 const config=postgresConfig(connectionString,ssl);let client=null,revision=null,closing=false;
 async function connect(){
  if(closing)throw Error('Database store closed.');if(client)return client;
  const next=new pg.Client(config);
  // Neon may close an idle connection when compute suspends. Do not restart the
  // app or wake the database until an actual data operation needs it again.
  next.on('error',()=>{if(client===next)client=null;void next.end().catch(()=>{});});
  try{
   await next.connect();
   const lock=await next.query('SELECT pg_try_advisory_lock(736427, 1) AS locked');
   if(!lock.rows[0].locked){const error=Error('Another Pond Desk instance holds the database lock.');error.code='POND_WRITER_BUSY';throw error;}
   await next.query('CREATE TABLE IF NOT EXISTS pond_state (id integer PRIMARY KEY CHECK (id = 1), payload jsonb NOT NULL, revision integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now())');
   await next.query('CREATE TABLE IF NOT EXISTS pond_sessions (digest text PRIMARY KEY, payload jsonb NOT NULL, expires_at bigint NOT NULL)');
   await next.query('ALTER TABLE pond_state ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0');
   const current=(await next.query('SELECT revision FROM pond_state WHERE id=1')).rows[0]?.revision??0;
   if(revision!==null&&current!==revision){const error=Error('Stored state changed while disconnected. Restart required.');error.code='POND_STALE_INSTANCE';throw error;}
   revision=current;client=next;return next;
  }catch(error){await next.end().catch(()=>{});throw error;}
 }
 await connect();
 return {
  async load(){const db=await connect();const row=(await db.query('SELECT payload,revision FROM pond_state WHERE id=1')).rows[0];revision=row?.revision??0;return row?.payload;},
  async save(value){try{const db=await connect();const result=await db.query('INSERT INTO pond_state(id,payload,revision) VALUES(1,$1::jsonb,1) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,revision=pond_state.revision+1,updated_at=now() WHERE pond_state.revision=$2 RETURNING revision',[JSON.stringify(value),revision]);if(result.rowCount!==1)throw Error('Stale database revision.');revision=result.rows[0].revision;}catch(error){onFailure();throw error;}},
  async loadSession(digest,now){const db=await connect();const row=(await db.query('SELECT payload FROM pond_sessions WHERE digest=$1 AND expires_at>$2',[digest,now])).rows[0];return row?.payload;},
  async saveSession(digest,value,now){const db=await connect();await db.query('DELETE FROM pond_sessions WHERE expires_at<=$1',[now]);
   const count=Number((await db.query('SELECT count(*) AS n FROM pond_sessions WHERE digest<>$1',[digest])).rows[0].n);if(count>=1000)throw Error('Session capacity reached.');
   await db.query('INSERT INTO pond_sessions(digest,payload,expires_at) VALUES($1,$2::jsonb,$3) ON CONFLICT(digest) DO UPDATE SET payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at',[digest,JSON.stringify(value),value.expires]);},
  async ping(){await(await connect()).query('SELECT 1');},
  async close(){closing=true;if(client){const current=client;client=null;await current.end();}}
 };
}
