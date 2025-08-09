import { Connection } from "@solana/web3.js";
import { detectSwapTransaction } from "./analyzeTrasactions.js";
import { DEX_PROGRAM_IDS } from "../constants.js";
import { detectMEV, getMEVDescription } from "../lib/detectedMev.js";

export const getAllTransactions = async () => {
  const connection = new Connection("https://api.mainnet-beta.solana.com", {
    commitment: "finalized",
  });
  
  const slotNo = await connection.getSlot();
  console.log('Scanning slot:', slotNo);

  const getBlock = await connection.getBlock(slotNo, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
    rewards: false,
    transactionDetails: "full"
  });

  if (!getBlock) {
    console.error('Block not found for slot:', slotNo);
    return [];
  }

  console.log(`Block found with ${getBlock.transactions.length} transactions`);
  
  const swapTransactions = []; 
  const transactions = getBlock.transactions;

  // First pass: Detect all swaps
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    
    try {
      const analyzedTransaction = detectSwapTransaction(tx, DEX_PROGRAM_IDS);
      
      // Adding only if swap is detected
      if (analyzedTransaction.swapDetected) {
        swapTransactions.push(analyzedTransaction);
      }
      
    } catch (error) {
      console.error(`Error analyzing transaction ${i + 1}:`, error.message);
    }
  }

  // Second pass: Add MEV detection to each swap
  const swapsWithMEV = swapTransactions.map((swap, index) => {
    const mevResult = detectMEV(swap, swapTransactions, index);
    
    return {
      ...swap,
      mev: mevResult
    };
  });

  console.log(`\n📊 ANALYSIS COMPLETE:`);
  console.log(`Found ${swapsWithMEV.length} swap transactions out of ${transactions.length} total transactions`);
  
  // Count MEV transactions
  const mevTransactions = swapsWithMEV.filter(swap => swap.mev.isMev);
  console.log(`🤖 MEV detected in ${mevTransactions.length} transactions`);

  // Show summary of swaps found
  swapsWithMEV.forEach((swap, idx) => {
    console.log(`\n${idx + 1}. 🔄 Swap Transaction:`);
    console.log(`     Signature: ${swap.signature}`);
    console.log(`     User: ${swap.swapDetails.owner}`);
    console.log(`     Initiator Wallet: ${swap.initiatorWallet}`);
    console.log(`     Tokens Out: ${swap.swapDetails.tokensOut.map(t => `${t.amount} - ${t.mint.slice(0,8)}...`).join(', ')}`);
    console.log(`     Tokens In: ${swap.swapDetails.tokensIn.map(t => `${t.amount} - ${t.mint.slice(0,8)}...`).join(', ')}`);
    console.log(`     Trade Path: ${swap.tradePath}`);
    console.log(`     Platforms: [ ${swap.platforms.join(", ")} ]`);
    
    // MEV Information
    if (swap.mev.isMev) {
      console.log(`     🤖 MEV DETECTED!`);
      console.log(`        Type: ${swap.mev.mevType.toUpperCase()}`);
      console.log(`        Confidence: ${swap.mev.confidence}%`);
      console.log(`        Description: ${getMEVDescription(swap.mev.mevType)}`);
      
      if (swap.mev.botAddress) {
        console.log(`        Bot Address: ${swap.mev.botAddress}`);
      }
      
      if (swap.mev.details) {
        console.log(`        Details: ${JSON.stringify(swap.mev.details, null, 8)}`);
      }
    } else {
      console.log(`     ✅ No MEV detected`);
    }
    
    if (swap.matchedProgramIds.length > 0) {
      console.log(`     📋 DEX Programs: [${swap.matchedProgramIds.join(', ')}]`);
    }
  });

  // Summary statistics
  console.log(`\n📈 BLOCK SUMMARY:`);
  console.log(`Total Transactions: ${transactions.length}`);
  console.log(`Swap Transactions: ${swapsWithMEV.length}`);
  console.log(`MEV Transactions: ${mevTransactions.length}`);
  
  if (mevTransactions.length > 0) {
    console.log(`\n🤖 MEV BREAKDOWN:`);
    const mevTypes = {};
    mevTransactions.forEach(tx => {
      mevTypes[tx.mev.mevType] = (mevTypes[tx.mev.mevType] || 0) + 1;
    });
    
    Object.entries(mevTypes).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} transactions`);
    });
  }

  return swapsWithMEV;
};