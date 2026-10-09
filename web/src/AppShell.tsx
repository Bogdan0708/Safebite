import { DeleteAccountPage } from "./account/DeleteAccountPage";
import { NavLink, Navigate, Route, Routes } from "react-router";
import { DiscoverPage } from "./discover/DiscoverPage";
import { ClaimFormPage } from "./records/ClaimFormPage";
import { RestaurantDetailPage } from "./records/RestaurantDetailPage";
import { RestaurantFormPage } from "./records/RestaurantFormPage";
import { RestaurantsPage } from "./records/RestaurantsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { BrandMark, Icon } from "./ui/Icon";

export function AppShell() {
  return (
    <div className="shell">
      <header className="shell-header">
        <h1 className="brand"><BrandMark />SafeBite<span className="brand-dot" aria-hidden="true">.</span></h1>
        <span className="private-label">Just for us</span>
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
          <Route path="/settings/delete-account" element={<DeleteAccountPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/discover" replace />} />
        </Routes>
      </main>
      <nav className="shell-nav" aria-label="Main">
        <NavLink data-testid="nav-discover" to="/discover"><Icon name="compass" /><span>Discover</span></NavLink>
        <NavLink data-testid="nav-saved" to="/restaurants"><Icon name="bookmark" /><span>Saved</span></NavLink>
        <NavLink data-testid="nav-settings" to="/settings"><Icon name="sliders" /><span>Settings</span></NavLink>
      </nav>
    </div>
  );
}
