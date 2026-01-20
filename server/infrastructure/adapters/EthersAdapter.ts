import { Pool } from "../../domain/entities";
import { IChainAdapter } from "./MockAdapter";
import { ethers } from "ethers";

// MakerDAO Multicall3 ABI
const MULTICALL_ABI = [
  "function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[] returnData)"
];

// Uniswap V3 Pool ABI snippet
const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)"
];

export class EthersAdapter implements IChainAdapter {
  private chainName: string;
  private provider: ethers.JsonRpcProvider;
  private stableTokenAddress: string;
  private etherscanApiKey: string;
  private multicallAddress: string;

  constructor(
    chainName: string,
    rpcUrl: string,
    stableTokenAddress: string,
    etherscanApiKey: string,
    multicallAddress: string // allow different multicall per network
  ) {
    console.log(`Initializing ${chainName} adapter with RPC: ${rpcUrl.substring(0, 20)}...`);
    this.chainName = chainName;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.stableTokenAddress = stableTokenAddress;
    this.etherscanApiKey = etherscanApiKey;
    this.multicallAddress = multicallAddress;

    this.provider.getNetwork()
      .then(network => console.log(`Connected to network: ${network.name} (${network.chainId})`))
      .catch(err => console.error(`Failed to connect to RPC for ${chainName}:`, err));
  }

  getChainName(): string { return this.chainName; }
  getStableTokenAddress(): string { return this.stableTokenAddress; }

  /**
   * Dynamic pool discovery placeholder
   * In practice, pull from Etherscan API / subgraph / other verified sources
   */
  async discoverPools(): Promise<string[]> {
    // Example: fetch dynamically based on stable token or top liquidity pools
    return [
      "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
      "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8"
      // more dynamically discovered pools here
    ];
  }

  /**
   * Get top pools dynamically
   */
  async getTopPools(): Promise<Pool[]> {
    const knownPools = await this.discoverPools();
    return this.fetchPoolsWithMulticall(knownPools);
  }

  /**
   * Fetch pool data using chunked tryAggregate multicalls
   */
  private async fetchPoolsWithMulticall(poolAddresses: string[]): Promise<Pool[]> {
    const chunkSize = 50; // batch chunking
    const poolInterface = new ethers.Interface([
      "function token0() view returns (address)",
      "function token1() view returns (address)",
      "function fee() view returns (uint24)"
    ]);
    const multicall = new ethers.Contract(this.multicallAddress, MULTICALL_ABI, this.provider);

    const pools: Pool[] = [];

    for (let i = 0; i < poolAddresses.length; i += chunkSize) {
      const chunk = poolAddresses.slice(i, i + chunkSize);
      const calls = chunk.flatMap(address => [
        { target: address, callData: poolInterface.encodeFunctionData("token0") },
        { target: address, callData: poolInterface.encodeFunctionData("token1") },
        { target: address, callData: poolInterface.encodeFunctionData("fee") }
      ]);

      try {
        const results: { success: boolean; returnData: string }[] = await multicall.tryAggregate(false, calls);

        for (let j = 0; j < chunk.length; j++) {
          const res0 = results[j * 3];
          const res1 = results[j * 3 + 1];
          const res2 = results[j * 3 + 2];

          if (!res0.success || !res1.success || !res2.success) continue;

          const t0 = poolInterface.decodeFunctionResult("token0", res0.returnData)[0];
          const t1 = poolInterface.decodeFunctionResult("token1", res1.returnData)[0];
          const fee = poolInterface.decodeFunctionResult("fee", res2.returnData)[0];

          pools.push({
            address: chunk[j],
            token0: { symbol: "...", name: "...", address: t0, decimals: 18 },
            token1: { symbol: "...", name: "...", address: t1, decimals: 18 },
            reserve0: BigInt(0),
            reserve1: BigInt(0),
            feeTier: Number(fee)
          });
        }
      } catch (error) {
        console.error(`[${this.chainName}] Multicall chunk failed:`, error);
        continue;
      }
    }

    console.log(`[BOOTSTRAP] Loaded ${pools.length} pools for price discovery on ${this.chainName}`);
    return pools;
  }

  async getBatchPoolData(poolAddresses: string[]): Promise<any[]> {
    if (poolAddresses.length === 0) return [];

    const chunkSize = 50; // batch chunking
    const poolInterface = new ethers.Interface(POOL_ABI);
    const multicall = new ethers.Contract(this.multicallAddress, MULTICALL_ABI, this.provider);

    const validAddresses = poolAddresses.filter(addr => ethers.isAddress(addr));
    if (validAddresses.length === 0) return [];

    const results: any[] = [];

    for (let i = 0; i < validAddresses.length; i += chunkSize) {
      const chunk = validAddresses.slice(i, i + chunkSize);
      const calls = chunk.flatMap(address => [
        { target: address, callData: poolInterface.encodeFunctionData("slot0") },
        { target: address, callData: poolInterface.encodeFunctionData("liquidity") }
      ]);

      try {
        const multicallResults: { success: boolean; returnData: string }[] = await multicall.tryAggregate(false, calls);

        for (let j = 0; j < chunk.length; j++) {
          const s0 = multicallResults[j * 2];
          const liq = multicallResults[j * 2 + 1];
          if (!s0.success || !liq.success) continue;

          const slot0Data = poolInterface.decodeFunctionResult("slot0", s0.returnData);
          const liquidityData = poolInterface.decodeFunctionResult("liquidity", liq.returnData);

          results.push({
            address: chunk[j],
            sqrtPriceX96: BigInt(slot0Data.sqrtPriceX96.toString()),
            liquidity: BigInt(liquidityData[0].toString())
          });
        }
      } catch (error) {
        console.error(`[${this.chainName}] Multicall batch failed:`, error);
        continue;
      }
    }

    return results;
  }
}