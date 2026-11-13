import { Link } from "react-router-dom";
import { site } from "../../shared/site";
import { useScrollFocus } from "../hooks/useReveal";

export function Footer() {
  const year = new Date().getFullYear();
  const footerFocus = useScrollFocus<HTMLElement>({
    revealThreshold: 0.12,
    enterRatio: 0.25,
    enterPx: 120,
    stayRatio: 0.12,
    stayPx: 64,
    initialOpenDelayMs: 280,
    reenterOpenDelayMs: 240,
    rootMargin: "-56px 0px 0px 0px",
  });

  return (
    <footer
      ref={footerFocus.ref}
      className={`footer${footerFocus.shown ? " is-in" : ""}${footerFocus.opened ? " is-open" : ""}`}
      data-home-footer-reveal
      onPointerDown={footerFocus.unlock}
      onFocus={footerFocus.unlock}
      role="contentinfo"
    >
      <div className="container footer__inner">
        <div className="footer__brand">
          <div className="footer__art" aria-hidden="true">
            <img className="footer__deco" src="/img/footer/mark.webp" alt="" width={742} height={826} loading="lazy" />
          </div>
        </div>

        <nav className="footer__col" aria-label="Site">
          <p className="footer__title">Site</p>
          <Link to="/">Home</Link>
          <Link to="/raffles/">Raffles</Link>
          <Link to="/leaderboards/">Leaderboards</Link>
          <Link to="/bonuses/">Bonuses</Link>
        </nav>

        <nav className="footer__col" aria-label="Community">
          <p className="footer__title">Community</p>
          {site.kickUrl && (
            <a href={site.kickUrl} target="_blank" rel="noopener noreferrer">
              Kick
            </a>
          )}
          {site.telegramUrl && (
            <a href={site.telegramUrl} target="_blank" rel="noopener noreferrer">
              Telegram
            </a>
          )}
          {site.xUrl && (
            <a href={site.xUrl} target="_blank" rel="noopener noreferrer">
              X
            </a>
          )}
          <Link to="/#contacts">Contacts</Link>
        </nav>

        <div className="footer__social">
          {site.kickUrl && (
            <a
              className="footer__chip footer__chip--kick"
              href={site.kickUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Kick"
            >
              <img className="footer__glyph" src="/img/footer/chip-kick.webp?v=2" alt="" width={44} height={44} loading="lazy" />
            </a>
          )}
          {site.telegramUrl && (
            <a
              className="footer__chip footer__chip--tg"
              href={site.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram"
            >
              <img className="footer__glyph" src="/img/footer/chip-tg.webp" alt="" width={44} height={44} loading="lazy" />
            </a>
          )}
          {site.xUrl && (
            <a
              className="footer__chip footer__chip--x"
              href={site.xUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X"
            >
              <img className="footer__glyph" src="/img/footer/chip-x.webp" alt="" width={44} height={44} loading="lazy" />
            </a>
          )}
        </div>
      </div>

      <div className="container footer__bottom">
        <p>&copy; {year} KDeenOff. All rights reserved.</p>
        <p className="footer__rg">
          <img src="/img/icons/nav-18.webp" alt="18+" width={32} height={32} loading="lazy" />
          <span>
            Gamble responsibly —{" "}
            <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer">
              begambleaware.org
            </a>
          </span>
        </p>
      </div>
    </footer>
  );
}
