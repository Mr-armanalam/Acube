// Deterministic gradient for thumbnail / playlist-card fallbacks when a
// video has no real thumbnail. The gradient is picked from the id hash,
// so the same video always gets the same colours — it is a placeholder,
// never a claim about the video's content.
const GRADIENTS: Array<[string, string]> = [
  ["#2f7d5b", "#1d4d3a"],
  ["#1f7a6d", "#144e5a"],
  ["#a13d4e", "#6d2432"],
  ["#3d6fb4", "#274b7d"],
  ["#c98a1b", "#8a5c10"],
  ["#6d4fc2", "#453285"],
];

export function gradientFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  const [from, to] = GRADIENTS[h % GRADIENTS.length];
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}
