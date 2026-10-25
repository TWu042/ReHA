import { useEffect, useRef, useState } from 'react';
import spriteUrl from '../assets/fox-spirites.png';
import { mountFoxAnimation } from './foxAnimation.js';
import './foxReward.css';

export default function FoxReward() {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => mountFoxAnimation(canvasRef.current, {
    src: spriteUrl,
    onStatus: setStatus,
  }), []);

  return (
    <section className="glass-panel fox-reward-panel" aria-label="Fox adventure reward">
      <div className="section-label">YOUR ADVENTURE COMPANION</div>
      <h3>Every squat unlocks a little joy</h3>
      <div className="fox-reward-stage">
        <div className="fox-reward-window">
        <canvas ref={canvasRef} width="300" height="400" role="img"
          aria-label="A fox celebrates each completed squat beside a treasure chest" />
        {status !== 'ready' && (
          <p className="fox-reward-placeholder" role="status">
            {status === 'error' ? 'Your fox could not load. You can keep training.' : 'Your fox is getting ready…'}
          </p>
        )}
        </div>
      </div>
      <p className="fox-reward-caption">Complete a squat to celebrate together.</p>
      <p className="fox-reward-note">Keyframe animation preview · slight visual jitter may occur.</p>
    </section>
  );
}
