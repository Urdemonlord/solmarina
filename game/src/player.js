// Solmarina 3D: on-foot player controller (browser only).
// WASD moves relative to the camera yaw; Shift runs; the mesh walks.
import { PLAYER } from './config.js';
import { clamp, turnToward } from './random.js';
import { collideBuildings, collideStalls } from './city.js';
import { poseWalk, poseIdle } from './render.js';

export function createPlayer(x, z, heading) {
  return {
    x, z, heading: heading || 0,
    onFoot: true, car: null,
    health: PLAYER.health,
    money: 0,
    hasPistol: false, ammo: 0,
    walkPhase: 0,
    moving: false,
    camYaw: heading || 0,
  };
}

// input: the input object; camYaw: current camera yaw; dt seconds.
// Returns the new camera yaw to follow (player heading when moving).
export function updatePlayerOnFoot(player, input, camYaw, dt, buildings) {
  const mx = input.moveX;
  const my = input.moveY;
  const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  player.moving = mx !== 0 || my !== 0;
  if (!player.moving) return camYaw;
  // movement relative to camera: forward is -z rotated by camYaw
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  let dx = fx * my + rx * mx;
  let dz = fz * my + rz * mx;
  const len = Math.hypot(dx, dz);
  dx /= len; dz /= len;
  const targetHeading = Math.atan2(-dx, -dz);
  player.heading = turnToward(player.heading, targetHeading, dt * 10);
  player.x += dx * speed * dt;
  player.z += dz * speed * dt;
  collideBuildings(buildings, player, PLAYER.radius);
  collideStalls(player, PLAYER.radius);
  player.walkPhase += dt * speed * 1.6;
  return player.heading;
}

// Sync the human mesh to the player state.
export function syncPlayerMesh(mesh, player, dt) {
  mesh.position.set(player.x, 0, player.z);
  mesh.rotation.y = player.heading;
  if (player.moving) poseWalk(mesh, player.walkPhase, 0.55);
  else poseIdle(mesh);
  mesh.visible = player.onFoot;
}
