import { Token, Pool } from "../../domain/entities";
import { SUPPORTED_TOKENS } from "../../../shared/tokens";

export interface IChainAdapter {
  getChainName(): string;
  getTopPools(limit: number): Promise<Pool[]>;
  getStableTokenAddress(): string;
}

export class MockAdapter implements IChainAdapter {
  private chainName: string;
  private stableToken: Token;
  private tokens: Token[];

  constructor(chainName: string) {
    this.chainName = chainName.toLowerCase();
    
    const metadata = SUPPORTED_TOKENS[this.chainName] || [];
    
    // Find USDC or first token as stable for mock purposes
    const stableMeta = metadata.find(t => t.symbol === "USDC") || metadata[0];
    
    this.stableToken = {
      symbol: stableMeta.symbol,
      name: stableMeta.name,
      address: stableMeta.address,
      decimals: stableMeta.decimals
    };

    this.tokens = metadata.filter(t => t.address !== this.stableToken.address).map(t => ({
      symbol: t.symbol,
      name: t.name,
      address: t.address,
      decimals: t.decimals
    }));
  }

  getChainName(): string {
    return this.chainName;
  }

  getStableTokenAddress(): string {
    return this.stableToken.address;
  }

  async getTopPools(limit: number): Promise<Pool[]> {
    // Return mock pools with random variations to simulate live data
    return this.tokens.map(token => {
      // Simulate random reserves
      const basePrice = this.getBasePrice(token.symbol);
      const variation = 1 + (Math.random() * 0.02 - 0.01); // +/- 1%
      const price = basePrice * variation;

      // Create a pool with the stable token
      // 1 Token = price USDC
      // ReserveRatio = price
      
      const stableReserveVal = 1_000_000 * price; // $1M liquidity
      const tokenReserveVal = 1_000_000;

      return {
        address: `0xPool_${token.symbol}_${this.chainName}`,
        token0: token,
        token1: this.stableToken,
        reserve0: BigInt(Math.floor(tokenReserveVal * Math.pow(10, token.decimals))),
        reserve1: BigInt(Math.floor(stableReserveVal * Math.pow(10, this.stableToken.decimals))),
        feeTier: 3000 // 0.3%
      };
    });
  }

  private getBasePrice(symbol: string): number {
    switch (symbol) {
      case "WETH": return 3500;
      case "WBTC": return 65000;
      case "UNI": return 10;
      case "AAVE": return 120;
      case "LINK": return 18;
      default: return 1;
    }
  }
}
