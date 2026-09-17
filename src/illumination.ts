import * as THREE from 'three';

/** Outer light volumes, including the faint edge of a spotlight's penumbra. */
export type SightLight={position:THREE.Vector3;range:number;direction?:THREE.Vector3;angle?:number};
export type ObservationLighting={ambient:boolean;lights:readonly SightLight[]};

/** Darkness may release a statue only when neither light nor backlighting can reveal it. */
export function canReveal(bounds:THREE.Box3,eye:THREE.Vector3,lighting?:ObservationLighting){
  // Missing lighting information is deliberately fail-closed.
  if(!lighting||lighting.ambient)return true;
  const sphere=bounds.getBoundingSphere(new THREE.Sphere());
  return lighting.lights.some(light=>{
    if(!light.direction||light.angle===undefined){
      // The capsule encloses the lit sphere AND every sightline to its background.
      const closest=new THREE.Line3(eye,light.position).closestPointToPoint(sphere.center,true,new THREE.Vector3());
      return closest.distanceTo(sphere.center)<=sphere.radius+light.range;
    }
    // Inflating by the eye/light separation contains sightlines to the whole
    // cone, including unlit silhouettes in front of a lit wall. This also works
    // for the mirrored eye used by the damp floor, without GPU readback latency.
    const radius=sphere.radius+eye.distanceTo(light.position)+.06;
    const delta=sphere.center.clone().sub(light.position),distance=delta.length();
    if(distance>light.range+radius)return false;
    const axis=light.direction.clone().normalize(),axial=delta.dot(axis);
    if(axial< -radius)return false;
    const radial=Math.sqrt(Math.max(0,delta.lengthSq()-axial*axial));
    return radial*Math.cos(light.angle)-axial*Math.sin(light.angle)<=radius;
  });
}
