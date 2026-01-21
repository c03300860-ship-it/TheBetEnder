import { Pool } from "../../domain/entities";
import { IChainAdapter } from "./MockAdapter";
import { ethers } from "ethers";
import fetch from "node-fetch";

// MakerDAO Multicall3 address (same on most chains)
const MULTICALL_ADDRESS = "0xca11bde05977b3631167028862be2a173976ca11";
const MULTICALL_ABI = [
  "function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"
];

// Uniswap V3 Pool ABI snippet
const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)"
];

export class EthersAdapter implements IChainAdapter {
  private chainName: string;
  private provider: ethers.JsonRpcProvider;
  private stableTokenAddress: string;
  private etherscanKeys: string[];

  constructor(chainName: string, rpcUrl: string, stableTokenAddress: string, etherscanKeys: string[]) {
    console.log(`Initializing ${chainName} adapter with RPC: ${rpcUrl.substring(0, 20)}...`);
    this.chainName = chainName;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.stableTokenAddress = stableTokenAddress;
    this.etherscanKeys = etherscanKeys;

    // Test provider connection immediately
    this.provider.getNetwork().then(network => {
      console.log(`Connected to network: ${network.name} (${network.chainId})`);
    }).catch(err => {
      console.error(`Failed to connect to RPC for ${chainName}:`, err);
    });
  }

  getChainName(): string {
    return this.chainName;
  }

  getStableTokenAddress(): string {
    return this.stableTokenAddress;
  }

  // Use Etherscan V2 to fetch verified Uniswap V3 pools dynamically
  private async fetchDynamicPools(): Promise<string[]> {
    const baseUrl = `https://api.etherscan.io/api`;
    const module = "contract";
    const action = "getsourcecode";

    const pools: string[] = [];
    for (const key of this.etherscanKeys) {
      try {
        // Example: you can fetch contracts created by Uniswap factory
        const url = `${baseUrl}?module=${module}&action=${action}&apikey=${key}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.status === "1" && Array.isArray(data.result)) {
          for (const item of data.result) {
            if (item.ContractName?.toLowerCase().includes("pool")) {
              pools.push(item.ContractAddress);
            }
          }
        }
      } catch (err) {
        console.warn(`Etherscan key ${key} failed:`, err);
        continue; // try next key
      }
    }

    // Remove duplicates and invalid addresses
    const validPools = pools.filter(addr => addr && ethers.isAddress(addr));
    return Array.from(new Set(validPools));
  }

  // Main function: return top pools dynamically + optional static fallback
  async getTopPools(limit: number): Promise<Pool[]> {
    try {
      // Fetch dynamic pools
      const dynamicPools = await this.fetchDynamicPools();

      // Optional: fallback static pools
      const staticPools = [
        "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
        "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8",
        "0x11b81a04b0d8cd7460f33088e6e85ef610ee87ca"
      ];

      const allPools = Array.from(new Set([...dynamicPools, ...staticPools])).slice(0, limit);

      if (allPools.length === 0) return [];

      const poolInterface = new ethers.Interface(POOL_ABI);
      const multicall = new ethers.Contract(MULTICALL_ADDRESS, MULTICALL_ABI, this.provider);

      // Batch multicall
      const calls = allPools.flatMap((address: string) => [
        { target: address, callData: poolInterface.encodeFunctionData("token0") },
        { target: address, callData: poolInterface.encodeFunctionData("token1") },
        { target: address, callData: poolInterface.encodeFunctionData("fee") }
      ]);

      const [, returnData] = await multicall.aggregate(calls);

      const pools: Pool[] = [];
      for (let i = 0; i < allPools.length; i++) {
        try {
          const res0 = returnData[i * 3];
          const res1 = returnData[i * 3 + 1];
          const res2 = returnData[i * 3 + 2];

          const t0 = poolInterface.decodeFunctionResult("token0", res0)[0];
          const t1 = poolInterface.decodeFunctionResult("token1", res1)[0];
          const fee = poolInterface.decodeFunctionResult("fee", res2)[0];

          pools.push({
            address: allPools[i],
            token0: { symbol: "...", name: "...", address: t0, decimals: 18 },
            token1: { symbol: "...", name: "...", address: t1, decimals: 18 },
            reserve0: BigInt(0),
            reserve1: BigInt(0),
            feeTier: Number(fee)
          });
        } catch (e) {
          continue;
        }
      }

      console.log(`[BOOTSTRAP] Loaded ${pools.length} dynamic pools for ${this.chainName}`);
      return pools;
    } catch (error) {
      console.error(`Error fetching top pools for ${this.chainName}:`, error);
      return [];
    }
  }

  // Multicall pool data (slot0 + liquidity)
  async getBatchPoolData(poolAddresses: string[]): Promise<any[]> {
    if (poolAddresses.length === 0) return [];

    const multicall = new ethers.Contract(MULTICALL_ADDRESS, MULTICALL_ABI, this.provider);
    const poolInterface = new ethers.Interface(POOL_ABI);

    const validAddresses = poolAddresses.filter(addr => addr && ethers.isAddress(addr));
    if (validAddresses.length === 0) return [];

    const calls = validAddresses.flatMap(address => [
      { target: address, callData: poolInterface.encodeFunctionData("slot0") },
      { target: address, callData: poolInterface.encodeFunctionData("liquidity") }
    ]);

    try {
      const [, returnData] = await multicall.aggregate(calls);

      const results = [];
      for (let i = 0; i < validAddresses.length; i++) {
        try {
          const slot0Data = poolInterface.decodeFunctionResult("slot0", returnData[i * 2]);
          const liquidityData = poolInterface.decodeFunctionResult("liquidity", returnData[i * 2 + 1]);

          results.push({
            address: validAddresses[i],
            sqrtPriceX96: BigInt(slot0Data.sqrtPriceX96.toString()),
            liquidity: BigInt(liquidityData[0].toString())
          });
        } catch (e) {
          continue;
        }
      }
      return results;
    } catch (error) {
      console.error("Multicall aggregate failed:", error);
      return [];
    }
  }
}