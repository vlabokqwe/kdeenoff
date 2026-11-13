import { useEffect, useRef } from "react";
import { setPendingRaffleJoin } from "../lib/raffleJoin";
import { useUi } from "../state/ui";

function CheckCircleGraphic() {
  return (
    <svg
      className="raffle-modal__check-svg"
      viewBox="0 0 56 56"
      width={56}
      height={56}
      aria-hidden="true"
    >
      <circle
        className="raffle-modal__check-ring"
        cx={28}
        cy={28}
        r={24}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.2}
      />
      <path
        className="raffle-modal__check-mark"
        d="M17.5 28.6 24.8 35.8 39 20.8"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function KickLogoKGraphic() {
  return (
    <svg
      className="raffle-modal__kick-svg"
      viewBox="0 0 26 26"
      width={38}
      height={38}
      fill="none"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1 0H9.76711V5.79452H12.589V2.82193H15.5616V0H24.1781V8.61645H21.3561V11.589H18.3836V14.411H21.3561V17.3836H24.1781V26H15.5616V23.1781H12.589V20.2055H9.76711V26H1V0Z"
        fill="#53FC18"
      />
    </svg>
  );
}

export function RaffleModals() {
  const { raffleModal, closeRaffleModal } = useUi();
  const primaryRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!raffleModal) return;
    const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const raf = requestAnimationFrame(() => {
      primaryRef.current?.focus();
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRaffleModal();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey, true);
      if (prevFocus && document.contains(prevFocus)) {
        prevFocus.focus({ preventScroll: true });
      }
    };
  }, [raffleModal, closeRaffleModal]);

  if (!raffleModal) return null;

  const isJoined = raffleModal.kind === "joined";

  const handleConnectKick = () => {
    if (raffleModal.raffleId && raffleModal.raffleId > 0) {
      setPendingRaffleJoin({
        raffleId: raffleModal.raffleId,
        raffleTitle: raffleModal.raffleTitle,
        rafflePrize: raffleModal.rafflePrize,
        kickPrompted: true,
      });
    }
  };

  return (
    <div
      className="raffle-modal-backdrop"
      data-raffle-modal={raffleModal.kind}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeRaffleModal();
      }}
    >
      <div
        key={raffleModal.kind}
        className={`raffle-modal raffle-modal--${raffleModal.kind}`}
        role="dialog"
        aria-modal="true"
        aria-label={isJoined ? "You are participating in the raffle" : undefined}
        aria-labelledby={isJoined ? undefined : "raffle-modal-title"}
      >
        <div
          className={`raffle-modal__badge ${
            isJoined ? "raffle-modal__badge--joined" : "raffle-modal__badge--kick"
          }`}
          aria-hidden="true"
        >
          {isJoined ? <CheckCircleGraphic /> : <KickLogoKGraphic />}
        </div>

        {!isJoined && (
          <h2 className="raffle-modal__title" id="raffle-modal-title">
            Authorize Kick to participate in raffles
          </h2>
        )}

        <div className="raffle-modal__actions">
          {isJoined ? (
            <button
              ref={(el) => {
                primaryRef.current = el;
              }}
              type="button"
              className="raffle-modal__btn raffle-modal__btn--primary"
              data-raffle-modal-ok
              onClick={closeRaffleModal}
            >
              Got it
            </button>
          ) : (
            <>
              <a
                ref={(el) => {
                  primaryRef.current = el;
                }}
                href="/api/kick/connect"
                className="raffle-modal__btn raffle-modal__btn--primary"
                data-raffle-modal-connect
                onClick={handleConnectKick}
              >
                Authorize Kick
              </a>
              <button
                type="button"
                className="raffle-modal__btn raffle-modal__btn--ghost"
                data-raffle-modal-close
                onClick={closeRaffleModal}
              >
                Later
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
