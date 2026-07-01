export function mobileProof(label: string, payload?: unknown) {
  try {
    console.log(`[NXQ_PROOF] ${label}`, JSON.stringify(payload, null, 2));
  } catch {
    console.log(`[NXQ_PROOF] ${label}`, payload);
  }
}