// Syntax checks for runtime JavaScript plus repository whitespace checks. Astro syntax is checked by real builds.
import {readdir,readFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import path from 'node:path';
let count=0;async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else if(/\.(?:mjs|js)$/.test(file)){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);const source=await readFile(file,'utf8');if(/^(?:<{7}|={7}|>{7})/m.test(source))throw Error('Merge conflict marker: '+file);count++;}}}
for(const dir of ['editor','hosting','src/data','src/scripts','scripts'])await walk(dir);
const diff=spawnSync('git',['diff','--check'],{encoding:'utf8'});if(diff.status!==0)throw Error(diff.stdout||diff.stderr);console.log(`${count} JavaScript files passed syntax and conflict checks.`);
