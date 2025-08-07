import { Connection } from "@solana/web3.js";
import { analyzeTransaction } from "./analyzeTransaction.js";

export const getAnalyzedDexTransactions = async () => {
  const connection = new Connection(
    "https://api.mainnet-beta.solana.com",
    "confirmed"
  );
  const currentSlot = await connection.getSlot();
  console.log("Current slot:", currentSlot);

  const startSlot = currentSlot;
  const endSlot = currentSlot;

  const analyzedTransactions = []; // Fixed variable name

  try {
    for (let slot = startSlot; slot <= endSlot; slot++) {
      console.log(`Fetching block ${slot}`);
      
      const block = await connection.getBlock(slot, {
        commitment: "confirmed",
        rewards: false,
        maxSupportedTransactionVersion: 0,
      });

      if (block && block.transactions) {
        console.log(`Found ${block.transactions.length} transactions in slot ${slot}`);

        let dexCount = 0;
        for (const tx of block.transactions) {
          const analyzed = await analyzeTransaction(tx); // Added await
          if (analyzed) {
            analyzedTransactions.push(analyzed); // Fixed variable name
            dexCount++;
          }
        }

        console.log(`${dexCount} DEX transactions found`);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }

  return analyzedTransactions;
};