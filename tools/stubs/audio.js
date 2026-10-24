import { createSfxStub } from '../../src/core/sfxStub.js';
export function createAudio() { const a = createSfxStub(); a.chime = () => a.play('chime'); return a; }
