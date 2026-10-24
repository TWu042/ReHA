export default function Home({ onStart }) {
  return (
    <section className="home-page">
      <div className="hero-label">✧ YOUR ADVENTURE BEGINS ✧</div>

      <h1 className="hero-title">ReHA</h1>
      <h2 className="hero-subtitle">Reha Adventure</h2>

      <p className="hero-description">
        Turn every movement into an adventure.
        <br />
        Explore, move, and grow stronger every day.
      </p>

      <button className="primary-button" onClick={onStart}>
        Start Your Adventure →
      </button>

      <div className="feature-grid">
        <div className="feature-card">
          <div className="feature-icon">🎮</div>
          <h3>Interactive Games</h3>
          <p>Make every movement fun</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">📊</div>
          <h3>Track Progress</h3>
          <p>Celebrate every milestone</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🌿</div>
          <h3>Grow Stronger</h3>
          <p>One step at a time</p>
        </div>
      </div>
    </section>
  );
}