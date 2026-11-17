// A rolling replacement may read a committed publication while the old writer
// finishes. This adapter cannot write state, sessions or files.
import pg from 'pg';
import {postgresConfig} from './postgres.mjs';
import {hydrateSnapshot} from './history.mjs';
import {approvedFiles} from './file-references.mjs';
const generation="COALESCE(payload->'publishes'->0->>'id', 'initial:' || md5((payload->'initialPublic')::text))";
export async function openPublishedReader({connectionString,ssl}) {
 const client=new pg.Client({...postgresConfig(connectionString,ssl),application_name:'fpb-public-reader'});
 let failed=false;client.on('error',()=>{failed=true;});
 const query=(sql,args)=>{if(failed)throw Error('Published snapshot reader unavailable.');return client.query(sql,args);};
 try{await client.connect();await query('SET default_transaction_read_only=on');}
 catch(error){await client.end().catch(()=>{});throw error;}
 return {
  async loadPublished(){
   const row=(await query(`SELECT payload->>'schemaVersion' AS schema, ${generation} AS generation,
    COALESCE(payload->'publishes'->0->'snapshot',payload->'initialPublic') AS snapshot,
    payload->'publicationBlobs' AS blobs, payload->'files' AS files FROM pond_state WHERE id=1`)).rows[0];
   if(row?.schema!=='2'||!row.snapshot||!row.generation)throw Error('Missing supported durable publication.');
   const snapshot=hydrateSnapshot({publicationBlobs:row.blobs},row.snapshot),approved=approvedFiles(snapshot,row.files??[]);
   return {generation:row.generation,snapshot,files:(row.files??[]).filter(f=>Object.hasOwn(approved,f.id))};
  },
  async current(expected){return (await query(`SELECT ${generation} AS generation FROM pond_state WHERE id=1`)).rows[0]?.generation===expected;},
  async loadFile(id,expected){
   return (await query(`SELECT f.bytes FROM pond_files f JOIN pond_state s ON s.id=1 WHERE f.id=$1 AND ${generation}=$2`,[id,expected])).rows[0]?.bytes;
  },
  async close(){await client.end();}
 };
}
