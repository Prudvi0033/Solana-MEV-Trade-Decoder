
/**
 * Detects arbitrage opportunities based on simple criteria:
 * 1. Same owner across multiple transactions in one slot
 * 2. Multiple DEX usage - User interacts with different DEX platforms  
 * 3. Round-trip trading - User both buys AND sells the same specific token mint
 */

export function detectArbitrage(swapTransactions, DEX_PROGRAM_IDS) {
  console.log(`🔍 Analyzing ${swapTransactions.length} swap transactions for arbitrage...`);
  
  //1. cheking for single initiator in multiple transactions in same slot
  const senderGroups = new Map();
  //grouping the sender ie.. initiator
  swapTransactions.forEach(swapResult => {
    //processed swap transactions
    if (swapResult.swapDetected && swapResult.initiatorWallet) {
      const sender = swapResult.initiatorWallet;
      
      if (!senderGroups.has(sender)) {
        senderGroups.set(sender, []);
      }
      
      senderGroups.get(sender).push(swapResult);
    }
  });

  // console.log(`📊 Found ${senderGroups.size} unique senders`);
  
  //Show senders with multiple transactions
  // senderGroups.forEach((txs, sender) => {
  //   if (txs.length > 1) {
  //     console.log(`   👤 ${sender.slice(0, 8)}... has ${txs.length} transactions`);
  //   }
  // });

  const arbitrageOpportunities = [];

  // analyzing each sender's transactions for arbitrage
  senderGroups.forEach((senderTxs, sender) => {
    
    if (senderTxs.length < 2) return;

    const platformsUsed = new Set();
    senderTxs.forEach(tx => {
      if (tx.platforms && tx.platforms.length > 0) {
        tx.platforms.forEach(platform => platformsUsed.add(platform));
      }
    });

    const usedMultipleDexes = platformsUsed.size > 1;

    //checking for round-trip (same token bought and sold same token)
    //so1111..., 0.44 (mint, tokensIn/out)
    const tokenInteractions = new Map();
    
    senderTxs.forEach(swapTx => {
      if (swapTx.swapDetails) {
        
        //tokens bought (tokensOut)
        swapTx.swapDetails.tokensOut?.forEach(token => {
          const mint = token.mint;
          if (!tokenInteractions.has(mint)) {
            tokenInteractions.set(mint, { buys: 0, sells: 0 });
          }
          tokenInteractions.get(mint).buys++;
        });

        //tokens sold (tokensIn)
        swapTx.swapDetails.tokensIn?.forEach(token => {
          const mint = token.mint;
          if (!tokenInteractions.has(mint)) {
            tokenInteractions.set(mint, { buys: 0, sells: 0 });
          }
          tokenInteractions.get(mint).sells++;
        });
      }
    });

    const roundTripTokens = [];
    tokenInteractions.forEach((interactions, tokenMint) => {
      // 3: check for Round-trip
      if (interactions.buys > 0 && interactions.sells > 0) {
        roundTripTokens.push({
          mint: tokenMint,
          buyCount: interactions.buys,
          sellCount: interactions.sells
        });
      }
    });

    const hasRoundTripTrading = roundTripTokens.length > 0;
    
    const allCriteriaMet = (
      senderTxs.length >= 2 &&        // multiple transactions
      usedMultipleDexes &&            // multiple DEXes
      hasRoundTripTrading              // round-trip
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
        allCriteriaMet, // TRUE if all 3 criteria are met
        
        // Confidence scoring
        confidence: allCriteriaMet ? 'PERFECT' : (usedMultipleDexes ? 'HIGH' : 'MEDIUM'),
        
        transactions: senderTxs.map(tx => ({
          signature: tx.signature,
          platforms: tx.platforms || []
        }))
      });
    }
  });

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