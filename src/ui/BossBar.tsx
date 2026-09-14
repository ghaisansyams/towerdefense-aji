import { useEffect, useRef } from 'react';
import { bossBarNodes } from '../game/bossBar';

/** big dedicated bar across the top, shown only while a boss is alive */
export default function BossBar() {
  const root = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const hp = useRef<HTMLSpanElement>(null);
  const name = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    bossBarNodes.root = root.current;
    bossBarNodes.fill = fill.current;
    bossBarNodes.hp = hp.current;
    bossBarNodes.name = name.current;
    return () => {
      bossBarNodes.root = null;
      bossBarNodes.fill = null;
      bossBarNodes.hp = null;
      bossBarNodes.name = null;
    };
  }, []);

  return (
    <div className="bossbar" ref={root} data-on="0" style={{ opacity: 0 }}>
      <div className="boss-head">
        <span className="boss-name" ref={name} />
        <span className="boss-hp" ref={hp} />
      </div>
      <div className="boss-track">
        <div className="boss-fill" ref={fill} />
      </div>
    </div>
  );
}
