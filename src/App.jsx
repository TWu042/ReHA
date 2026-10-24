import { useState } from "react";

import Home from "./app/Home";
import Training from "./app/Training";
import Results from "./app/Results";

function App() {
  const [page, setPage] = useState("home");

  return (
    <div>
      {page === "home" && (
        <Home onStart={() => setPage("training")} />
      )}

      {page === "training" && (
        <Training onFinish={() => setPage("results")} />
      )}

      {page === "results" && (
        <Results onHome={() => setPage("home")} />
      )}
    </div>
  );
}

export default App;
