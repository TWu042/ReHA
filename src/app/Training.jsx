import { useState } from "react";

export default function Training({ onFinish }) {
  const [reps, setReps] = useState(0);
  const target = 10;

  return (
    <section className="training-page">
      <div className="section-label">✦ LEVEL 01 — TRAINING ✦</div>

      <h1>Training Adventure</h1>
      <p className="page-description">
        Every repetition brings you closer to your goal.
      </p>

      <div className="training-layout">
        <div className="glass-panel camera-panel">
          <div className="panel-heading">
            <span>◉ Camera Preview</span>
            <span className="status-pill">Demo Mode</span>
          </div>

          <div className="camera-placeholder">
            <div className="camera-symbol">✧</div>
            <h2>Your journey starts here</h2>
            <p>Camera tracking will appear here</p>
          </div>
        </div>

        <div className="training-sidebar">
          <div className="glass-panel stats-panel">
            <div className="section-label">YOUR PROGRESS</div>
            <div className="rep-number">{reps}<span> / {target}</span></div>
            <p>Repetitions completed</p>

            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.min(100, reps / target * 100)}%` }}
              />
            </div>

            <button
              className="secondary-button"
              onClick={() => setReps((n) => Math.min(target, n + 1))}
            >
              + Simulate Rep
            </button>
          </div>

          <div className="glass-panel feedback-panel">
            <div className="section-label">✦ FORM FEEDBACK</div>
            <h3>Keep going, adventurer!</h3>
            <p>Your progress is building one move at a time.</p>
          </div>
        </div>
      </div>

      <button className="primary-button" onClick={onFinish}>
        Finish Training →
      </button>
    </section>
  );
}