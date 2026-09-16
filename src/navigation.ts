import { canStand } from './world';
export type Point={x:number;z:number};
const STEP=.5,MIN=-16,N=65;
const encode=(x:number,z:number)=>z*N+x;
const decode=(n:number):Point=>({x:MIN+(n%N)*STEP,z:MIN+Math.floor(n/N)*STEP});
export function pathfind(from:Point,to:Point):Point[]{
  function cell(p:Point){return {x:Math.max(0,Math.min(N-1,Math.round((p.x-MIN)/STEP))),z:Math.max(0,Math.min(N-1,Math.round((p.z-MIN)/STEP)))};}
  function nearest(p:Point){const c=cell(p);let best=-1,dist=Infinity;for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){const x=c.x+dx,z=c.z+dz;if(x<0||x>=N||z<0||z>=N)continue;const n=encode(x,z),q=decode(n);if(canStand(q.x,q.z,.36)){const d=(q.x-p.x)**2+(q.z-p.z)**2;if(d<dist){best=n;dist=d;}}}return best;}
  const start=nearest(from),end=nearest(to);if(start<0||end<0)return [];
  const queue=[start],parent=new Int32Array(N*N).fill(-1);parent[start]=start;
  for(let head=0;head<queue.length;head++){
    const u=queue[head];if(u===end)break;const x=u%N,z=Math.floor(u/N);
    for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,nz=z+dz;if(nx<0||nx>=N||nz<0||nz>=N)continue;const v=encode(nx,nz);if(parent[v]!==-1)continue;const q=decode(v);if(!canStand(q.x,q.z,.36))continue;parent[v]=u;queue.push(v);}
  }
  if(parent[end]===-1)return [];
  const result:Point[]=[];for(let n=end;n!==start;n=parent[n])result.push(decode(n));result.reverse();return result;
}
