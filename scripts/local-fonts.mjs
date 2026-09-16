import fs from 'node:fs/promises';
await fs.mkdir('public/fonts',{recursive:true});
const css=await (await fetch('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Manrope:wght@400;500;600;700&display=swap',{headers:{'User-Agent':'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36'}})).text();
let result='',i=0;const saved=new Map();
const pattern=css.includes('/* latin */')?/\/\* latin \*\/\s*(@font-face\s*\{[\s\S]*?\})/g:/(@font-face\s*\{[\s\S]*?\})/g;
for(const match of css.matchAll(pattern)){
  let block=match[1];const url=block.match(/url\(([^)]+)\)/)?.[1];if(!url)continue;
  if(!saved.has(url)){const extension=new URL(url).pathname.split('.').pop();const name=`type-${i++}.${extension}`;const r=await fetch(url);if(!r.ok)throw new Error('Font download failed');await fs.writeFile(`public/fonts/${name}`,Buffer.from(await r.arrayBuffer()));saved.set(url,name);}
  result+=block.replace(url,`/fonts/${saved.get(url)}`)+'\n';
}
if(!result)throw new Error('No latin font faces returned');
await fs.writeFile('public/fonts/fonts.css',result);
for(const family of ['cormorantgaramond','manrope']){const r=await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family}/OFL.txt`);if(r.ok)await fs.writeFile(`public/fonts/${family}-OFL.txt`,await r.text());}
console.log('Self-hosted fonts:',saved.size);
