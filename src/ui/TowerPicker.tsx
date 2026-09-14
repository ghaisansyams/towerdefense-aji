import { TOWERS, TOWER_ORDER, towerBuyCost } from '../config/gameData';
import { useGameStore } from '../store/gameStore';

export default function TowerPicker() {
  const money = useGameStore((s) => s.money);
  const selectedTowerType = useGameStore((s) => s.selectedTowerType);
  const setSelectedTowerType = useGameStore((s) => s.setSelectedTowerType);

  return (
    <div className="picker panel">
      {TOWER_ORDER.map((id) => {
        const def = TOWERS[id];
        const price = towerBuyCost(id);
        const affordable = money >= price;
        const active = selectedTowerType === id;
        return (
          <button
            key={id}
            className={`tower-btn${active ? ' active' : ''}`}
            disabled={!affordable}
            onClick={() => setSelectedTowerType(id)}
            style={{ '--accent': def.color } as React.CSSProperties}
          >
            <span className="swatch" />
            <span className="tower-name">{def.name}</span>
            <span className={`tower-cost${affordable ? '' : ' broke'}`}>
              ${price}
            </span>
            <span className="tower-blurb">{def.blurb}</span>
          </button>
        );
      })}
      <p className="picker-hint">
        {selectedTowerType
          ? 'Click a green tile to build · click the button again to cancel'
          : 'Pick a tower, or click one on the board to inspect it'}
      </p>
    </div>
  );
}
