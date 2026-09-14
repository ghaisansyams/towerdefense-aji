import Scene from './game/Scene';
import Hud from './ui/Hud';
import TowerPicker from './ui/TowerPicker';
import TowerInspector from './ui/TowerInspector';
import EndScreen from './ui/EndScreen';
import DamageNumbers from './ui/DamageNumbers';
import BossBar from './ui/BossBar';
import Abilities from './ui/Abilities';

export default function App() {
  return (
    <div className="app">
      <Scene />
      <DamageNumbers />
      <div className="overlay">
        <Hud />
        <BossBar />
        <Abilities />
        <TowerInspector />
        <TowerPicker />
        <EndScreen />
      </div>
    </div>
  );
}
