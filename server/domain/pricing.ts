import { Pool, Token } from "./entities";

// === Domain Layer: Pure Functions ===

/**
 * Computes the spot price of a token in terms of the stable token (USDC/USDT).
 * Formula: Price = (ReserveStable / ReserveToken) * (10^(DecimalsToken - DecimalsStable))
 * 
 * @param pool The liquidity pool containing the token and a stablecoin
 * @param tokenAddress The address of the token we want to price
 * @param stableTokenAddress The address of the stablecoin (USDC/USDT)
 * @returns Price in USD
 */
export function computeSpotPrice(
  pool: Pool, 
  tokenAddress: string, 
  stableTokenAddress: string
): number {
  const isToken0 = pool.token0.address.toLowerCase() === tokenAddress.toLowerCase();
  
  const tokenReserve = isToken0 ? pool.reserve0 : pool.reserve1;
  const stableReserve = isToken0 ? pool.reserve1 : pool.reserve0;
  
  const token = isToken0 ? pool.token0 : pool.token1;
  const stable = isToken0 ? pool.token1 : pool.token0;

  if (tokenReserve === BigInt(0)) return 0;

  // Convert BigInts to numbers for division (prototype accuracy)
  // In production, use a BigNumber library for precision.
  const rToken = Number(tokenReserve) / Math.pow(10, token.decimals);
  const rStable = Number(stableReserve) / Math.pow(10, stable.decimals);

  return rStable / rToken;
}

export function computeLiquidityUSD(pool: Pool, priceToken0: number, priceToken1: number): number {
  const r0 = Number(pool.reserve0) / Math.pow(10, pool.token0.decimals);
  const r1 = Number(pool.reserve1) / Math.pow(10, pool.token1.decimals);
  
  return (r0 * priceToken0) + (r1 * priceToken1);
}
