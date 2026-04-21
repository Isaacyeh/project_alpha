//player constants
export const PLAYER_RADIUS = 0.2;
export const MOVE_SPEED = 0.05;
export const FOV = Math.PI / 3;
export const JUMP_VELOCITY = 0.118;
export const GRAVITY = 0.012;
export const MAX_JUMP = 0.35;
export const JUMP_SCALE = 200;
export const PLAYER_HEIGHT = 1.0;  // world-unit height of the player cylinder
//minimap constants
export const MINIMAP_SCALE = 10;
export const MINIMAP_PADDING = 10;
//projectile constants
export const PROJECTILE_SPEED = 2;          // Visual tracer speed (world units/frame)
export const PROJECTILE_LIFETIME = 60;         // Tracer lives 60 frames max (it dies at wall/range)
export const PROJECTILE_START_Z = 0.5;  // eye height above player feet
export const PROJECTILE_RADIUS = 0.0125;        // Visual only — hit detection is ray-based
export const TRACER_MAX_RANGE = 18;            // Max raycast range in world units
//health constants
export const MAX_HEALTH = 1;
export const HIT_DAMAGE = 0.1;
//invincibility constants
export const SPAWN_INVINCIBILITY_DURATION = 300; // 5 seconds at 60fps
// Ray-based hit detection radius (used server-side too)
export const PROJECTILE_HIT_RADIUS = PLAYER_RADIUS + PROJECTILE_RADIUS; // 0.2125
export const PROJECTILE_HIT_RADIUS_Z = PROJECTILE_RADIUS;   // vertical slop only
// Pitch (vertical look) constants
export const PITCH_SENSITIVITY = 0.003;
export const MAX_PITCH = Math.PI / 3;           // ±60 degrees max vertical look
