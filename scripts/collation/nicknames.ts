/**
 * Common English nickname / diminutive map for first-name fuzzy matching (FM2).
 * Conservative: only well-known pairs; symmetric lookup via canonical groups.
 */

const NICKNAME_GROUPS: string[][] = [
  ['ROBERT', 'BOB', 'BOBBY', 'ROB', 'ROBBIE'],
  ['WILLIAM', 'WILL', 'BILL', 'BILLY', 'LIAM'],
  ['RICHARD', 'RICK', 'DICK', 'RICH', 'RICHY'],
  ['JAMES', 'JIM', 'JIMMY', 'JAMIE'],
  ['JOHN', 'JACK', 'JOHNNY', 'JON'],
  ['MICHAEL', 'MIKE', 'MICKEY', 'MICK'],
  ['JOSEPH', 'JOE', 'JOEY'],
  ['THOMAS', 'TOM', 'TOMMY'],
  ['CHARLES', 'CHARLIE', 'CHUCK', 'CHAS'],
  ['EDWARD', 'ED', 'EDDIE', 'TED', 'TEDDY'],
  ['ELIZABETH', 'LIZ', 'BETH', 'BETTY', 'ELIZA', 'LISA'],
  ['MARGARET', 'MAGGIE', 'PEG', 'PEGGY', 'MEG'],
  ['KATHERINE', 'KATE', 'KATY', 'KATIE', 'CATHY', 'CATHERINE', 'KATHY'],
  ['JENNIFER', 'JEN', 'JENNY'],
  ['PATRICIA', 'PAT', 'PATTY', 'TRICIA'],
  ['SUSAN', 'SUE', 'SUSIE', 'SUZY'],
  ['DEBORAH', 'DEB', 'DEBBIE'],
  ['BARBARA', 'BARB', 'BARBIE'],
  ['DOROTHY', 'DOT', 'DOTTIE'],
  ['ALEXANDER', 'ALEX', 'XANDER'],
  ['ALEXANDRA', 'ALEX', 'LEXI', 'SANDRA'],
  ['ANTHONY', 'TONY'],
  ['BENJAMIN', 'BEN', 'BENNY'],
  ['CHRISTOPHER', 'CHRIS', 'KIT'],
  ['DANIEL', 'DAN', 'DANNY'],
  ['DAVID', 'DAVE', 'DAVEY'],
  ['GEORGE', 'GEORGIE'],
  ['GREGORY', 'GREG'],
  ['HENRY', 'HANK', 'HARRY'],
  ['JACOB', 'JAKE'],
  ['JONATHAN', 'JON', 'JOHNNY'],
  ['JOSHUA', 'JOSH'],
  ['LAWRENCE', 'LARRY', 'LAURENCE'],
  ['MATTHEW', 'MATT', 'MATTY'],
  ['NICHOLAS', 'NICK', 'NICKY'],
  ['PATRICK', 'PAT', 'PADDY'],
  ['PETER', 'PETE'],
  ['RAYMOND', 'RAY'],
  ['SAMUEL', 'SAM', 'SAMMY'],
  ['STEPHEN', 'STEVE', 'STEVEN'],
  ['TIMOTHY', 'TIM', 'TIMMY'],
  ['VICTORIA', 'VICKY', 'VICKI', 'TORI'],
  ['VIRGINIA', 'GINNY', 'GINGER'],
  ['ANDREW', 'ANDY', 'DREW'],
  ['ABIGAIL', 'ABBY', 'GAIL'],
  ['REBECCA', 'BECKY', 'BECCA'],
  ['SAMANTHA', 'SAM', 'SAMMY'],
  ['NATHANIEL', 'NATE', 'NAT'],
  ['THEODORE', 'TED', 'TEDDY', 'THEO'],
];

const CANONICAL = new Map<string, string>();
for (const group of NICKNAME_GROUPS) {
  const canon = group[0];
  for (const name of group) {
    CANONICAL.set(name.toUpperCase(), canon);
  }
}

/** True if two first names are the same nickname group (Bob/Robert). */
export function areNicknames(a: string, b: string): boolean {
  const A = (a || '').toUpperCase().replace(/[^A-Z]/g, '');
  const B = (b || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!A || !B) return false;
  if (A === B) return true;
  const ca = CANONICAL.get(A);
  const cb = CANONICAL.get(B);
  return Boolean(ca && cb && ca === cb);
}

/** Canonical form for grouping, or the uppercased name itself. */
export function nicknameCanonical(name: string): string {
  const A = (name || '').toUpperCase().replace(/[^A-Z]/g, '');
  return CANONICAL.get(A) || A;
}
