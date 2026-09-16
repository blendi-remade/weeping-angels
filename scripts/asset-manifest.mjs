import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files=await fs.readdir('public/assets');const runtime=[];
for(const name of files){const data=await fs.readFile(`public/assets/${name}`);runtime.push({file:`public/assets/${name}`,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
const jobs=[];
for(const name of await fs.readdir('assets/source'))if(name.endsWith('.job.json')){const j=JSON.parse(await fs.readFile(`assets/source/${name}`,'utf8'));jobs.push({record:`assets/source/${name}`,endpoint:j.endpoint,requestId:j.request_id});}
await fs.writeFile('ASSET_MANIFEST.json',JSON.stringify({runtimeBytes:runtime.reduce((sum,a)=>sum+a.bytes,0),runtime,productionJobs:jobs},null,2)+'\n');console.log('Runtime asset total:',(runtime.reduce((sum,a)=>sum+a.bytes,0)/1024/1024).toFixed(1),'MiB');
