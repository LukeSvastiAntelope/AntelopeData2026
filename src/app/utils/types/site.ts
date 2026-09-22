/**
 * Candidate website builder — site model types (Sites S1).
 * Fixed templates + named editable slots; content is JSON, not a drag-drop tree.
 */

/** Stable template identifiers — React components register under these ids. */
export type SiteTemplateId =
  | 'classic_civic'
  | 'modern_clean'
  | 'community_local';

export type SiteStatus = 'draft' | 'published';

/** Tier-gated page keys. Base add-on = home only. */
export type SitePageKey =
  | 'home'
  | 'issues'
  | 'events'
  | 'volunteer'
  | 'donate';

export type SiteTheme = {
  /** Override --primary for the public site (oklch / hex / css color). */
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  fontFamily?: string;
  /** Template-specific density / radius hints */
  radius?: string;
};

export type SiteIssueItem = {
  title: string;
  summary: string;
  icon?: string;
};

export type SiteEndorsementItem = {
  name: string;
  role?: string;
  quote?: string;
  logoUrl?: string | null;
};

export type SiteContent = {
  meta: {
    candidateName: string;
    office: string;
    electionDate?: string;
    partyLabel?: string | null;
  };
  branding: {
    logoUrl?: string | null;
    heroImageUrl?: string | null;
  };
  slots: {
    hero: {
      headline: string;
      subheadline?: string;
      ctaLabel?: string;
      ctaHref?: string;
      photoUrl?: string | null;
    };
    about: {
      body: string;
      photoUrl?: string | null;
    };
    issues: {
      items: SiteIssueItem[];
    };
    endorsements: {
      items: SiteEndorsementItem[];
    };
    cta: {
      headline: string;
      body?: string;
      primaryLabel: string;
      primaryHref: string;
      secondaryLabel?: string;
      secondaryHref?: string;
    };
    footer: {
      email?: string;
      phone?: string;
      address?: string;
      socials?: {
        facebook?: string;
        x?: string;
        instagram?: string;
        youtube?: string;
      };
      paidForBy?: string;
    };
  };
};

export type SiteRecord = {
  id: number;
  organizationId: number;
  slug: string;
  templateId: SiteTemplateId;
  theme: SiteTheme;
  content: SiteContent;
  enabledPages: SitePageKey[];
  status: SiteStatus;
  publishedAt: string | null;
  createdBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CreateSiteInput = {
  organizationId: number;
  templateId: SiteTemplateId;
  /** Optional; otherwise derived from candidate name / office + UUID (survey slug pattern). */
  slug?: string;
  theme?: SiteTheme;
  content?: Partial<SiteContent> | SiteContent;
  enabledPages?: SitePageKey[];
  status?: SiteStatus;
  createdBy?: number | null;
};

export type UpdateSiteInput = {
  templateId?: SiteTemplateId;
  slug?: string;
  theme?: SiteTheme;
  content?: SiteContent;
  enabledPages?: SitePageKey[];
  status?: SiteStatus;
  /** When true and title-like fields change, regenerate slug (caller supplies newSlugBase). */
  regenerateSlugFrom?: string;
};

/** Sensible empty-slot defaults so templates always render. */
export function defaultSiteContent(
  overrides?: Partial<SiteContent>
): SiteContent {
  const base: SiteContent = {
    meta: {
      candidateName: 'Your Name',
      office: 'Office Sought',
      electionDate: undefined,
      partyLabel: null,
    },
    branding: {
      logoUrl: null,
      heroImageUrl: null,
    },
    slots: {
      hero: {
        headline: 'Working for our community',
        subheadline:
          'A campaign built on listening, results, and neighbors looking out for each other.',
        ctaLabel: 'Join the campaign',
        ctaHref: '#signup',
        photoUrl: null,
      },
      about: {
        body: 'Tell voters who you are, why you are running, and what you will fight for. Strong campaigns lead with local roots and a clear plan.',
        photoUrl: null,
      },
      issues: {
        items: [
          {
            title: 'Public safety',
            summary: 'Support for first responders and practical prevention.',
          },
          {
            title: 'Jobs & small business',
            summary: 'Keep Main Street open and hiring.',
          },
          {
            title: 'Schools',
            summary: 'Give every kid a fair shot — and listen to parents.',
          },
        ],
      },
      endorsements: {
        items: [
          {
            name: 'Community leader',
            role: 'Local organization',
            quote: 'A steady voice for our district.',
          },
        ],
      },
      cta: {
        headline: 'Be part of this campaign',
        body: 'Sign up for updates, volunteer, or chip in.',
        primaryLabel: 'Sign up',
        primaryHref: '#signup',
        secondaryLabel: 'Volunteer',
        secondaryHref: '#volunteer',
      },
      footer: {
        email: undefined,
        phone: undefined,
        address: undefined,
        socials: {},
        paidForBy: 'Paid for by Friends of the Candidate',
      },
    },
  };

  if (!overrides) return base;
  return {
    meta: { ...base.meta, ...overrides.meta },
    branding: { ...base.branding, ...overrides.branding },
    slots: {
      hero: { ...base.slots.hero, ...overrides.slots?.hero },
      about: { ...base.slots.about, ...overrides.slots?.about },
      issues: {
        items: overrides.slots?.issues?.items ?? base.slots.issues.items,
      },
      endorsements: {
        items:
          overrides.slots?.endorsements?.items ??
          base.slots.endorsements.items,
      },
      cta: { ...base.slots.cta, ...overrides.slots?.cta },
      footer: {
        ...base.slots.footer,
        ...overrides.slots?.footer,
        socials: {
          ...base.slots.footer.socials,
          ...overrides.slots?.footer?.socials,
        },
      },
    },
  };
}

export function defaultSiteTheme(
  templateId: SiteTemplateId,
  overrides?: SiteTheme
): SiteTheme {
  const presets: Record<SiteTemplateId, SiteTheme> = {
    classic_civic: {
      primaryColor: 'oklch(0.35 0.08 255)',
      accentColor: 'oklch(0.55 0.18 25)',
      backgroundColor: 'oklch(0.99 0.005 95)',
      foregroundColor: 'oklch(0.2 0.02 255)',
      fontFamily: 'var(--font-inter), Georgia, serif',
      radius: '0.375rem',
    },
    modern_clean: {
      primaryColor: 'oklch(0.25 0.02 250)',
      accentColor: 'oklch(0.55 0.14 230)',
      backgroundColor: 'oklch(1 0 0)',
      foregroundColor: 'oklch(0.145 0 0)',
      fontFamily: 'var(--font-inter), system-ui, sans-serif',
      radius: '0.75rem',
    },
    community_local: {
      primaryColor: 'oklch(0.4 0.1 145)',
      accentColor: 'oklch(0.7 0.14 85)',
      backgroundColor: 'oklch(0.98 0.01 95)',
      foregroundColor: 'oklch(0.22 0.03 145)',
      fontFamily: 'var(--font-inter), system-ui, sans-serif',
      radius: '0.5rem',
    },
  };
  return { ...presets[templateId], ...overrides };
}

export const SITE_TEMPLATE_META: Record<
  SiteTemplateId,
  { id: SiteTemplateId; name: string; description: string }
> = {
  classic_civic: {
    id: 'classic_civic',
    name: 'Classic Civic',
    description: 'Traditional campaign look — navy accents, clear hierarchy.',
  },
  modern_clean: {
    id: 'modern_clean',
    name: 'Modern Clean',
    description: 'Photo-forward and minimal — built for phone-first sharing.',
  },
  community_local: {
    id: 'community_local',
    name: 'Community Local',
    description: 'Neighborly district feel — warm, approachable, local roots.',
  },
};
