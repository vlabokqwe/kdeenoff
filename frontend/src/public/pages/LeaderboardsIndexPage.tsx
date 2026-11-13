import { LeaderboardShell } from "../components/LeaderboardShell";
import { usePageMeta } from "../hooks/usePageMeta";

export function LeaderboardsIndexPage() {
  usePageMeta({ title: "Leaderboards", pageClass: "site--board" });

  return (
    <section className="board-section board-section--page" aria-label="Leaderboards">
      <div className="board-section__bg" aria-hidden="true" />
      <LeaderboardShell slug="" switcher heading="h1" plain podiumArt zeusTheme />
    </section>
  );
}
