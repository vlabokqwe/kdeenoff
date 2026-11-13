/**
 * Site-wide settings (was src/_data/site.json in the Eleventy build).
 * Shared by the public app and the admin panel.
 */

export interface PartnerBonus {
  type: string;
  value: string;
  label: string;
}

export interface Partner {
  id: string;
  name: string;
  theme?: string;
  logo?: string;
  code?: string;
  url: string;
  scene?: string;
  mascot?: string;
  mascotVideo?: string;
  bonuses?: PartnerBonus[];
  conditions?: string[];
  cta?: string;
}

export interface SiteSocial {
  kick: string;
  telegram: string;
  x: string;
  youtube: string;
}

export interface Site {
  title: string;
  channelName: string;
  lang: string;
  url: string;
  promoCode: string;
  referralUrl: string;
  kickUrl: string;
  kickChannel: string;
  telegramUrl: string;
  xUrl: string;
  tagline: string;
  partners: Partner[];
  social: SiteSocial;
}

export const site: Site = {
  title: "KDeenOff",
  channelName: "KDeenOff",
  lang: "en",
  url: "https://kdeenoff.bet",
  promoCode: "KDEENOFF",
  referralUrl: "https://stake.com/?c=KDEENOFF",
  kickUrl: "https://kick.com/kdeenoff",
  kickChannel: "kdeenoff",
  telegramUrl: "https://t.me/kdeenoff",
  xUrl: "https://x.com/kdeenoff",
  tagline: "Play with code KDEENOFF — join stream raffles, climb the leaderboard and claim exclusive bonuses.",
  partners: [
    {
      id: "500",
      name: "500 Casino",
      theme: "stake",
      logo: "/img/partners/500-wordmark.webp",
      code: "KDEENOFF",
      url: "https://stake.com/?c=KDEENOFF",
      scene: "/img/partners/stake-slot-bg.webp",
      mascot: "/img/partners/stake-raccoon.webp",
      mascotVideo: "/img/partners/stake-raccoon.webm",
      bonuses: [
        { type: "rakeback", value: "10%", label: "Lifetime rakeback" },
        { type: "leaderboard", value: "$10K", label: "Monthly leaderboard" },
      ],
      conditions: [
        "New account registered through our link",
        "Promo code KDEENOFF entered at sign-up",
        "First deposit of $20+ within 7 days",
      ],
      cta: "Claim on 500 Casino",
    },
  ],
  social: {
    kick: "https://kick.com/kdeenoff",
    telegram: "https://t.me/kdeenoff",
    x: "https://x.com/kdeenoff",
    youtube: "",
  },
};

/** A partner's referral code, falling back to the site promo code. */
export function partnerCode(partner: Partner): string {
  return partner.code || site.promoCode;
}
