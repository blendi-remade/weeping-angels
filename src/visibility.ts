import * as THREE from 'three';

const axes=['x','y','z'] as const;
const reflectionHeight=.006;

function corners(box:THREE.Box3){
  return [box.min.x,box.max.x].flatMap(x=>[box.min.y,box.max.y].flatMap(y=>
    [box.min.z,box.max.z].map(z=>new THREE.Vector3(x,y,z))));
}

function crossesSolid(from:THREE.Vector3,to:THREE.Vector3,solid:THREE.Box3){
  let near=0,far=1-1e-6;
  for(const axis of axes){
    const delta=to[axis]-from[axis];
    if(Math.abs(delta)<1e-9){
      if(from[axis]<=solid.min[axis]||from[axis]>=solid.max[axis])return false;
    }else{
      let a=(solid.min[axis]-from[axis])/delta,b=(solid.max[axis]-from[axis])/delta;
      if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);
    }
    if(far<=near+1e-6)return false;
  }
  return true;
}

function fullyHidden(from:THREE.Vector3,points:THREE.Vector3[],solids:readonly THREE.Box3[]){
  // A convex solid's shadow must contain the entire bounding volume. Testing
  // all its corners against ONE solid proves this; different blockers can
  // cover the corners while leaving a visible slit through the middle.
  return solids.some(solid=>!solid.containsPoint(from)&&points.every(p=>crossesSolid(from,p,solid)));
}

/** Conservative visibility: uncertainty freezes the angel, never releases it. */
export function isObserved(camera:THREE.PerspectiveCamera,bounds:THREE.Box3,eyesClosed:boolean,solids:readonly THREE.Box3[]=[]){
  if(eyesClosed)return false;
  camera.updateMatrixWorld();
  const origin=camera.getWorldPosition(new THREE.Vector3());
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  // Small safety margin for pixels at screen edges and numerical precision.
  const padded=bounds.clone().expandByScalar(.035),points=corners(padded);
  if(frustum.intersectsBox(padded)&&!fullyHidden(origin,points,solids))return true;
  if(!camera.userData.reflectionEnabled||origin.y<=reflectionHeight)return false;

  const reflected=padded.clone();
  reflected.min.y=2*reflectionHeight-padded.max.y;reflected.max.y=2*reflectionHeight-padded.min.y;
  if(!frustum.intersectsBox(reflected))return false;
  const reflectedPoints=corners(reflected);
  // Cover can block either leg: eye -> floor, or floor -> statue.
  if(fullyHidden(origin,reflectedPoints,solids))return false;
  const footprint=new THREE.Box3();
  for(const p of reflectedPoints){
    const t=(origin.y-reflectionHeight)/(origin.y-p.y);
    if(t<=0)return true;
    footprint.expandByPoint(origin.clone().lerp(p,t));
  }
  if(footprint.max.x< -7.7||footprint.min.x>7.7||footprint.max.z< -15.7||footprint.min.z>15.7)return false;
  const mirroredEye=origin.clone();mirroredEye.y=2*reflectionHeight-origin.y;
  return !fullyHidden(mirroredEye,points,solids);
}
