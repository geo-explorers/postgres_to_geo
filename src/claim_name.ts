// ─── claim_name ──────────────────────────────────────────────────────────────
// The claim as it is named on Geo: trimmed, without a sentence-ending period.
//
// The extraction prompt teaches the model full sentences — every example it
// sees ends in a period — so claim_text arrives as prose: 222,405 of 224,267
// crypto.claims rows (99.2%, measured 2026-09-18) end in one, and the export
// minted every Claim name verbatim, period included. A Claim entity's name is
// a statement, not a sentence; the period is removed deterministically here,
// at the boundary where rows become Geo names.
//
// Only a bare sentence-ending period goes. A period that belongs to the text
// stays: an abbreviation ("acquired Halcyon Inc."), a dotted initialism ("in
// the U.S.", "a Ph.D."), or an ellipsis. Ported verbatim from news-worker's
// lib/claim-text.ts (the same rules extraction-api's sanitize_claims applies
// to debate claims — fix/claim-name-period), so every lane that names claims
// on Geo means the same thing by it.

/** Abbreviations whose period is part of the word. Case-sensitive on purpose:
 *  "No." is an abbreviation, "voted no." is a sentence. */
const ABBREVIATIONS = new Set([
  "Inc", "Ltd", "Corp", "Co", "PLC", "Est",
  "Jr", "Sr", "Mr", "Mrs", "Ms", "Dr", "Prof",
  "Gov", "Sen", "Rep", "Gen", "Adm", "Lt", "Col", "Capt", "Sgt",
  "St", "Mt", "Ft", "Ave", "Blvd", "Rd", "No",
  "Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sep", "Sept", "Oct", "Nov", "Dec",
  "vs", "etc", "approx",
]);

export function claimName(raw: string | null | undefined): string {
  const text = String(raw ?? "").trim();
  if (!text.endsWith(".")) return text;
  // An ellipsis is not a sentence-ending period.
  if (/(?:\.{2,}|…)$/.test(text)) return text;
  // The word carrying the period, without any bracket or quote it opens with.
  // A period with nothing attached ("rose 4% .") is just a stray period.
  const word = /(\S+)\.$/.exec(text)?.[1]?.replace(/^[("'“‘\[]+/, "");
  if (word) {
    if (ABBREVIATIONS.has(word)) return text;
    // Dotted initialisms: U.S, D.C, a.m, Ph.D — the final period completes them.
    if (/^(?:[A-Za-z]{1,2}\.)+[A-Za-z]{1,2}$/.test(word)) return text;
  }
  return text.slice(0, -1).trimEnd();
}
