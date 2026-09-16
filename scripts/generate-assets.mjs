import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
let key=process.env.FAL_KEY;
for(const file of [path.join(root,'.env.local'),path.resolve(root,'../fal-worldclaw/.env.local')]) {
  if(key)break;
  try {const source=await fs.readFile(file,'utf8');key=source.match(/^FAL_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1]?.trim();}catch{}
}
if(!key)throw new Error('Set FAL_KEY in .env.local to generate assets.');
const folder=path.join(root,'assets/source');
const runtime=path.join(root,'public/assets');
await fs.mkdir(folder,{recursive:true});
await fs.mkdir(runtime,{recursive:true});
const mode=process.argv[2]||'reference';
async function job(endpoint,input,name){
  const manifest=path.join(folder,`${name}.job.json`);
  let j;
  try { j=JSON.parse(await fs.readFile(manifest,'utf8')); }catch{
    const r=await fetch(`https://queue.fal.run/${endpoint}`,{method:'POST',headers:{Authorization:`Key ${key}`,'Content-Type':'application/json'},body:JSON.stringify(input)});
    if(!r.ok)throw new Error(`${endpoint}: ${r.status} ${await r.text()}`);
    j=await r.json();await fs.writeFile(manifest,JSON.stringify({endpoint,input,...j},null,2));
    console.log('Submitted',name,j.request_id);
  }
  for(;;){
    const r=await fetch(j.status_url,{headers:{Authorization:`Key ${key}`}});
    if(!r.ok)throw new Error(`Status ${r.status}`);
    const s=await r.json(); console.log(name,s.status);
    if(s.status==='COMPLETED')break;
    if(s.status==='FAILED')throw new Error(`${name} failed`);
    await new Promise(r=>setTimeout(r,10000));
  }
  const r=await fetch(j.response_url,{headers:{Authorization:`Key ${key}`}});
  if(!r.ok)throw new Error(`Result ${r.status} ${await r.text()}`);
  const result=await r.json();await fs.writeFile(path.join(folder,`${name}.result.json`),JSON.stringify(result,null,2));return result;
}
async function save(url,name){const r=await fetch(url);if(!r.ok)throw new Error(`Download ${r.status}`);await fs.writeFile(path.join(name.endsWith('.mp3')?runtime:folder,name),Buffer.from(await r.arrayBuffer()));console.log('Saved',name);}
if(mode==='reference'){
  const prompt=`A single extraordinarily detailed photorealistic Victorian cemetery angel statue, full body sculptural asset reference for 3D reconstruction. A terrifyingly beautiful adult female stone angel, anatomically precise classical funerary sculpture, stern sorrowful face with deep-set eyes and slightly parted lips, wavy carved hair, long flowing heavy classical draped dress with deeply carved vertical folds, bare stone feet visible beneath robe. Two large upward sweeping feathered stone wings, complete and uncropped, individual layered primary feathers with thick sculptural edges. Standing upright in a relaxed symmetrical A pose, both arms held slightly away from the body, elbows gently bent, hands at hip height with all five fingers naturally separated and clearly visible. Face fully visible, hands NOT touching face. Pale cold grey weathered limestone, extremely fine pits and hairline cracks, understated dark patina in crevices, physically plausible stone surface. Museum-grade sculpture photographed in neutral diffuse studio lighting, plain medium grey background, subtle contact shadow, near frontal view at chest height with very slight three-quarter angle, minimal perspective distortion. Entire wings, feet and fingers fully inside the image with comfortable margins. No pedestal, no plinth, no scenery, no text, no fog, no dramatic lighting. Exquisite realistic sculpture, unsettling and ancient, exceptionally legible geometry.`;
  const d=await job('fal-ai/nano-banana-2',{prompt,resolution:'2K',aspect_ratio:'3:4',output_format:'png',num_images:1},'angel-reference');
  await save(d.images[0].url,'angel-reference.png');
}else if(mode==='mesh'){
  const ref=JSON.parse(await fs.readFile(path.join(folder,'angel-reference.result.json'),'utf8'));
  const d=await job('meshy/v7/image-to-3d',{image_url:ref.images[0].url,model_type:'standard',ultra_mode:true,enable_pbr:true,should_texture:true,should_remesh:true,target_polycount:100000,topology:'triangle',symmetry_mode:'auto',enable_rigging:true,rigging_height_meters:2.4,enable_animation:false,texture_prompt:'Weathered pale grey limestone funerary sculpture. Fine pores, subtle hairline cracks and dark crevice patina. Matte stone, no painted eyes, no skin, no clothing fabric: the entire sculpture including wings and drapery is carved stone.'},'angel-mesh');
  await save(d.model_glb.url,'angel.glb');
  if(d.rigged_character_glb?.url)await save(d.rigged_character_glb.url,'angel-rigged.glb');
}else if(mode==='pew-reference'){
  const d=await job('fal-ai/nano-banana-2',{prompt:'A single exquisite old Gothic church pew bench, isolated studio asset photograph on a plain neutral grey background. Three-quarter front view showing the entire bench and both side panels. Seats three people, long bench with a tall continuous wooden backrest, dark aged brown oak, intricate carved Gothic pointed tracery on the back, ends with finely carved quatrefoil and elegant curved armrests, sturdy feet touching the floor. Worn rounded edges, wood grain, historical English Victorian church craftsmanship. Physically plausible construction, exceptionally detailed carved solid wood. Soft even diffuse studio lighting with a faint contact shadow. No people, no candles, no surrounding room, no text, no cropped edges. Highly realistic 3D reconstruction reference.',resolution:'2K',aspect_ratio:'3:2',output_format:'png',num_images:1},'pew-reference');
  await save(d.images[0].url,'pew-reference.png');
}else if(mode==='pew-mesh'){
  const ref=JSON.parse(await fs.readFile(path.join(folder,'pew-reference.result.json'),'utf8'));
  const d=await job('meshy/v7/image-to-3d',{image_url:ref.images[0].url,model_type:'standard',ultra_mode:true,enable_pbr:true,should_remesh:true,target_polycount:40000,should_texture:true,enable_rigging:false},'pew-mesh');
  await save(d.model_glb.url,'pew.glb');
}else if(mode==='audio'){
  const sounds=[
    ['chapel-ambience',22,true,'Quiet unsettling atmosphere inside a vast abandoned stone chapel at night. Distant rain against old leaded windows, a low cold wind sighing through broken masonry, isolated droplets falling into puddles with long natural cathedral reverberation. Very subtle distant old wood creaking. Spacious, realistic environmental recording. No music, no melody, no voices, no footsteps, no loud thunder, no sudden events. Consistent quiet level, seamless loop.'],
    ['stone-scrape',1.5,false,'A heavy rough limestone statue abruptly sliding one short step across a gritty stone floor. Deep weighty stone-on-stone grinding and a small crunchy settling impact. Close dry foley recording, terrifying physical weight. One single movement. No voice, no music, no wind.'],
    ['iron-gate',3,false,'An ancient heavy wrought iron gate unlocking with a metallic clunk and slowly creaking open on rusted hinges. Resonant metal scrape, very heavy Gothic church door. Close physical foley, no music, no speech.']
  ];
  await Promise.all(sounds.map(async([name,duration_seconds,loop,text])=>{
    const d=await job('fal-ai/elevenlabs/sound-effects/v2',{text,duration_seconds,loop,prompt_influence:.55,output_format:'mp3_44100_192'},name);await save(d.audio.url,`${name}.mp3`);
  }));
}else if(mode==='materials'){
  const prompts={
    limestone:'Ancient grey beige limestone cathedral masonry blocks, roughly cut ashlar in horizontal staggered courses, fine pores, aged chisel marks, worn chipped edges, thin dark mortar, slight damp staining, subtle variations in stone color. Realistic historical Gothic church wall, no moss carpet, no objects, orthographic seamless PBR surface.',
    floor:'Very old dark grey limestone flagstone floor, large irregular rectangular slabs, thin recessed seams, worn smooth and slightly damp surfaces, fine scratches, subtle cracks, charcoal and desaturated taupe, realistic abandoned Victorian church floor. Flat orthographic seamless PBR surface, no objects, no perspective.',
    wood:'Ancient dark brown oak wood, fine vertical long grain, subtle worn areas and cracks, weathered church pew wood, restrained dark brown without orange, unpainted timber, realistic seamless PBR surface, no objects.'
  };
  await Promise.all(Object.entries(prompts).map(async([name,prompt])=>{
    const d=await job('fal-ai/patina/material',{prompt,image_size:{width:2048,height:2048},maps:['basecolor','normal','roughness'],output_format:'png',num_inference_steps:8},name);
    for(const i of d.images)if(i.map_type)await save(i.url,`${name}-${i.map_type}.png`);
  }));
}else{throw new Error('Unknown mode');}
