import { WAVES } from '../config/gameData';
import { useGameStore } from '../store/gameStore';

/** win / lose overlay with a restart */
export default function EndScreen() {
  const phase = useGameStore((s) => s.phase);
  const currentWave = useGameStore((s) => s.currentWave);
  const lives = useGameStore((s) => s.lives);
  const money = useGameStore((s) => s.money);
  const reset = useGameStore((s) => s.reset);

  if (phase !== 'won' && phase !== 'lost') return null;
  const won = phase === 'won';

  return (
    <div className="endscreen">
      <div className={`end-card ${won ? 'won' : 'lost'}`}>
        <p className="end-kicker">{won ? 'Base defended' : 'Base overrun'}</p>
        <h1>{won ? 'You win' : 'Game over'}</h1>
        <dl className="end-stats">
          <div>
            <dt>Waves cleared</dt>
            <dd>
              {Math.min(currentWave, WAVES.length)} / {WAVES.length}
            </dd>
          </div>
          <div>
            <dt>Lives left</dt>
            <dd>{lives}</dd>
          </div>
          <div>
            <dt>Money</dt>
            <dd>${money}</dd>
          </div>
        </dl>
        <button className="restart" onClick={reset}>
          Restart
        </button>
      </div>
    </div>
  );
}
