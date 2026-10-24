import { useState } from "react";
import Home from "./app/Home";
import Training from "./app/Training";
import Results from "./app/Results";
import "./App.css";

export default function App() {
  const [page, setPage] = useState("home");

  return (
    <div className="app-shell">
      <header className="navbar">
        <div className="brand">✦ ReHA</div>
        <nav>
          <button onClick={() => setPage("home")}>Home</button>
          <button onClick={() => setPage("training")}>Training</button>
          <button onClick={() => setPage("results")}>Results</button>
        </nav>
      </header>

      <main className="main-content">
        {page === "home" && (
          <Home onStart={() => setPage("training")} />
        )}

        {page === "training" && (
          <Training onFinish={() => setPage("results")} />
        )}

        {page === "results" && (
          <Results onHome={() => setPage("home")} />
        )}
      </main>

      <footer className="footer">
        ✦ ReHA — Every movement is an adventure ✦
      </footer>
    </div>
  );
}
