import test from 'node:test';import assert from 'node:assert/strict';
import {postgresConfig,hostedDatabaseTls} from '../editor/backend/postgres.mjs';
test('Neon direct TLS configuration cannot be downgraded by URL parameters',()=>{
 const ssl={rejectUnauthorized:true};const options=postgresConfig('postgresql://fixture:fixture@ep-example.eu-central-1.aws.neon.tech/fpb?sslmode=disable&ssl=false',ssl);
 assert.equal(options.ssl,ssl);assert(!options.connectionString.includes('ssl'));assert.throws(()=>postgresConfig('postgresql://fixture:fixture@ep-example-pooler.eu-central-1.aws.neon.tech/fpb',ssl),/direct Neon/);
});

test('hosted database TLS is verified by default and unknown modes fail closed',()=>{
 assert.deepEqual(hostedDatabaseTls({}),{rejectUnauthorized:true});
 assert.deepEqual(hostedDatabaseTls({DATABASE_CA:'fixture CA'}),{rejectUnauthorized:true,ca:'fixture CA'});
 for(const mode of ['disable','require','false']) assert.throws(()=>hostedDatabaseTls({DATABASE_TLS_MODE:mode}),/Unsupported/);
});
test('Render self-signed TLS is restricted to the pinned private host on Render',()=>{
 const env={RENDER:'true',DATABASE_TLS_MODE:'render-internal',DATABASE_RENDER_INTERNAL_HOST:'dpg-example123-a',DATABASE_URL:'postgresql://fixture:fixture@dpg-example123-a/fpb?sslmode=disable'};
 const tls=hostedDatabaseTls(env);
 assert.deepEqual(tls,{rejectUnauthorized:false,minVersion:'TLSv1.2'});
 const config=postgresConfig(env.DATABASE_URL,tls);
 assert.equal(config.ssl,tls);assert(!config.connectionString.includes('sslmode'));
 for(const changes of [
  {RENDER:''},{DATABASE_RENDER_INTERNAL_HOST:''},{DATABASE_RENDER_INTERNAL_HOST:'other.example'},
  {DATABASE_URL:'postgresql://fixture:fixture@dpg-other-a/fpb'},
  {DATABASE_URL:'postgresql://fixture:fixture@dpg-example123-a.virginia-postgres.render.com/fpb'},
  {DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1/fpb'},
  {DATABASE_URL:'postgresql://fixture:fixture@dpg-example123-a:9999/fpb'},
  {DATABASE_CA:'fixture CA'}, {DATABASE_URL:'https://dpg-example123-a/fpb'}
 ]) assert.throws(()=>hostedDatabaseTls({...env,...changes}));
});
