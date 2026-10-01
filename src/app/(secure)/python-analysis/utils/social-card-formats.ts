/** Social card format presets — pixel sizes for LinkedIn / Instagram / Stories. */

export type SocialCardFormatId =
  | 'linkedin_square'
  | 'linkedin_landscape'
  | 'instagram_portrait'
  | 'story_reel';

export type SocialCardFormat = {
  id: SocialCardFormatId;
  label: string;
  width: number;
  height: number;
  /** Matplotlib figsize in inches at ~100 dpi equivalent for re-render */
  figsize: [number, number];
};

export const SOCIAL_CARD_FORMATS: SocialCardFormat[] = [
  {
    id: 'linkedin_square',
    label: 'LinkedIn square',
    width: 1200,
    height: 1200,
    figsize: [8, 6],
  },
  {
    id: 'linkedin_landscape',
    label: 'LinkedIn landscape',
    width: 1200,
    height: 627,
    figsize: [10, 4.5],
  },
  {
    id: 'instagram_portrait',
    label: 'Instagram portrait',
    width: 1080,
    height: 1350,
    figsize: [7, 7],
  },
  {
    id: 'story_reel',
    label: 'Story / Reel cover',
    width: 1080,
    height: 1920,
    figsize: [6, 8],
  },
];

export function getSocialCardFormat(id: SocialCardFormatId): SocialCardFormat {
  return (
    SOCIAL_CARD_FORMATS.find((f) => f.id === id) || SOCIAL_CARD_FORMATS[0]
  );
}
