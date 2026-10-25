
import { useState } from "react";
import Home from "./app/Home";
import Training from "./app/Training";
import Results from "./app/Results";
import { analyzeSession } from "./analytics/analyticsModule";
import "./App.css";

export default function App() {
  const [page, setPage] = useState("home");

  // Save the completed training session
  const [sessionResult, setSessionResult] = useState(null);

  // P3 analytics summary for that session (scores, baseline)
  const [analysis, setAnalysis] = useState(null);

  function handleStart() {
    // Reset previous session data
    setSessionResult(null);
    setAnalysis(null);
    setPage("training");
  }

  function handleFinish(result) {
    // Receive real data from P2 movement module
    console.log("Training finished:", result);

    // P3 scoring: adapter -> summary -> save history -> emit session_summary.
    // Never throws; on failure Results still shows P2's raw data.
    const scored = analyzeSession(result);
    if (scored.error) console.warn("Analytics:", scored.error);
    console.log("Session summary:", scored.summary);

    setSessionResult(result);
    setAnalysis(scored);
    setPage("results");
  }

  function handleHome() {
    setSessionResult(null);
    setAnalysis(null);
    setPage("home");
  }

  return (
    <div className="app-shell">
      <header className="navbar">
        <div className="brand">✦ ReHA</div>

        <nav>
          <button onClick={handleHome}>
            Home
          </button>

          <button onClick={handleStart}>
            Training
          </button>

          <button onClick={() => setPage("results")}>
            Results
          </button>
        </nav>
      </header>

      <main className="main-content">
        {page === "home" && (
          <Home onStart={handleStart} />
        )}

        {page === "training" && (
          <Training onFinish={handleFinish} />
        )}

        {page === "results" && (
          <Results
            result={sessionResult}
            analysis={analysis}
            onHome={handleHome}
          />
        )}
      </main>

      <footer className="footer">
        ✦ ReHA — Every movement is an adventure ✦
      </footer>
    </div>
  );
}
