import { Connection } from "@solana/web3.js";
import { detectSwapTransaction } from "./analyzeTrasactions.js"; // check spelling later
import { DEX_PROGRAM_IDS } from "../constants.js";
import { detectArbitrage } from "../lib/detectArbitrage.js";
import { detectMEV, getMEVDescription } from "../lib/detectedMev.js"; // Add this import

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

    console.log(
      `Block found with ${getBlock.transactions.length} transactions`
    );

    const swapTransactions = [];
    const transactions = getBlock.transactions;

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];

      try {
        const analyzedTransaction = detectSwapTransaction(tx, DEX_PROGRAM_IDS);

        if (analyzedTransaction.swapDetected) {
          swapTransactions.push(analyzedTransaction);
        }
      } catch (error) {
        console.error(
          `Error analyzing transaction ${i + 1} in slot ${slot}:`,
          error.message
        );
      }
    }

    console.log(`\n📊 SLOT ${slot} ANALYSIS:`);
    console.log(
      `Found ${swapTransactions.length} swap transactions out of ${transactions.length} total transactions`
    );

    const arbitrageResult = detectArbitrage(swapTransactions, DEX_PROGRAM_IDS);

    console.log(`\n🎯 ARBITRAGE ANALYSIS:`);
    console.log(
      `Total arbitrage opportunities: ${arbitrageResult.totalArbitrageOpportunities}`
    );
    console.log(
      `Perfect arbitrage (all criteria met): ${arbitrageResult.summary.perfectArbitrageCount}`
    );
    console.log(
      `High confidence: ${arbitrageResult.summary.highConfidenceCount}`
    );
    console.log(
      `Multi-DEX usage: ${arbitrageResult.summary.multiDexUsageCount}`
    );
    console.log(
      `Round-trip trading: ${arbitrageResult.summary.roundTripTradingCount}`
    );

    // MEV Detection
    const mevTransactions = [];
    swapTransactions.forEach((swap, index) => {
      try {
        const mevResult = detectMEV(swap, swapTransactions, index);
        if (mevResult.isMev) {
          mevTransactions.push({ ...swap, mevResult });
        }
      } catch (error) {
        console.error(
          `Error detecting MEV for transaction ${swap.signature}:`,
          error.message
        );
      }
    });

    console.log(`\n🤖 MEV ANALYSIS:`);
    console.log(
      `MEV transactions detected: ${mevTransactions.length}/${swapTransactions.length}`
    );

    if (mevTransactions.length > 0) {
      console.log(`\n🚨 MEV TRANSACTIONS DETECTED:`);
      mevTransactions.forEach((mevTx, idx) => {
        console.log(
          `\n${idx + 1}. 🤖 ${mevTx.mevResult.mevType.toUpperCase()} (${
            mevTx.mevResult.confidence
          }% confidence)`
        );
        console.log(
          `     Description: ${getMEVDescription(mevTx.mevResult.mevType)}`
        );
        console.log(`     Signature: ${mevTx.signature}`);
        console.log(`     User: ${mevTx.swapDetails?.owner || "Unknown"}`);
        console.log(`     Platforms: [${(mevTx.platforms || []).join(", ")}]`);
      });
    }

    if (arbitrageResult.allCriteriaMet) {
      console.log(`\n🚨 PERFECT ARBITRAGE DETECTED! 🚨`);

      arbitrageResult.opportunities
        .filter((opp) => opp.allCriteriaMet)
        .forEach((opp, idx) => {
          console.log(`\n${idx + 1}. 🎯 Perfect Arbitrage:`);
          console.log(`     Sender: ${opp.sender}`);
          console.log(`     Transactions: ${opp.transactionCount}`);
          console.log(`     Platforms Used: [${opp.platformsUsed.join(", ")}]`);
          console.log(`     Round-trip Tokens: ${opp.roundTripTokens.length}`);
          opp.roundTripTokens.forEach((token) => {
            console.log(
              `       - ${token.mint.slice(0, 8)}... (${token.buyCount} buys, ${
                token.sellCount
              } sells)`
            );
          });
          console.log(`     Transaction Signatures:`);
          opp.transactions.forEach((tx) => {
            console.log(`       - ${tx.signature}`);
          });
        });
    }

    const highConfidenceArbitrage = arbitrageResult.opportunities.filter(
      (opp) => opp.confidence === "HIGH" && !opp.allCriteriaMet
    );

    if (highConfidenceArbitrage.length > 0) {
      console.log(`\n🔶 HIGH CONFIDENCE ARBITRAGE (Multi-DEX):`);
      highConfidenceArbitrage.forEach((opp, idx) => {
        console.log(`\n${idx + 1}. 🔶 Multi-DEX Trading:`);
        console.log(`     Sender: ${opp.sender}`);
        console.log(`     Transactions: ${opp.transactionCount}`);
        console.log(`     Platforms: [${opp.platformsUsed.join(", ")}]`);
        console.log(
          `     Round-trip: ${opp.hasRoundTripTrading ? "YES" : "NO"}`
        );
      });
    }

    if (swapTransactions.length) {
      console.log(`\n📋 INDIVIDUAL SWAP DETAILS:`);
      swapTransactions.forEach((swap, idx) => {
        console.log(`\n${idx + 1}. 🔄 Swap Transaction:`);
        console.log(`     Signature: ${swap.signature}`);
        console.log(`     User: ${swap.swapDetails?.owner || "Unknown"}`);
        console.log(`     Initiator Wallet: ${swap.initiatorWallet}`);
        console.log(`     Trade Path: ${swap.tradePath || "N/A"}`);
        console.log(`     Platforms: [ ${(swap.platforms || []).join(", ")} ]`);
        console.log(`     Tokens In:`);
        swap.swapDetails.tokensIn?.forEach((t) => {
          console.log(`       - Mint: ${t.mint}, Amount: ${t.amount}`);
        });

        console.log(`     Tokens Out:`);
        swap.swapDetails.tokensOut.forEach((t) => {
          console.log(`       - Mint: ${t.mint}, Amount: ${t.amount}`);
        });
      });
    }
  }
};
