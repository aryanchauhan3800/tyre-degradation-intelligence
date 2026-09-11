/**
 * TYRETRACE — 3D Scene Adapter
 * Re-exports HeroTyreScene as RaceCarScene for full backward compatibility.
 */

import { HeroTyreScene } from './HeroTyreScene';
import type { SceneCallbacks } from './RaceCarSceneTypes';

export { HeroTyreScene };
export type { SceneCallbacks };

export class RaceCarScene extends HeroTyreScene {
  constructor(container: HTMLElement, callbacks?: { onSelectTyre?: (c: any) => void; onHoverTyre?: (c: any) => void }) {
    super(container, {
      onHover: (hovered) => {
        callbacks?.onHoverTyre?.(hovered ? 'FR' : null);
      },
      onClick: () => {
        callbacks?.onSelectTyre?.('FR');
      },
    });
  }
}
