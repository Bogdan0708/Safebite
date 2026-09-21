import { NavLink, Navigate, Route, Routes } from "react-router";
import { DiscoverPage } from "./pages/DiscoverPage";
import { ClaimFormPage } from "./records/ClaimFormPage";
import { RestaurantDetailPage } from "./records/RestaurantDetailPage";
import { RestaurantFormPage } from "./records/RestaurantFormPage";
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
          <Route path="/restaurants/new" element={<RestaurantFormPage mode="create" />} />
          <Route path="/restaurants/:rid/edit" element={<RestaurantFormPage mode="edit" />} />
          <Route path="/restaurants/:rid" element={<RestaurantDetailPage />} />
          <Route path="/restaurants/:rid/evidence/new" element={<ClaimFormPage />} />
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
