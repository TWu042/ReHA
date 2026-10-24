export default function Training({ onFinish }) {
    return (
      <div>
        <h1>Training Session</h1>
        <p>Your rehabilitation adventure starts here!</p>
  
        <h2>Camera Preview</h2>
        <p>Camera integration coming soon...</p>
  
        <h2>Repetitions: 0</h2>
  
        <button onClick={onFinish}>
          Finish Training
        </button>
      </div>
    );
  }