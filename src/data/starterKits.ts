/**
 * Curated starting points. Entries are Modrinth slugs; anything without a build for the chosen
 * loader and version is skipped automatically when a kit is added.
 */
export interface StarterKit {
  id: string;
  emoji: string;
  title: string;
  blurb: string;
  slugs: string[];
}

export const STARTER_KITS: StarterKit[] = [
  {
    id: 'performance',
    emoji: '⚡',
    title: 'Performance',
    blurb: 'More FPS, faster loading, lower memory use.',
    slugs: ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'modernfix', 'dynamic-fps', 'krypton'],
  },
  {
    id: 'qol',
    emoji: '🧰',
    title: 'Quality of life',
    blurb: 'Recipe viewer, block tooltips, mod menu and handy tweaks.',
    slugs: ['jei', 'jade', 'modmenu', 'appleskin', 'mouse-tweaks', 'controlling'],
  },
  {
    id: 'visuals',
    emoji: '✨',
    title: 'Visuals',
    blurb: 'Shaders support, connected textures and dynamic lights.',
    slugs: ['iris', 'continuity', 'lambdynamiclights', '3dskinlayers'],
  },
  {
    id: 'exploration',
    emoji: '🗺️',
    title: 'Exploration',
    blurb: 'Minimap, world map and fast travel.',
    slugs: ['xaeros-minimap', 'xaeros-world-map', 'waystones'],
  },
];
