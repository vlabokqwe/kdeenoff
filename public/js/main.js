/**
 * KDeenOff Main Client Script
 * Handles copy-to-clipboard, hero slot reels animations, and navigation.
 */

// 1. Copy-to-clipboard functionality
export function initCopyButtons() {
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const code = btn.getAttribute("data-copy");
      if (!code) return;

      try {
        await navigator.clipboard.writeText(code);
        const originalText = btn.innerHTML;
        const statusSpan = btn.querySelector("[data-copy-status]");

        btn.classList.add("is-copied");
        if (statusSpan) {
          statusSpan.textContent = "СКОПИРОВАНО! ✓";
        }

        setTimeout(() => {
          btn.classList.remove("is-copied");
          if (statusSpan) {
            statusSpan.textContent = "КОПИРОВАТЬ";
          }
        }, 2200);
      } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement("textarea");
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);

        btn.classList.add("is-copied");
        setTimeout(() => btn.classList.remove("is-copied"), 2200);
      }
    });
  });
}

// 2. Mini slot machine reel micro-animation in Hero
export function initHeroSlotAnimation() {
  const reels = document.querySelectorAll(".mini-slot__reel");
  if (!reels.length) return;

  // Initial spin jitter on page load
  reels.forEach((reel, i) => {
    reel.style.transform = `translateY(${-(i * 20)}px)`;
    setTimeout(() => {
      reel.style.transition = "transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)";
      reel.style.transform = "translateY(0)";
    }, 150 * (i + 1));
  });

  // Hover micro-interaction: spin slightly
  const slotScreen = document.querySelector(".mini-slot-machine");
  if (slotScreen) {
    slotScreen.addEventListener("mouseenter", () => {
      reels.forEach((reel, idx) => {
        reel.style.transition = "transform 0.3s ease";
        reel.style.transform = `translateY(${idx % 2 === 0 ? -12 : 12}px)`;
      });
    });
    slotScreen.addEventListener("mouseleave", () => {
      reels.forEach((reel) => {
        reel.style.transition = "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)";
        reel.style.transform = "translateY(0)";
      });
    });
  }
}

// 3. Highlight current page in navigation
export function highlightNav() {
  const path = location.pathname;
  document.querySelectorAll("[data-nav-link]").forEach((link) => {
    const target = link.getAttribute("data-nav-link");
    if (target === "home" && (path === "/" || path === "")) {
      link.classList.add("is-active");
    } else if (target === "leaderboard" && path.startsWith("/leaderboards")) {
      link.classList.add("is-active");
    } else {
      link.classList.remove("is-active");
    }
  });
}

// Boot scripts
document.addEventListener("DOMContentLoaded", () => {
  initCopyButtons();
  initHeroSlotAnimation();
  highlightNav();
});
