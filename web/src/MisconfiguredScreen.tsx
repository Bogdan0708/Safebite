/** Shown instead of the app when a built bundle carries a non-deployable Firebase configuration. */
export function MisconfiguredScreen({ problems }: { problems: string[] }) {
  return (
    <main className="screen" data-testid="misconfigured">
      <h1>This build is misconfigured</h1>
      <p>SafeBite refused to start because its Firebase configuration is not deployable:</p>
      <ul className="problems">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
      <p>Rebuild with the pilot project's <code>VITE_FIREBASE_*</code> values. Nothing was loaded and no data was touched.</p>
    </main>
  );
}
