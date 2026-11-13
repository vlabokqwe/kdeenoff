import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { errorCode, getJson, postJson } from "../lib/api";
import type { Account, UserRole } from "../lib/types";
import { useSession } from "../state/session";
import { useUi } from "../state/ui";

type AuthStep = "email" | "code" | "done";

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

const COPY = {
  login: { title: "Log in", sub: "We'll email you a code." },
  register: { title: "Create your account", sub: "We'll email you a code." },
} as const;

export function AuthDialog() {
  const { authModal, closeAuthModal } = useUi();
  const { account, applyAccount } = useSession();

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const accountLinkRef = useRef<HTMLAnchorElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const openSeqRef = useRef(0);
  const accountRef = useRef(account);
  accountRef.current = account;

  const [step, setStep] = useState<AuthStep>("email");
  const [emailInput, setEmailInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [confirmedEmail, setConfirmedEmail] = useState("");
  const [errorText, setErrorText] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [confirmingCode, setConfirmingCode] = useState(false);

  const showError = (key: string) => {
    setErrorText(
      EMAIL_ERRORS[key] ||
        (key && key.includes(" ") ? key : "Something went wrong. Try again."),
    );
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!authModal) {
      openSeqRef.current += 1;
      if (dialog.open) {
        try {
          dialog.close();
        } catch {
          /* ignore */
        }
      }
      const prev = openerRef.current;
      openerRef.current = null;
      if (prev && document.contains(prev)) {
        prev.focus({ preventScroll: true });
      }
      return;
    }

    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const seq = ++openSeqRef.current;
    setErrorText("");
    setCodeInput("");

    const cur = accountRef.current;
    const alreadyVerified = Boolean(cur && cur.emailVerified && cur.email);
    if (alreadyVerified && cur) {
      setConfirmedEmail(cur.email);
      setStep("done");
    } else {
      setStep("email");
    }

    if (!dialog.open && typeof dialog.showModal === "function") {
      dialog.showModal();
    }

    const focusRaf = requestAnimationFrame(() => {
      if (alreadyVerified) {
        accountLinkRef.current?.focus();
      } else {
        emailInputRef.current?.focus();
      }
    });

    const ctrl = new AbortController();
    getJson<Account>("/api/kick/me", { signal: ctrl.signal })
      .then((fresh) => {
        if (seq !== openSeqRef.current || !dialog.open) return;
        if (fresh && fresh.emailVerified && fresh.email) {
          applyAccount(fresh);
          setConfirmedEmail(fresh.email);
          setStep("done");
          requestAnimationFrame(() => accountLinkRef.current?.focus());
        }
      })
      .catch(() => {
        /* ignore background session check */
      });

    return () => {
      cancelAnimationFrame(focusRaf);
      ctrl.abort();
    };
  }, [authModal, applyAccount]);

  const modeCopy = authModal ? COPY[authModal] : COPY.register;
  const heading = step === "done" ? "You're signed in" : modeCopy.title;
  const subText =
    step === "code" ? "Enter the code from your email." : modeCopy.sub;

  const handleSendEmail = async (event: FormEvent) => {
    event.preventDefault();
    setSendingEmail(true);
    setErrorText("");
    try {
      await postJson("/api/account/email", { email: emailInput });
      setStep("code");
      requestAnimationFrame(() => codeInputRef.current?.focus());
    } catch (err) {
      showError(errorCode(err));
    } finally {
      setSendingEmail(false);
    }
  };

  const handleConfirmCode = async (event: FormEvent) => {
    event.preventDefault();
    setConfirmingCode(true);
    setErrorText("");
    try {
      const body = await postJson<{
        email?: string;
        avatarUrl?: string;
        partnerUsername?: string;
        role?: UserRole;
        isAdmin?: boolean;
        isStreamer?: boolean;
      }>("/api/account/email/confirm", {
        code: codeInput,
      });
      const resolvedEmail = String(body.email || emailInput).trim();
      const cur = accountRef.current;
      applyAccount({
        linked: cur?.linked ?? false,
        name: cur?.name ?? "",
        avatarUrl: String(body.avatarUrl || cur?.avatarUrl || ""),
        emailVerified: true,
        email: resolvedEmail,
        partnerUsername: String(body.partnerUsername ?? cur?.partnerUsername ?? "").trim(),
        raffleBan: cur?.raffleBan ?? null,
        role: body.role ?? cur?.role,
        isAdmin: Boolean(body.isAdmin ?? cur?.isAdmin),
        isStreamer: Boolean(body.isStreamer ?? cur?.isStreamer),
      });
      setConfirmedEmail(resolvedEmail);
      setStep("done");
      requestAnimationFrame(() => accountLinkRef.current?.focus());
    } catch (err) {
      showError(errorCode(err));
    } finally {
      setConfirmingCode(false);
    }
  };

  const handleBackToEmail = () => {
    setErrorText("");
    setCodeInput("");
    setStep("email");
    requestAnimationFrame(() => emailInputRef.current?.focus());
  };

  return (
    <dialog
      ref={dialogRef}
      className="auth-dialog"
      data-auth-dialog
      aria-labelledby="auth-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        closeAuthModal();
      }}
      onClose={() => {
        if (authModal) closeAuthModal();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current && step !== "code") {
          closeAuthModal();
        }
      }}
    >
      <div className="auth-dialog__card">
        <header className="auth-dialog__head">
          <h2 id="auth-dialog-title" data-auth-title>
            {heading}
          </h2>
          <button
            type="button"
            className="auth-dialog__close"
            data-auth-close
            aria-label="Close"
            onClick={closeAuthModal}
          >
            ×
          </button>
        </header>

        <p className="auth-dialog__sub" data-auth-sub hidden={step === "done"}>
          {subText}
        </p>
        <p className="auth-dialog__error" data-auth-error hidden={!errorText}>
          {errorText}
        </p>
        <p className="auth-dialog__done" data-auth-done hidden={step !== "done"}>
          {confirmedEmail ? `Confirmed as ${confirmedEmail}` : ""}
        </p>

        <form
          className="auth-dialog__form"
          data-auth-email
          hidden={step !== "email"}
          onSubmit={(e) => void handleSendEmail(e)}
        >
          <label className="auth-dialog__field">
            Email address
            <input
              ref={emailInputRef}
              type="email"
              name="email"
              autoComplete="email"
              required
              maxLength={254}
              data-auth-email-input
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="auth-dialog__submit"
            data-auth-send
            disabled={sendingEmail}
          >
            Send code
          </button>
        </form>

        <form
          className="auth-dialog__form"
          data-auth-code
          hidden={step !== "code"}
          onSubmit={(e) => void handleConfirmCode(e)}
        >
          <label className="auth-dialog__field">
            Code from your email
            <input
              ref={codeInputRef}
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              required
              data-auth-code-input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="auth-dialog__submit"
            data-auth-confirm
            disabled={confirmingCode}
          >
            Confirm
          </button>
          <button
            type="button"
            className="auth-dialog__back"
            data-auth-back
            onClick={handleBackToEmail}
          >
            Use a different email
          </button>
        </form>

        <Link
          ref={accountLinkRef}
          className="auth-dialog__account"
          to="/account/"
          data-auth-account
          hidden={step !== "done"}
          onClick={closeAuthModal}
        >
          Open your account
        </Link>
      </div>
    </dialog>
  );
}
