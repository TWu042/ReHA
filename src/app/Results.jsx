
export default function Results({ result, onHome }) {
    // Real session data from P2
    const repCount = result?.repCount ?? 0;
  
    const averageROM =
      result?.averageROM != null
        ? `${result.averageROM.toFixed(1)}°`
        : "--";
  
    const trackingQuality =
      result?.trackingQuality != null
        ? `${(result.trackingQuality * 100).toFixed(0)}%`
        : "--";
  
    const completedReps = result?.reps ?? [];
  
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
            <h2>{result ? repCount : "--"}</h2>
            <p>Repetitions</p>
          </div>
  
          <div className="glass-panel result-card">
            <span className="result-icon">🎯</span>
            <h2>{averageROM}</h2>
            <p>Average ROM</p>
          </div>
  
          <div className="glass-panel result-card">
            <span className="result-icon">📡</span>
            <h2>{trackingQuality}</h2>
            <p>Tracking Quality</p>
          </div>
        </div>
  
        <div className="glass-panel achievement-panel">
          <h3>✦ Your Adventure Continues ✦</h3>
  
          <p>
            {result
              ? `You completed ${repCount} squat${
                  repCount === 1 ? "" : "s"
                } during this adventure. Keep showing up for yourself!`
              : "Complete a training session to see your results."}
          </p>
  
          {completedReps.length > 0 && (
            <div style={{ marginTop: "24px" }}>
              <h3>✦ Repetition Details ✦</h3>
  
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    textAlign: "left",
                    marginTop: "16px",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ padding: "12px" }}>
                        Rep
                      </th>
                      <th style={{ padding: "12px" }}>
                        ROM
                      </th>
                      <th style={{ padding: "12px" }}>
                        Duration
                      </th>
                    </tr>
                  </thead>
  
                  <tbody>
                    {completedReps.map((rep, index) => (
                      <tr key={index}>
                        <td style={{ padding: "12px" }}>
                          #{index + 1}
                        </td>
  
                        <td style={{ padding: "12px" }}>
                          {rep.rom != null
                            ? `${rep.rom.toFixed(1)}°`
                            : "--"}
                        </td>
  
                        <td style={{ padding: "12px" }}>
                          {rep.durationMs != null
                            ? `${(
                                rep.durationMs / 1000
                              ).toFixed(1)}s`
                            : "--"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
  