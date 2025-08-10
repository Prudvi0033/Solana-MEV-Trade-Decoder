import { Connection } from "@solana/web3.js";
import { detectSwapTransaction } from "./analyzeTrasactions.js"; // check spelling later
import { DEX_PROGRAM_IDS } from "../constants.js";
import { detectArbitrage } from "../lib/detectArbitrage.js";

export const getAllTransactions = async () => {
  const connection = new Connection("https://api.mainnet-beta.solana.com", {
    commitment: "finalized",
  });

  const slotNo = await connection.getSlot();
  console.log("Current slot:", slotNo);

  const startSlot = slotNo - 10;
  const endSlot = slotNo;

  for (let slot = startSlot; slot <= endSlot; slot++) {
    console.log(`\n🔍 Scanning slot: ${slot}`);

    const getBlock = await connection.getBlock(slot, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
      rewards: false,
      transactionDetails: "full",
    });

    if (!getBlock) {
      console.error(`Block not found for slot: ${slot}`);
      continue;
    }

    console.log(`Block found with ${getBlock.transactions.length} transactions`);

    const swapTransactions = [];
    const transactions = getBlock.transactions;

    // Detect all swaps in this slot
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];

      try {
        const analyzedTransaction = detectSwapTransaction(tx, DEX_PROGRAM_IDS);

        if (analyzedTransaction.swapDetected) {
          swapTransactions.push(analyzedTransaction);
        }
      } catch (error) {
        console.error(`Error analyzing transaction ${i + 1} in slot ${slot}:`, error.message);
      }
    }

    console.log(`\n📊 SLOT ${slot} ANALYSIS:`);
    console.log(
      `Found ${swapTransactions.length} swap transactions out of ${transactions.length} total transactions`
    );

    // 🔥 FIXED: Analyze ALL swaps together for arbitrage patterns
    const arbitrageResult = detectArbitrage(swapTransactions, DEX_PROGRAM_IDS);
    
    console.log(`\n🎯 ARBITRAGE ANALYSIS:`);
    console.log(`Total arbitrage opportunities: ${arbitrageResult.totalArbitrageOpportunities}`);
    console.log(`Perfect arbitrage (all criteria met): ${arbitrageResult.summary.perfectArbitrageCount}`);
    console.log(`High confidence: ${arbitrageResult.summary.highConfidenceCount}`);
    console.log(`Multi-DEX usage: ${arbitrageResult.summary.multiDexUsageCount}`);
    console.log(`Round-trip trading: ${arbitrageResult.summary.roundTripTradingCount}`);

    if (arbitrageResult.allCriteriaMet) {
      console.log(`\n🚨 PERFECT ARBITRAGE DETECTED! 🚨`);
      
      arbitrageResult.opportunities
        .filter(opp => opp.allCriteriaMet)
        .forEach((opp, idx) => {
          console.log(`\n${idx + 1}. 🎯 Perfect Arbitrage:`);
          console.log(`     Sender: ${opp.sender}`);
          console.log(`     Transactions: ${opp.transactionCount}`);
          console.log(`     Platforms Used: [${opp.platformsUsed.join(', ')}]`);
          console.log(`     Round-trip Tokens: ${opp.roundTripTokens.length}`);
          opp.roundTripTokens.forEach(token => {
            console.log(`       - ${token.mint.slice(0, 8)}... (${token.buyCount} buys, ${token.sellCount} sells)`);
          });
          console.log(`     Transaction Signatures:`);
          opp.transactions.forEach(tx => {
            console.log(`       - ${tx.signature}`);
          });
        });
    }

    // Show high-confidence opportunities too
    const highConfidenceArbitrage = arbitrageResult.opportunities.filter(opp => 
      opp.confidence === 'HIGH' && !opp.allCriteriaMet
    );

    if (highConfidenceArbitrage.length > 0) {
      console.log(`\n🔶 HIGH CONFIDENCE ARBITRAGE (Multi-DEX):`);
      highConfidenceArbitrage.forEach((opp, idx) => {
        console.log(`\n${idx + 1}. 🔶 Multi-DEX Trading:`);
        console.log(`     Sender: ${opp.sender}`);
        console.log(`     Transactions: ${opp.transactionCount}`);
        console.log(`     Platforms: [${opp.platformsUsed.join(', ')}]`);
        console.log(`     Round-trip: ${opp.hasRoundTripTrading ? 'YES' : 'NO'}`);
      });
    }

    // Display individual swap details (optional - you can comment this out)
    if (swapTransactions.length > 0 && swapTransactions.length <= 10) { // Only show if manageable number
      console.log(`\n📋 INDIVIDUAL SWAP DETAILS:`);
      swapTransactions.forEach((swap, idx) => {
        console.log(`\n${idx + 1}. 🔄 Swap Transaction:`);
        console.log(`     Signature: ${swap.signature}`);
        console.log(`     User: ${swap.swapDetails?.owner || 'Unknown'}`);
        console.log(`     Initiator Wallet: ${swap.initiatorWallet}`);
        
        if (swap.swapDetails?.tokensOut) {
          console.log(
            `     Tokens Out: ${swap.swapDetails.tokensOut
              .map((t) => `${t.amount} - ${t.mint.slice(0, 8)}...`)
              .join(", ")}`
          );
        }
        
        if (swap.swapDetails?.tokensIn) {
          console.log(
            `     Tokens In: ${swap.swapDetails.tokensIn
              .map((t) => `${t.amount} - ${t.mint.slice(0, 8)}...`)
              .join(", ")}`
          );
        }
        
        console.log(`     Trade Path: ${swap.tradePath || 'N/A'}`);
        console.log(`     Platforms: [ ${(swap.platforms || []).join(", ")} ]`);
      });
    } else if (swapTransactions.length > 10) {
      console.log(`\n📋 Too many swaps (${swapTransactions.length}) to display individually`);
    }

    console.log(`\n${'='.repeat(80)}`);
  }
};