import {
  ECONOMY,
  TARGET_MODES,
  TOWERS,
  towerMaxLevel,
  towerStats,
  upgradeCost,
  type TowerLevel,
} from '../config/gameData';
import { useGameStore } from '../store/gameStore';

const fmt = (key: keyof TowerLevel, v: number | undefined) => {
  if (v == null) return '—';
  if (key === 'fireRate') return `${v}/s`;
  if (key === 'poisonDps') return `${v}/s`;
  if (key === 'poisonMs') return `${v / 1000}s`;
  if (key === 'slowAmount' || key === 'buffDamage' || key === 'buffFireRate') {
    return `+${Math.round(v * 100)}%`;
  }
  return `${v}`;
};

/** which stat rows make sense for this tower */
const rowsFor = (type: string): Array<[string, keyof TowerLevel]> => {
  if (type === 'support') {
    return [['Range', 'range'], ['Damage buff', 'buffDamage'], ['Rate buff', 'buffFireRate']];
  }
  if (type === 'mortar') {
    return [['Damage', 'damage'], ['Range', 'range'], ['Fire rate', 'fireRate'], ['Splash', 'aoeRadius']];
  }
  if (type === 'poison') {
    return [['Range', 'range'], ['Fire rate', 'fireRate'], ['Poison', 'poisonDps'], ['Duration', 'poisonMs']];
  }
  if (type === 'frost') {
    return [['Damage', 'damage'], ['Range', 'range'], ['Fire rate', 'fireRate'], ['Slow', 'slowAmount']];
  }
  return [['Damage', 'damage'], ['Range', 'range'], ['Fire rate', 'fireRate']];
};

/** one stat row, showing "current -> next" when an upgrade would change it */
function Stat({
  label,
  statKey,
  cur,
  next,
}: {
  label: string;
  statKey: keyof TowerLevel;
  cur: TowerLevel;
  next: TowerLevel | null;
}) {
  const a = cur[statKey] as number | undefined;
  const b = next?.[statKey] as number | undefined;
  const changed = next != null && b != null && b !== a;

  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {fmt(statKey, a)}
        {changed && <span className="delta"> → {fmt(statKey, b)}</span>}
      </dd>
    </div>
  );
}

export default function TowerInspector() {
  const selectedTowerId = useGameStore((s) => s.selectedTowerId);
  const tower = useGameStore((s) =>
    s.towers.find((t) => t.id === s.selectedTowerId),
  );
  const money = useGameStore((s) => s.money);
  const sellTower = useGameStore((s) => s.sellTower);
  const upgradeTower = useGameStore((s) => s.upgradeTower);
  const setTargetMode = useGameStore((s) => s.setTargetMode);
  const selectTower = useGameStore((s) => s.selectTower);

  if (!selectedTowerId || !tower) return null;

  const def = TOWERS[tower.type];
  const cur = towerStats(tower.type, tower.level);
  const maxLevel = towerMaxLevel(tower.type);
  const maxed = tower.level >= maxLevel;
  const next = maxed ? null : towerStats(tower.type, tower.level + 1);
  const price = upgradeCost(tower.type, tower.level);
  const affordable = price != null && money >= price;
  const refund = Math.floor(tower.invested * ECONOMY.sellRefund);

  return (
    <div className="inspector panel">
      <div className="inspector-head">
        <span className="swatch" style={{ background: def.color }} />
        <h2>{def.name}</h2>
        <button className="close" onClick={() => selectTower(null)}>
          ×
        </button>
      </div>

      <div className="level-row">
        <span className="level-pips">
          {Array.from({ length: maxLevel }, (_, i) => (
            <span key={i} className={`pip${i < tower.level ? ' on' : ''}`} />
          ))}
        </span>
        <span className="level-text">
          Level {tower.level} / {maxLevel}
        </span>
      </div>

      <dl className="stats">
        {rowsFor(tower.type).map(([label, key]) => (
          <Stat key={key} label={label} statKey={key} cur={cur} next={next} />
        ))}
        {rowsFor(tower.type).length < 4 && (
          <div>
            <dt>Tile</dt>
            <dd>
              {tower.x}, {tower.z}
            </dd>
          </div>
        )}
      </dl>

      {def.role === 'attack' && (
        <div className="targeting">
          <span className="targeting-label">Target</span>
          <div className="mode-row">
            {TARGET_MODES.map((m) => (
              <button
                key={m.id}
                className={`mode${tower.targetMode === m.id ? ' active' : ''}`}
                title={m.hint}
                onClick={() => setTargetMode(tower.id, m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        className="upgrade"
        disabled={maxed || !affordable}
        onClick={() => upgradeTower(tower.id)}
      >
        {maxed ? 'Fully upgraded' : `Upgrade to L${tower.level + 1} · $${price}`}
      </button>

      <p className="invested">Invested ${tower.invested}</p>

      <button className="sell" onClick={() => sellTower(tower.id)}>
        Sell for ${refund}
      </button>
    </div>
  );
}
