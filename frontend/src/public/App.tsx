import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AccountPage } from "./pages/AccountPage";
import { BonusesPage } from "./pages/BonusesPage";
import { HomePage } from "./pages/HomePage";
import { LeaderboardBoardPage } from "./pages/LeaderboardBoardPage";
import { LeaderboardsIndexPage } from "./pages/LeaderboardsIndexPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RaffleDetailPage } from "./pages/RaffleDetailPage";
import { RafflesPage } from "./pages/RafflesPage";
import { SessionProvider } from "./state/session";
import { UiProvider } from "./state/ui";

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <UiProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/index.html" element={<HomePage />} />
              <Route path="/raffles" element={<RafflesPage />} />
              <Route path="/raffles/" element={<RafflesPage />} />
              <Route path="/raffles/:id" element={<RaffleDetailPage />} />
              <Route path="/raffles/:id/" element={<RaffleDetailPage />} />
              <Route path="/leaderboards" element={<LeaderboardsIndexPage />} />
              <Route path="/leaderboards/" element={<LeaderboardsIndexPage />} />
              <Route path="/leaderboards/:slug" element={<LeaderboardBoardPage />} />
              <Route path="/leaderboards/:slug/" element={<LeaderboardBoardPage />} />
              <Route path="/bonuses" element={<BonusesPage />} />
              <Route path="/bonuses/" element={<BonusesPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/account/" element={<AccountPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </UiProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
