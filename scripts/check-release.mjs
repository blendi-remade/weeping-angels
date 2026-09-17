import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const failures=[];
const patterns=[/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,/\bgithub_pat_[A-Za-z0-9_]{40,}\b/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}\b/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\b[0-9a-f]{32}:[0-9a-f]{32}\b/];
const files=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard']).toString().split('\0').filter(Boolean);
let scanned=0;
for(const file of new Set(files)){
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())continue;
 if(/(^|\/)\.env(?:\.|$)/.test(file)&&file!=='.env.example')failures.push(`Environment file included: ${file}`);
 if(/\.(?:pem|key)$/.test(file))failures.push(`Key file included: ${file}`);
 const bytes=fs.readFileSync(file);
 if(bytes.subarray(0,1024).includes(0))continue;
 scanned++;if(patterns.some(p=>p.test(bytes.toString())))failures.push(`Potential credential in ${file} (value redacted)`);
}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
if(!fs.existsSync('dist/index.html'))failures.push('Build first: dist/index.html is missing.');
else for(const file of walk('dist')){
 if(/(?:^|[\\/])\.(?:env|git|vercel)|\.map$|asset\.html$|\.job\.json$|\.result\.json$/.test(file))failures.push(`Private or development file in output: ${file}`);
 if(!/\.(?:js|html|css|json|txt)$/.test(file))continue;
 const text=fs.readFileSync(file,'utf8');
 if(patterns.some(p=>p.test(text)))failures.push(`Potential credential in build: ${file} (value redacted)`);
 for(const forbidden of ['FAL_KEY','FAL_ENV_FILE','queue.fal.run','window.__game','setAngel:','captureAudio'])if(text.includes(forbidden))failures.push(`Development or generation reference in ${file}: ${forbidden}`);
}
const manifest=JSON.parse(fs.readFileSync('ASSET_MANIFEST.json','utf8'));
for(const asset of manifest.runtime){
 const bytes=fs.readFileSync(asset.file);
 if(bytes.length!==asset.bytes||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)failures.push(`Asset manifest mismatch: ${asset.file}`);
}
for(const name of Object.keys(process.env))if(/^VITE_.*(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(name))failures.push(`Client-exposed credential variable configured: ${name}`);
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
else console.log(`Release checks passed: ${scanned} repository text files scanned; production output has no detected credentials, generation endpoints or dev controls; ${manifest.runtime.length} asset checksums verified.`);
