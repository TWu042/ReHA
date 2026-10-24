export default function Home({ onStart }) {
    return (
      <div>
        <h1>ReHA - Rehab Adventure</h1>
        <h2>Welcome to Your Rehabilitation Journey!</h2>
        <p>Make rehabilitation fun through interactive games.</p>
  
        <button onClick={onStart}>
          Start Training
        </button>
      </div>
    );
  }