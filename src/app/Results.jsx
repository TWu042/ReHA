export default function Results({ onHome }) {
    return (
      <section className="results-page">
  
        <div className="results-header">
          <div className="section-label">
            ✧ ADVENTURE COMPLETE ✧
          </div>
  
          <div className="trophy">🏆</div>
  
          <h1 className="results-title">
            Quest Complete!
          </h1>
  
          <p className="page-description">
            Every step forward is worth celebrating.
          </p>
        </div>
  
        <div className="results-grid">
          <div className="glass-panel result-card">
            <span className="result-icon">⭐</span>
            <h2>--</h2>
            <p>Repetitions</p>
          </div>
  
          <div className="glass-panel result-card">
            <span className="result-icon">🎯</span>
            <h2>--</h2>
            <p>Accuracy</p>
          </div>
  
          <div className="glass-panel result-card">
            <span className="result-icon">⏱️</span>
            <h2>--</h2>
            <p>Duration</p>
          </div>
        </div>
  
        <div className="glass-panel achievement-panel">
          <h3>✦ Your Adventure Continues ✦</h3>
          <p>
            Small steps lead to big achievements.
            Keep showing up for yourself!
          </p>
        </div>
  
        <button
          className="primary-button"
          onClick={onHome}
        >
          ← Back to Home
        </button>
  
      </section>
    );
  }