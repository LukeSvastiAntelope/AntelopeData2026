/**
 * Party logo SVG components for Republican (elephant) and Democrat (donkey).
 * Designed to work at small sizes (16–32px) with party-appropriate colors.
 */

interface PartyIconProps {
  className?: string
  size?: number
}

/** Republican elephant – simplified silhouette */
export function RepublicanIcon({ className, size = 20 }: PartyIconProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      aria-label="Republican"
    >
      {/* Three stars */}
      <polygon points="20,4 22,10 28,10 23,14 25,20 20,16 15,20 17,14 12,10 18,10" />
      <polygon points="38,2 40,8 46,8 41,12 43,18 38,14 33,18 35,12 30,8 36,8" />
      <polygon points="52,6 54,12 60,12 55,16 57,22 52,18 47,22 49,16 44,12 50,12" />
      {/* Elephant body */}
      <path d="M10,56 C10,44 14,34 22,28 C28,24 36,24 42,28 C50,34 54,38 56,34 C58,30 60,28 62,30 L62,42 C60,40 58,42 56,46 C54,50 50,54 46,56 L46,62 L40,62 L40,56 L36,56 L36,62 L30,62 L30,56 L26,56 L26,62 L20,62 L20,56 L16,56 L16,62 L10,62 Z" />
      {/* Eye */}
      <circle cx="52" cy="33" r="1.5" fill="white" />
    </svg>
  )
}

/** Democrat donkey – simplified silhouette */
export function DemocratIcon({ className, size = 20 }: PartyIconProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      aria-label="Democrat"
    >
      {/* Three stars */}
      <polygon points="32,2 34,8 40,8 35,12 37,18 32,14 27,18 29,12 24,8 30,8" />
      <polygon points="16,6 18,12 24,12 19,16 21,22 16,18 11,22 13,16 8,12 14,12" />
      <polygon points="48,6 50,12 56,12 51,16 53,22 48,18 43,22 45,16 40,12 46,12" />
      {/* Donkey body */}
      <path d="M14,56 C14,46 16,38 22,32 C26,28 30,26 34,26 C38,26 42,28 44,32 C46,28 48,24 46,18 L52,22 C54,26 52,30 50,34 C52,36 54,40 54,46 L54,56 L48,56 L48,48 L46,56 L40,56 L40,48 L36,56 L30,56 L30,48 L26,56 L20,56 L20,48 L14,56 Z" />
      {/* Ear */}
      <path d="M46,18 C44,12 42,8 38,6 L44,4 C48,8 48,14 46,18 Z" />
      {/* Tail */}
      <path d="M14,44 C8,38 4,34 2,30 C4,30 6,32 10,38 C12,40 14,44 14,44 Z" />
      {/* Eye */}
      <circle cx="46" cy="28" r="1.5" fill="white" />
    </svg>
  )
}

/** Returns the appropriate party icon component for a given party code */
export function PartyIcon({ party, className, size = 20 }: PartyIconProps & { party: string | null | undefined }) {
  if (party === 'R') return <RepublicanIcon className={className} size={size} />
  if (party === 'D') return <DemocratIcon className={className} size={size} />
  return null
}

/** Party color utilities */
export function partyColor(party: string | null | undefined): string {
  if (party === 'R') return 'text-red-500'
  if (party === 'D') return 'text-blue-500'
  if (party === 'I') return 'text-purple-500'
  if (party === 'L') return 'text-yellow-500'
  if (party === 'G') return 'text-green-500'
  return 'text-muted-foreground'
}

export function partyBgColor(party: string | null | undefined): string {
  if (party === 'R') return 'bg-red-500'
  if (party === 'D') return 'bg-blue-500'
  if (party === 'I') return 'bg-purple-500'
  if (party === 'L') return 'bg-yellow-500'
  if (party === 'G') return 'bg-green-500'
  return 'bg-muted'
}
