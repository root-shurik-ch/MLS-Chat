/** Deterministic per-user hue — same color every session */
export function senderColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return `hsl(${h % 360}, 55%, 68%)`;
}
