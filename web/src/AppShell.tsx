import { NavLink, Navigate, Route, Routes } from "react-router";
import { DiscoverPage } from "./pages/DiscoverPage";
import { RestaurantsPage } from "./records/RestaurantsPage";
import { SettingsPage } from "./pages/SettingsPage";

export function AppShell() {
  return (
    <div className="shell">
      <header className="shell-header">
        <h1>SafeBite</h1>
      </header>
      <main className="shell-main">
        <Routes>
          <Route path="/" element={<Navigate to="/discover" replace />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/saved" element={<Navigate to="/restaurants" replace />} />
          <Route path="/restaurants" element={<RestaurantsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/discover" replace />} />
        </Routes>
      </main>
      <nav className="shell-nav" aria-label="Main">
        <NavLink data-testid="nav-discover" to="/discover">Discover</NavLink>
        <NavLink data-testid="nav-saved" to="/restaurants">Saved</NavLink>
        <NavLink data-testid="nav-settings" to="/settings">Settings</NavLink>
      </nav>
    </div>
  );
}
