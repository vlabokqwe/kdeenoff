import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import { LeaderboardShell } from "../components/LeaderboardShell";
import { usePageMeta } from "../hooks/usePageMeta";
import { validSlug } from "../lib/boards";
import { NotFoundPage } from "./NotFoundPage";

export function LeaderboardBoardPage() {
  const { slug } = useParams<{ slug: string }>();
  const cleanSlug = validSlug(slug);
  const [missingSlug, setMissingSlug] = useState<string | null>(null);
  const boardMissing = Boolean(cleanSlug && missingSlug === cleanSlug);

  const handleNotFoundChange = useCallback(
    (notFound: boolean) => {
      setMissingSlug((prev) => {
        if (!cleanSlug) return prev;
        if (notFound) return cleanSlug;
        return prev === cleanSlug ? null : prev;
      });
    },
    [cleanSlug],
  );

  usePageMeta({
    title: cleanSlug && !boardMissing ? "Leaderboard" : "Not found",
    pageClass: cleanSlug && !boardMissing ? "site--board" : "site--account",
  });

  if (!cleanSlug) {
    return <NotFoundPage />;
  }

  return (
    <section
      className={boardMissing ? undefined : "board-section board-section--page"}
      aria-label="Leaderboard"
    >
      {!boardMissing && <div className="board-section__bg" aria-hidden="true" />}
      <LeaderboardShell
        slug={cleanSlug}
        switcher
        heading="h1"
        plain
        podiumArt
        zeusTheme
        onNotFoundChange={handleNotFoundChange}
      />
    </section>
  );
}
