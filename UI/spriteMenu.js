// spriteMenu.js — sprite data loader only.
// The actual UI lives in the Customization overlay (script.js).
 
let spritesData = [];
 
export async function loadSprites() {
  try {
    const response = await fetch('/sprites.json');
    spritesData = await response.json();
  } catch (error) {
    console.error('Failed to load sprites.json:', error);
  }
  return spritesData;
}
 
export function getSpritesData() {
  return spritesData;
}