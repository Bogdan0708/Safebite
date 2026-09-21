/** Shown when the App chunk fails to download (e.g. a stale cache or a network blip). */
export function LoadFailedScreen() {
  return (
    <main className="screen" data-testid="load-failed">
      <h1>SafeBite could not load</h1>
      <p>The app's files could not be downloaded. Check your connection and reload the page.</p>
      <button type="button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </main>
  );
}
