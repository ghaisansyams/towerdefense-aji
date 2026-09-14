import { WAVES, waveSize } from '../config/gameData';
import { useGameStore } from '../store/gameStore';

export default function Hud() {
  const money = useGameStore((s) => s.money);
  const lives = useGameStore((s) => s.lives);
  const phase = useGameStore((s) => s.phase);
  const currentWave = useGameStore((s) => s.currentWave);
  const remaining = useGameStore((s) => s.enemies.length);
  const startWave = useGameStore((s) => s.startWave);
  const quality = useGameStore((s) => s.quality);
  const setQuality = useGameStore((s) => s.setQuality);

  const waveLabel = Math.min(currentWave + 1, WAVES.length);

  return (
    <div className="hud panel">
      <div className="stat">
        <span className="stat-label">Money</span>
        <span className="stat-value money">${money}</span>
      </div>
      <div className="stat">
        <span className="stat-label">Lives</span>
        <span className="stat-value lives">{lives}</span>
      </div>
      <div className="stat">
        <span className="stat-label">Wave</span>
        <span className="stat-value">
          {waveLabel}
          <span className="stat-sub"> / {WAVES.length}</span>
        </span>
      </div>

      <button
        className={`fxtoggle${quality.bloom ? ' on' : ''}`}
        title="Bloom costs ~20fps on integrated graphics"
        onClick={() => setQuality({ bloom: !quality.bloom })}
      >
        Bloom {quality.bloom ? 'on' : 'off'}
      </button>

      {phase === 'building' && (
        <button className="start-wave" onClick={startWave}>
          Start Wave {waveLabel}
          <span className="start-sub">{waveSize(currentWave)} enemies</span>
        </button>
      )}
      {phase === 'wave' && (
        <div className="stat">
          <span className="stat-label">Remaining</span>
          <span className="stat-value">{remaining}</span>
        </div>
      )}
    </div>
  );
}
