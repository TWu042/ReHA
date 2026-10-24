
import { useState } from "react";
import Home from "./app/Home";
import Training from "./app/Training";
import Results from "./app/Results";
import "./App.css";

export default function App() {
  const [page, setPage] = useState("home");

  // Save the completed training session
  const [sessionResult, setSessionResult] = useState(null);

  function handleStart() {
    // Reset previous session data
    setSessionResult(null);
    setPage("training");
  }

  function handleFinish(result) {
    // Receive real data from P2 movement module
    console.log("Training finished:", result);

    setSessionResult(result);
    setPage("results");
  }

  function handleHome() {
    setSessionResult(null);
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
