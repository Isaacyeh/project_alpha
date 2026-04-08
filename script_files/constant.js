//player constants
export const PLAYER_RADIUS = 0.2;
export const MOVE_SPEED = 0.05;
export const FOV = Math.PI / 3;
export const JUMP_VELOCITY = 0.118;
export const GRAVITY = 0.012;
export const MAX_JUMP = 0.35;
export const JUMP_SCALE = 200;
//minimap constants
export const MINIMAP_SCALE = 10;
export const MINIMAP_PADDING = 10;
//projectile constants
export const PROJECTILE_SPEED = 0.2;
export const PROJECTILE_LIFETIME = 120;
export const PROJECTILE_START_Z = -0.08;
export const PROJECTILE_RADIUS = 0.05; // visual radius of the ball
//health constants
export const MAX_HEALTH = 1;
export const HIT_DAMAGE = 0.1;
//invincibility constants
export const SPAWN_INVINCIBILITY_DURATION = 180; // 3 seconds at 60fps
// Hit threshold = PLAYER_RADIUS + PROJECTILE_RADIUS (edge-to-edge contact)
// Must match the values in server.js
export const PROJECTILE_HIT_RADIUS = PLAYER_RADIUS + PROJECTILE_RADIUS; // 0.25
export const PROJECTILE_HIT_RADIUS_Z = PLAYER_RADIUS + PROJECTILE_RADIUS; // 0.25
