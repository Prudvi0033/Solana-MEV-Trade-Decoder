
/**
 * Detects arbitrage opportunities based on simple criteria:
 * 1. Same owner across multiple transactions in one slot
 * 2. Multiple DEX usage - User interacts with different DEX platforms  
 * 3. Round-trip trading - User both buys AND sells the same specific token mint
 */

export function detectArbitrage(swapTransactions, DEX_PROGRAM_IDS) {
  console.log(`🔍 Analyzing ${swapTransactions.length} swap transactions for arbitrage...`);
  
  // Step 1: Group all swap transactions by sender (owner/initiator wallet)
  // NOTE: swapTransactions are already analyzed swap transactions, not raw transactions
  const senderGroups = new Map();
  
  swapTransactions.forEach(swapResult => {
    // These are already processed swap transactions
    if (swapResult.swapDetected && swapResult.initiatorWallet) {
      const sender = swapResult.initiatorWallet;
      
      if (!senderGroups.has(sender)) {
        senderGroups.set(sender, []);
      }
      
      senderGroups.get(sender).push(swapResult);
    }
  });

  console.log(`📊 Found ${senderGroups.size} unique senders`);
  
  // Debug: Show senders with multiple transactions
  senderGroups.forEach((txs, sender) => {
    if (txs.length > 1) {
      console.log(`   👤 ${sender.slice(0, 8)}... has ${txs.length} transactions`);
    }
  });

  const arbitrageOpportunities = [];

  // Step 2: Analyze each sender's transactions for arbitrage patterns
  senderGroups.forEach((senderTxs, sender) => {
    
    // Criteria 1: Same owner across multiple transactions
    if (senderTxs.length < 2) return; // Need at least 2 transactions

    // Step 3: Collect all platforms used by this sender
    const platformsUsed = new Set();
    senderTxs.forEach(tx => {
      if (tx.platforms && tx.platforms.length > 0) {
        tx.platforms.forEach(platform => platformsUsed.add(platform));
      }
    });

    // Criteria 2: Multiple DEX usage check
    const usedMultipleDexes = platformsUsed.size > 1;

    // Step 4: Check for round-trip trading (same token bought AND sold)
    const tokenInteractions = new Map();
    
    senderTxs.forEach(swapTx => {
      if (swapTx.swapDetails) {
        
        // Track tokens bought (tokensOut)
        swapTx.swapDetails.tokensOut?.forEach(token => {
          const mint = token.mint;
          if (!tokenInteractions.has(mint)) {
            tokenInteractions.set(mint, { buys: 0, sells: 0 });
          }
          tokenInteractions.get(mint).buys++;
        });

        // Track tokens sold (tokensIn)
        swapTx.swapDetails.tokensIn?.forEach(token => {
          const mint = token.mint;
          if (!tokenInteractions.has(mint)) {
            tokenInteractions.set(mint, { buys: 0, sells: 0 });
          }
          tokenInteractions.get(mint).sells++;
        });
      }
    });

    // Step 5: Find tokens that were both bought AND sold (round-trip)
    const roundTripTokens = [];
    tokenInteractions.forEach((interactions, tokenMint) => {
      // Criteria 3: Round-trip trading check
      if (interactions.buys > 0 && interactions.sells > 0) {
        roundTripTokens.push({
          mint: tokenMint,
          buyCount: interactions.buys,
          sellCount: interactions.sells
        });
      }
    });

    // Step 6: Determine if this sender shows arbitrage behavior
    const hasRoundTripTrading = roundTripTokens.length > 0;
    
    // Check if ALL criteria are met for perfect arbitrage detection
    const allCriteriaMet = (
      senderTxs.length >= 2 &&        // Multiple transactions
      usedMultipleDexes &&            // Multiple DEXes used
      hasRoundTripTrading              // Round-trip trading
    );
    
    // Flag as arbitrage if either:
    // - Used multiple DEXes (strong indicator)
    // - Did round-trip trading on same tokens
    if (usedMultipleDexes || hasRoundTripTrading) {
      arbitrageOpportunities.push({
        sender,
        transactionCount: senderTxs.length,
        usedMultipleDexes,
        platformsUsed: Array.from(platformsUsed),
        roundTripTokens,
        hasRoundTripTrading,
        allCriteriaMet, // TRUE if all 3 criteria are satisfied
        
        // Confidence scoring
        confidence: allCriteriaMet ? 'PERFECT' : (usedMultipleDexes ? 'HIGH' : 'MEDIUM'),
        
        // Transaction details
        transactions: senderTxs.map(tx => ({
          signature: tx.signature,
          platforms: tx.platforms || []
        }))
      });
    }
  });

  // Step 7: Sort by confidence and transaction count
  arbitrageOpportunities.sort((a, b) => {
    // Perfect confidence first
    if (a.confidence === 'PERFECT' && b.confidence !== 'PERFECT') return -1;
    if (a.confidence !== 'PERFECT' && b.confidence === 'PERFECT') return 1;
    // High confidence second
    if (a.confidence === 'HIGH' && b.confidence === 'MEDIUM') return -1;
    if (a.confidence === 'MEDIUM' && b.confidence === 'HIGH') return 1;
    // Then by transaction count
    return b.transactionCount - a.transactionCount;
  });

  return {
    totalArbitrageOpportunities: arbitrageOpportunities.length,
    allCriteriaMet: arbitrageOpportunities.some(arb => arb.allCriteriaMet), // TRUE if any opportunity meets all criteria
    opportunities: arbitrageOpportunities,
    summary: {
      uniqueArbitragers: arbitrageOpportunities.length,
      perfectArbitrageCount: arbitrageOpportunities.filter(arb => arb.allCriteriaMet).length,
      highConfidenceCount: arbitrageOpportunities.filter(arb => arb.confidence === 'HIGH').length,
      multiDexUsageCount: arbitrageOpportunities.filter(arb => arb.usedMultipleDexes).length,
      roundTripTradingCount: arbitrageOpportunities.filter(arb => arb.hasRoundTripTrading).length
    }
  };
}