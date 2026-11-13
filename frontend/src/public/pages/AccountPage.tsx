import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useImgReady } from "../hooks/useMediaReady";
import { usePageMeta } from "../hooks/usePageMeta";
import { errorCode, getJson, postEmpty, postJson } from "../lib/api";
import { defaultSiteSettings, fetchSiteSettings } from "../lib/boards";
import { safeAvatar } from "../lib/format";
import type { SiteSettings, UserRole } from "../lib/types";
import {
  buildRaffleEntryPath,
  clearPendingRaffleJoin,
  getPendingRaffleJoin,
  hasPartnerUsername,
  setPendingRaffleJoin,
} from "../lib/raffleJoin";
import { useSession } from "../state/session";
import { useUi } from "../state/ui";

const KICK_ERRORS: Record<string, string> = {
  config: "Kick linking is not turned on for this site yet.",
  denied: "Kick did not grant access. Nothing was linked.",
  state: "That connection expired. Start it again.",
  token: "Kick did not finish the login. Try again.",
  profile: "Kick did not return an account. Try again.",
  store: "The site could not save the Kick account. Try again.",
  taken: "That Kick account is already linked to a confirmed email.",
};

const EMAIL_ERRORS: Record<string, string> = {
  config: "Email confirmation is not turned on yet.",
  email: "Enter a valid email address.",
  wait: "Wait a minute before asking for another code.",
  limit: "Too many codes were sent. Try again later.",
  taken: "That email is already confirmed.",
  send: "The email could not be sent. Try again.",
  bad: "That code is wrong.",
  expired: "That code expired. Ask for a new one.",
  store: "The site could not save the email. Try again.",
};

const PARTNER_ERRORS: Record<string, string> = {
  partner_username: "Enter a valid partner site username (2–48 characters).",
  auth: "Confirm your email or connect Kick first.",
  store: "Could not save your partner site username. Try again.",
};

export function AccountPage() {
  usePageMeta({ title: "Account", pageClass: "site--account" });

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { status, account, accountRev, applyAccount } = useSession();
  const { openRaffleModal, closeRaffleModal } = useUi();

  const [emailInput, setEmailInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [codeStep, setCodeStep] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [confirmingCode, setConfirmingCode] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [partnerInput, setPartnerInput] = useState("");
  const [editingPartner, setEditingPartner] = useState(false);
  const [savingPartner, setSavingPartner] = useState(false);
  const [partnerError, setPartnerError] = useState("");
  const [siteCfg, setSiteCfg] = useState<SiteSettings>(() => defaultSiteSettings());
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const verified = Boolean(account && account.emailVerified && account.email);
  const linked = Boolean(account && account.linked);
  const savedPartner = String(account?.partnerUsername || "").trim();
  const hasPartner = hasPartnerUsername(account);
  const kickAvatar = linked ? safeAvatar(account?.avatarUrl) : "";
  const kickAvatarImg = useImgReady(kickAvatar || undefined);
  const isAccountLoading = status === "loading";

  useEffect(() => {
    let alive = true;
    fetchSiteSettings()
      .then((cfg) => {
        if (alive) setSiteCfg(cfg);
      })
      .catch(() => {
        /* fallback settings */
      });
    return () => {
      alive = false;
    };
  }, []);

  const queryJoinRaffleId = useMemo(() => {
    const raw = (searchParams.get("join_raffle") || "").trim();
    if (!/^\d+$/.test(raw)) return 0;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  }, [searchParams]);

  const [pendingJoin, setPendingJoin] = useState(() => getPendingRaffleJoin());

  useEffect(() => {
    const current = getPendingRaffleJoin();
    if (queryJoinRaffleId > 0 && (!current || current.raffleId !== queryJoinRaffleId)) {
      const created = {
        raffleId: queryJoinRaffleId,
        kickPrompted: false,
      };
      setPendingRaffleJoin(created);
      setPendingJoin(created);
    } else {
      setPendingJoin(current);
    }
  }, [queryJoinRaffleId, accountRev]);

  const activeRaffleId = queryJoinRaffleId || pendingJoin?.raffleId || 0;

  // Raffle join onboarding continuation:
  // - Require verified email + saved partner site username + authorized Kick account.
  // - Once all three are ready: return to `/raffles/:id/?join=1` to auto-enter and show the Joined modal!
  useEffect(() => {
    if (status !== "ready" || !activeRaffleId) return;

    const stored = getPendingRaffleJoin();

    if (verified && hasPartner && linked) {
      closeRaffleModal();
      clearPendingRaffleJoin();
      setPendingJoin(null);
      navigate(buildRaffleEntryPath(activeRaffleId), { replace: true });
      return;
    }

    if (verified && hasPartner && !linked) {
      if (!stored?.kickPrompted) {
        const updated = {
          raffleId: activeRaffleId,
          raffleTitle: stored?.raffleTitle,
          rafflePrize: stored?.rafflePrize,
          kickPrompted: true,
        };
        setPendingRaffleJoin(updated);
        setPendingJoin(updated);
        openRaffleModal({
          kind: "kick-required",
          raffleId: activeRaffleId,
          raffleTitle: stored?.raffleTitle,
          rafflePrize: stored?.rafflePrize,
        });
      }
    }
  }, [
    status,
    activeRaffleId,
    verified,
    hasPartner,
    linked,
    navigate,
    openRaffleModal,
    closeRaffleModal,
  ]);

  const queryErrorKey = searchParams.get("error") || "";
  const kickError = disconnectError || (queryErrorKey && KICK_ERRORS[queryErrorKey]) || "";

  // Reset transient email & partner state when account changes
  useEffect(() => {
    setEmailError("");
    setPartnerError("");
    if (verified) {
      setCodeStep(false);
      setCodeInput("");
    }
    if (savedPartner) {
      setPartnerInput(savedPartner);
    }
  }, [accountRev, verified, savedPartner]);

  const showEmailError = (key: string) => {
    setEmailError(EMAIL_ERRORS[key] || "Something went wrong. Try again.");
  };

  const handleSendEmail = async (event: FormEvent) => {
    event.preventDefault();
    setSendingEmail(true);
    setEmailError("");
    try {
      await postJson("/api/account/email", { email: emailInput });
      setCodeStep(true);
    } catch (err) {
      showEmailError(errorCode(err));
    } finally {
      setSendingEmail(false);
    }
  };

  const handleConfirmCode = async (event: FormEvent) => {
    event.preventDefault();
    setConfirmingCode(true);
    setEmailError("");
    try {
      const body = await postJson<{
        linked?: boolean;
        name?: string;
        email?: string;
        avatarUrl?: string;
        partnerUsername?: string;
        raffleBan?: NonNullable<typeof account>["raffleBan"];
        role?: UserRole;
        isAdmin?: boolean;
        isStreamer?: boolean;
      }>("/api/account/email/confirm", {
        code: codeInput,
      });
      applyAccount({
        linked: Boolean(body.linked ?? account?.linked),
        name: String(body.name ?? account?.name ?? ""),
        avatarUrl: String(body.avatarUrl || account?.avatarUrl || ""),
        emailVerified: true,
        email: String(body.email || emailInput),
        partnerUsername: String(body.partnerUsername ?? account?.partnerUsername ?? "").trim(),
        raffleBan: body.raffleBan !== undefined ? body.raffleBan : (account?.raffleBan ?? null),
        role: body.role ?? account?.role,
        isAdmin: Boolean(body.isAdmin ?? account?.isAdmin),
        isStreamer: Boolean(body.isStreamer ?? account?.isStreamer),
      });
    } catch (err) {
      showEmailError(errorCode(err));
    } finally {
      setConfirmingCode(false);
    }
  };

  const handleSavePartner = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = partnerInput.trim();
    if (trimmed.length < 2 || trimmed.length > 48) {
      setPartnerError(PARTNER_ERRORS.partner_username);
      return;
    }
    setSavingPartner(true);
    setPartnerError("");
    try {
      const body = await postJson<{ partnerUsername?: string }>("/api/account/partner", {
        partnerUsername: trimmed,
      });
      const resolved = String(body.partnerUsername || trimmed).trim();
      setEditingPartner(false);
      setPartnerInput(resolved);
      if (account) {
        applyAccount({
          ...account,
          partnerUsername: resolved,
        });
      } else {
        const fresh = await getJson<typeof account>("/api/kick/me").catch(() => null);
        applyAccount(fresh);
      }
    } catch (err) {
      const key = errorCode(err);
      setPartnerError(
        PARTNER_ERRORS[key] || "Could not save your partner site username. Try again.",
      );
    } finally {
      setSavingPartner(false);
    }
  };

  const handleDisconnectKick = async () => {
    setDisconnecting(true);
    setDisconnectError("");
    try {
      await postEmpty("/api/kick/logout", "logout");
      const fresh = await getJson<typeof account>("/api/kick/me").catch(() => null);
      applyAccount(fresh);
    } catch {
      setDisconnectError("The disconnect did not go through. Refresh the page and try again.");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await postJson("/api/account/logout", {});
      clearPendingRaffleJoin();
      setPendingJoin(null);
      setCodeStep(false);
      setEmailInput("");
      setCodeInput("");
      setPartnerInput("");
      setEditingPartner(false);
      setPartnerError("");
      applyAccount(null);
    } catch {
      showEmailError("store");
    } finally {
      setSigningOut(false);
    }
  };

  // Email status copy
  let emailStatusCopy = "Checking your email…";
  if (status === "error") emailStatusCopy = "Could not check the email.";
  else if (status === "ready") {
    if (verified) emailStatusCopy = "Email confirmed.";
    else if (codeStep) emailStatusCopy = "Code sent. Check your inbox.";
    else emailStatusCopy = "Email is not confirmed.";
  }

  // Partner username status copy
  const partnerBrand = String(siteCfg.partner_name || "").trim();
  const canEditPartner = verified || linked;
  let partnerStatusCopy = "Checking partner username…";
  if (status === "error") partnerStatusCopy = "Could not check partner username.";
  else if (status === "ready") {
    if (!canEditPartner) partnerStatusCopy = "Confirm your email first to add your partner username.";
    else if (hasPartner) partnerStatusCopy = "Partner site username saved.";
    else partnerStatusCopy = "Partner site username is required for raffles.";
  }

  // Kick status copy
  let kickStatusCopy = "Checking your Kick account…";
  if (status === "error") kickStatusCopy = "Could not check the Kick account.";
  else if (status === "ready") {
    kickStatusCopy = linked ? "Connected." : "Not connected.";
  }

  return (
    <section className="kick-account" aria-labelledby="kick-account-title">
      <div className="container kick-account__inner">
        <h1 className="title" id="kick-account-title">
          Your <span className="accent">account</span>
        </h1>
        <p className="lead">
          Confirm your email, save your partner site username, and link the Kick account you use on the stream.
        </p>

        {activeRaffleId > 0 && (
          <div className="kick-account__raffle-banner" data-raffle-onboarding>
            <div className="kick-account__raffle-banner-copy">
              <span className="kick-account__raffle-kicker">Raffle entry</span>
              <p className="kick-account__raffle-text">
                {!verified
                  ? `Register by confirming your email${pendingJoin?.raffleTitle ? ` to enter "${pendingJoin.raffleTitle}"` : ""
                  }, add your partner site username, and authorize Kick.`
                  : !hasPartner
                    ? `Email confirmed — enter your ${partnerBrand || "partner site"
                    } username below to continue joining the raffle.`
                    : !linked
                      ? "Partner username saved — authorize your Kick account below to complete your raffle entry."
                      : "Returning you to the raffle…"}
              </p>
            </div>
            <Link className="kick-account__raffle-back" to={`/raffles/${activeRaffleId}/`}>
              View raffle
            </Link>
          </div>
        )}

        <div className="kick-account__card" data-email-card>
          <p
            className={`kick-account__status${isAccountLoading ? " sr-only" : ""}`}
            data-email-status
            aria-live="polite"
          >
            {emailStatusCopy}
          </p>
          {isAccountLoading && (
            <div className="kick-account__skel" aria-hidden="true">
              <i className="kick-account__skel-status skel" />
              <div className="kick-account__skel-field">
                <i className="kick-account__skel-label skel" />
                <i className="kick-account__skel-input skel" />
              </div>
              <i className="kick-account__skel-btn skel" />
            </div>
          )}
          <p className="kick-account__error" data-email-error hidden={!emailError}>
            {emailError}
          </p>
          <p className="kick-account__name" data-email-done hidden={!verified}>
            {verified ? `Confirmed as ${account?.email}` : ""}
          </p>
          <form
            className="kick-account__form"
            data-email-form
            hidden={isAccountLoading || verified}
            onSubmit={(e) => void handleSendEmail(e)}
          >
            <label className="kick-account__field">
              Email
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                maxLength={254}
                data-email-input
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className={`kick-account__connect${sendingEmail ? " is-loading-shimmer" : ""}`}
              data-email-send
              disabled={sendingEmail}
            >
              Send code
            </button>
          </form>
          <form
            className="kick-account__form"
            data-code-form
            hidden={verified || !codeStep}
            onSubmit={(e) => void handleConfirmCode(e)}
          >
            <label className="kick-account__field">
              Code from your email
              <input
                type="text"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                required
                data-code-input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className={`kick-account__connect${confirmingCode ? " is-loading-shimmer" : ""}`}
              data-code-confirm
              disabled={confirmingCode}
            >
              Confirm
            </button>
          </form>
        </div>

        <div className="kick-account__card" data-partner-card>
          <p
            className={`kick-account__status${isAccountLoading ? " sr-only" : ""}`}
            data-partner-status
            aria-live="polite"
          >
            {partnerStatusCopy}
          </p>
          {isAccountLoading && (
            <div className="kick-account__skel" aria-hidden="true">
              <i className="kick-account__skel-status skel" />
              <div className="kick-account__skel-field">
                <i className="kick-account__skel-label skel" />
                <i className="kick-account__skel-input skel" />
              </div>
              <i className="kick-account__skel-btn skel" />
            </div>
          )}
          <p className="kick-account__error" data-partner-error hidden={!partnerError}>
            {partnerError}
          </p>
          <p
            className="kick-account__name"
            data-partner-done
            hidden={!hasPartner || editingPartner}
          >
            {hasPartner ? `${partnerBrand || "Partner"}: ${savedPartner}` : ""}
          </p>
          {hasPartner && !editingPartner && (
            <div className="kick-account__actions">
              <button
                type="button"
                className="kick-account__disconnect"
                data-partner-edit
                onClick={() => {
                  setPartnerError("");
                  setPartnerInput(savedPartner);
                  setEditingPartner(true);
                }}
              >
                Change username
              </button>
            </div>
          )}
          <form
            className="kick-account__form"
            data-partner-form
            hidden={isAccountLoading || !canEditPartner || (hasPartner && !editingPartner)}
            onSubmit={(e) => void handleSavePartner(e)}
          >
            <label className="kick-account__field">
              {partnerBrand ? `${partnerBrand} username` : "Partner site username"}
              <input
                type="text"
                name="partner_username"
                autoComplete="username"
                required
                minLength={2}
                maxLength={48}
                placeholder={
                  partnerBrand
                    ? `Your username on ${partnerBrand}`
                    : "Your username on the partner site"
                }
                data-partner-input
                value={partnerInput}
                onChange={(e) => setPartnerInput(e.target.value)}
              />
            </label>
            <div className="kick-account__actions">
              <button
                type="submit"
                className={`kick-account__connect${savingPartner ? " is-loading-shimmer" : ""}`}
                data-partner-save
                disabled={savingPartner}
              >
                Save username
              </button>
              {hasPartner && (
                <button
                  type="button"
                  className="kick-account__disconnect"
                  data-partner-cancel
                  disabled={savingPartner}
                  onClick={() => {
                    setPartnerError("");
                    setPartnerInput(savedPartner);
                    setEditingPartner(false);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="kick-account__card" data-kick-card>
          <p
            className={`kick-account__status${isAccountLoading ? " sr-only" : ""}`}
            data-kick-status
            aria-live="polite"
          >
            {kickStatusCopy}
          </p>
          {isAccountLoading && (
            <div className="kick-account__skel" aria-hidden="true">
              <i className="kick-account__skel-status skel" />
              <i className="kick-account__skel-btn kick-account__skel-btn--wide skel" />
            </div>
          )}
          <p className="kick-account__error" data-kick-error hidden={!kickError}>
            {kickError}
          </p>
          <div className="kick-account__who" data-kick-who hidden={!linked}>
            {kickAvatar && !kickAvatarImg.ready && (
              <i className="kick-account__avatar-skel skel" aria-hidden="true" />
            )}
            <img
              ref={kickAvatarImg.ref}
              className={kickAvatar && !kickAvatarImg.ready ? "is-media-pending" : undefined}
              data-kick-avatar
              src={kickAvatar || undefined}
              alt=""
              width={48}
              height={48}
              hidden={!kickAvatar}
              onLoad={kickAvatarImg.onLoad}
              onError={kickAvatarImg.onError}
            />
            <p className="kick-account__name" data-kick-name>
              {linked ? account?.name || "Kick" : ""}
            </p>
          </div>
          <div className="kick-account__actions">
            <a
              className="kick-account__connect"
              href="/api/kick/connect"
              data-kick-connect
              hidden={isAccountLoading || linked}
            >
              Connect Kick
            </a>
            <button
              type="button"
              className={`kick-account__disconnect${disconnecting ? " is-loading-shimmer" : ""}`}
              data-kick-disconnect
              hidden={!linked}
              disabled={disconnecting}
              onClick={() => void handleDisconnectKick()}
            >
              Disconnect
            </button>
          </div>
        </div>

        <button
          type="button"
          className={`kick-account__disconnect${signingOut ? " is-loading-shimmer" : ""}`}
          data-account-signout
          hidden={!(verified || linked || codeStep)}
          disabled={signingOut}
          onClick={() => void handleSignOut()}
        >
          Sign out
        </button>
      </div>
    </section>
  );
}
