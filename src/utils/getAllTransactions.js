import { Connection } from "@solana/web3.js";
import { detectSwapTransaction } from "./analyzeTrasactions.js";
import { DEX_PROGRAM_IDS } from "../constants.js";

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

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    
    try {
      const analyzedTransaction = detectSwapTransaction(tx, DEX_PROGRAM_IDS);
      
      //adding only if swap is detected
      if (analyzedTransaction.swapDetected) {
        swapTransactions.push(analyzedTransaction);
      }
      
    } catch (error) {
      console.error(`Error analyzing transaction ${i + 1}:`, error.message);
    }
  }

  console.log(`Found ${swapTransactions.length} swap transactions out of ${transactions.length} total transactions`);
  
  // Show summary of swaps found
  swapTransactions.forEach((swap, idx) => {
    console.log(`\n${idx + 1}. 🔄 Swap Transaction:`);
    console.log(`     Signature: ${swap.signature}`);
    console.log(`     User: ${swap.swapDetails.owner}`);
    console.log(`     Tokens Out: ${swap.swapDetails.tokensOut.map(t => `${t.amount} - ${t.mint.slice(0,8)}...`).join(', ')}`);
    console.log(`     Tokens In: ${swap.swapDetails.tokensIn.map(t => `${t.amount} - ${t.mint.slice(0,8)}...`).join(', ')}`);
    console.log(`     Trader Path: ${swap.tradePath}`);
    console.log(`     Platforms: [ ${swap.platforms.join(", ")} ]`);
    
    if (swap.matchedProgramIds.length > 0) {
      console.log(`   📋 DEX Programs:[${swap.matchedProgramIds.join(', ')}]`);
    }
  });

  return swapTransactions;
};