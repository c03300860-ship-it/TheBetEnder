import { z } from "zod";

// === Domain Types / DTOs ===

export const tokenSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  address: z.string(),
  decimals: z.number(),
  logoURI: z.string().optional(),
});

export const tokenEntrySchema = z.object({
  token: tokenSchema,
  priceUSD: z.number(),
  liquidityUSD: z.number(),
  volumeUSD: z.number(),
  marketCapUSD: z.number(),
});

export const snapshotSchema = z.object({
  timestamp: z.number(),
  chain: z.string(), // "polygon" | "ethereum"
  entries: z.array(tokenEntrySchema),
});

// Export types
export type Token = z.infer<typeof tokenSchema>;
export type TokenEntry = z.infer<typeof tokenEntrySchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;

// === API Request/Response Types ===
// Used by frontend to strict type responses
export type SnapshotResponse = Snapshot;
