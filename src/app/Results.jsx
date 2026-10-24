export default function Results({ onHome }) {
    return (
      <div>
        <h1>Training Complete!</h1>
        <h2>Your Results</h2>
  
        <p>Repetitions: --</p>
        <p>Accuracy: --</p>
  
        <button onClick={onHome}>
          Back to Home
        </button>
      </div>
    );
  }