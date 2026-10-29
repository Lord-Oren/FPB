import test from 'node:test';import assert from 'node:assert/strict';
import {postgresConfig} from '../editor/backend/postgres.mjs';
test('Neon direct TLS configuration cannot be downgraded by URL parameters',()=>{
 const ssl={rejectUnauthorized:true};const options=postgresConfig('postgresql://fixture:fixture@ep-example.eu-central-1.aws.neon.tech/fpb?sslmode=disable&ssl=false',ssl);
 assert.equal(options.ssl,ssl);assert(!options.connectionString.includes('ssl'));assert.throws(()=>postgresConfig('postgresql://fixture:fixture@ep-example-pooler.eu-central-1.aws.neon.tech/fpb',ssl),/direct Neon/);
});
