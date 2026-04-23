//player constants
export const PLAYER_RADIUS = 0.2;
export const MOVE_SPEED = 0.05;
export let FOV = Math.PI / 3;           // mutable — changed by FOV slider
export const JUMP_VELOCITY = 0.118;
export const GRAVITY = 0.012;
export const MAX_JUMP = 0.35;
export const JUMP_SCALE = 200;
//minimap constants
export const MINIMAP_SCALE = 10;
export const MINIMAP_PADDING = 10;
//projectile constants
export const PROJECTILE_SPEED = 0.15;       // Visual tracer speed (world units/frame)
export const PROJECTILE_LIFETIME = 300;     // Tracer lives 300 frames max
export const PROJECTILE_START_Z = 0.15;     // Visual bullet origin height (eye level)
export const PROJECTILE_RADIUS = 0.0125;    // Visual only
export const TRACER_MAX_RANGE = 18;         // Max raycast range in world units
export const FIRE_RATE_FRAMES = 6;          // Frames between shots (lower = faster fire rate)
                                            // At 60fps: 6 = 10 shots/sec, 3 = 20/sec, 1 = 60/sec
//health constants
export const MAX_HEALTH = 100;
export const HIT_DAMAGE = 0.1;
//invincibility constants
export const SPAWN_INVINCIBILITY_DURATION = 300; // 5 seconds at 60fps
// Ray-based hit detection radius (used server-side too)
export const PROJECTILE_HIT_RADIUS = PLAYER_RADIUS + PROJECTILE_RADIUS; // 0.225
export const PROJECTILE_HIT_RADIUS_Z = PLAYER_RADIUS + PROJECTILE_RADIUS; // 0.225
// Pitch (vertical look) constants
export const PITCH_MAX_DEGREES = 45;    // change this to adjust max vertical look angle
export const PITCH_MAX = PITCH_MAX_DEGREES * (Math.PI / 180);
export const PITCH_SPEED = 0.03;        // radians per frame (arrow keys)
export const PITCH_MOUSE_SENS = 0.003;  // radians per pixel (mouse Y)
// Converts pitch radians to vertical screen shift as a fraction of canvas height.
export const PITCH_SCREEN_Y_SCALE = 0.75;
 
// FOV setter — called by the FOV slider in the UI
export function setFOV(radians) {
  FOV = radians;
}