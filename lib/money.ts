// Money is carried through the app as a decimal string (e.g. "1234.56")
// to avoid JS number precision bugs. Only convert to a BigInt of paise
// when we need to sum.

export function toPaise(amount: string): bigint {
  const [intPart, fracPartRaw = ""] = amount.split(".");
  const fracPart = (fracPartRaw + "00").slice(0, 2);
  const sign = intPart.startsWith("-") ? -1n : 1n;
  const intDigits = intPart.replace(/^[-+]/, "");
  return sign * (BigInt(intDigits) * 100n + BigInt(fracPart));
}

export function fromPaise(paise: bigint): string {
  const neg = paise < 0n;
  const abs = neg ? -paise : paise;
  const intPart = abs / 100n;
  const fracPart = abs % 100n;
  const frac = fracPart.toString().padStart(2, "0");
  return `${neg ? "-" : ""}${intPart.toString()}.${frac}`;
}

export function sumAmounts(amounts: string[]): string {
  let total = 0n;
  for (const a of amounts) total += toPaise(a);
  return fromPaise(total);
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(amount: string): string {
  // Intl.NumberFormat accepts number; safe because we display with 2 decimals
  // and INR amounts in this tool are well within Number.MAX_SAFE_INTEGER when
  // kept in rupees. Sums are computed with BigInt in paise, then formatted.
  return inrFormatter.format(Number(amount));
}
