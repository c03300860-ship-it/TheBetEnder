/**
 * ExplorerConfig - Block Explorer API Configuration
 * 
 * RESPONSIBILITY: Manage block explorer APIs per network
 * - Different explorers for different networks
 * - Etherscan for Ethereum
 * - PolygonScan for Polygon
 * - Extensible for new explorers
 * 
 * EXPLORER SELECTION:
 * - Based on user's network selection
 * - Each chain has its own explorer API key
 * 
 * ADDING NEW EXPLORERS:
 * 1. Add explorer to EXPLORER_CONFIG
 * 2. Add API key to environment variables
 * 3. Done - system automatically uses correct explorer per network
 */

export interface ExplorerApi {
  name: string;
  baseUrl: string;
  apiKey: string;
  endpoints: {
    tokenInfo: string;
    tokenHolders: string;
    transactionHistory: string;
  };
}

class ExplorerConfig {
  private static instance: ExplorerConfig;
  
  // Explorer APIs per chain
  private explorers: Map<number, ExplorerApi> = new Map();
  
  // Track if we've initialized
  private initialized: boolean = false;

  private constructor() {
    // Don't initialize in constructor - do it lazily
  }

  public static getInstance(): ExplorerConfig {
    if (!ExplorerConfig.instance) {
      ExplorerConfig.instance = new ExplorerConfig();
    }
    // Initialize on first call to getInstance
    if (!ExplorerConfig.instance.initialized) {
      ExplorerConfig.instance.initializeExplorers();
      ExplorerConfig.instance.initialized = true;
    }
    return ExplorerConfig.instance;
  }

  /**
   * Initialize explorer configurations per chain
   * ADD NEW EXPLORERS HERE
   */
  private initializeExplorers(): void {
    const etherscanKey = process.env.ETHERSCAN_API_KEY;
    const polygonscanKey = process.env.POLYGONSCAN_API_KEY || process.env.ETHERSCAN_API_KEY;

    // Ethereum Mainnet - Etherscan
    this.explorers.set(1, {
      name: 'Etherscan',
      baseUrl: 'https://api.etherscan.io/api',
      apiKey: etherscanKey || '',
      endpoints: {
        tokenInfo: 'https://etherscan.io/token/',
        tokenHolders: 'https://etherscan.io/token/',
        transactionHistory: 'https://etherscan.io/tx/',
      },
    });

    // Polygon Mainnet - PolygonScan
    this.explorers.set(137, {
      name: 'PolygonScan',
      baseUrl: 'https://api.polygonscan.com/api',
      apiKey: polygonscanKey || '',
      endpoints: {
        tokenInfo: 'https://polygonscan.com/token/',
        tokenHolders: 'https://polygonscan.com/token/',
        transactionHistory: 'https://polygonscan.com/tx/',
      },
    });

    // Warn if explorer API keys are missing (informational)
    if (!etherscanKey) {
      console.warn('ETHERSCAN_API_KEY not set. Some explorer API features may be limited.');
    }
    if (!polygonscanKey) {
      console.warn('POLYGONSCAN_API_KEY not set. Some explorer API features may be limited.');
    }

    // ADD MORE EXPLORERS HERE
    // this.explorers.set(42161, { // Arbitrum
    //   name: 'Arbiscan',
    //   baseUrl: 'https://api.arbiscan.io/api',
    //   apiKey: process.env.ARBISCAN_API_KEY || 'demo',
    //   endpoints: { ... }
    // });

    console.log(`✓ ExplorerConfig: Initialized ${this.explorers.size} block explorers`);
  }

  /**
   * Reinitialize explorers (useful after env vars are loaded)
   */
  public reinitialize(): void {
    this.explorers.clear();
    this.initializeExplorers();
  }

  /**
   * Get explorer configuration for a network
   * @param chainId Network chain ID
   * @returns Explorer API configuration
   */
  public getExplorer(chainId: number): ExplorerApi {
    const explorer = this.explorers.get(chainId);
    if (!explorer) {
      throw new Error(`No block explorer configured for chain ${chainId}`);
    }
    return explorer;
  }

  /**
   * Get explorer name for a network
   * @param chainId Network chain ID
   * @returns Explorer name (e.g., 'Etherscan', 'PolygonScan')
   */
  public getExplorerName(chainId: number): string {
    return this.getExplorer(chainId).name;
  }

  /**
   * Get explorer API URL for a network
   * @param chainId Network chain ID
   * @returns Explorer API base URL
   */
  public getExplorerApiUrl(chainId: number): string {
    const explorer = this.getExplorer(chainId);
    // If an API key is configured, include it. Otherwise return the base URL (some APIs allow anonymous access).
    return explorer.apiKey && explorer.apiKey.length > 0
      ? `${explorer.baseUrl}?apikey=${explorer.apiKey}`
      : explorer.baseUrl;
  }

  /**
   * Get token info URL on block explorer
   * @param chainId Network chain ID
   * @param tokenAddress Token contract address
   * @returns Full URL to token on block explorer
   */
  public getTokenUrl(chainId: number, tokenAddress: string): string {
    const explorer = this.getExplorer(chainId);
    return `${explorer.endpoints.tokenInfo}${tokenAddress}`;
  }

  /**
   * Get transaction URL on block explorer
   * @param chainId Network chain ID
   * @param txHash Transaction hash
   * @returns Full URL to transaction on block explorer
   */
  public getTransactionUrl(chainId: number, txHash: string): string {
    const explorer = this.getExplorer(chainId);
    return `${explorer.endpoints.transactionHistory}${txHash}`;
  }

  /**
   * Get all supported explorers
   * @returns Array of supported chain IDs
   */
  public getSupportedChains(): number[] {
    return Array.from(this.explorers.keys());
  }

  /**
   * Check if explorer is available for a chain
   * @param chainId Network chain ID
   * @returns True if explorer is configured for this chain
   */
  public isChainSupported(chainId: number): boolean {
    return this.explorers.has(chainId);
  }

  /**
   * Get all explorers
   * @returns Map of chain IDs to explorer configurations
   */
  public getAllExplorers(): Map<number, ExplorerApi> {
    return new Map(this.explorers);
  }

  /**
   * Get configuration status
   */
  public getStatus(): {
    explorers: { chainId: number; name: string }[];
  } {
    const explorers: { chainId: number; name: string }[] = [];
    this.explorers.forEach((explorer, chainId) => {
      explorers.push({ chainId, name: explorer.name });
    });
    return { explorers };
  }
}

// Export singleton instance
export const explorerConfig = ExplorerConfig.getInstance();

// Export class for testing
export { ExplorerConfig };
