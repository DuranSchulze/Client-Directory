export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build" || process.env.NODE_ENV === "test" || process.env.VITEST || process.env.VERCEL || process.env.AUTO_DISTRIBUTE !== "1") return;
  const { distributeMatches } = await import("./services/distribute.service");
  const configured = Number(process.env.DISTRIBUTE_EVERY_MINUTES ?? 15);
  const delay = Math.max(5, configured) * 60_000;
  const interval = Number.isFinite(configured) && delay <= 2_147_483_647 ? delay : 15 * 60_000;
  setInterval(() => {
    void distributeMatches().catch(() => console.error("Automatic contact distribution failed"));
  }, interval).unref();
}
