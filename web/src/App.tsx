import { useState } from "react";

function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <h1>Get started</h1>
      <p>
        Edit <code>src/App.tsx</code> and save to test <code>HMR</code>
      </p>
      <button type="button" onClick={() => setCount((count) => count + 1)}>
        Count is {count}
      </button>
    </>
  );
}

export default App;
