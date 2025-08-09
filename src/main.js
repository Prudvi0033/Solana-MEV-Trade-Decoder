import { getAllTransactions } from "./utils/getAllTransactions.js"

const main = async () => {
    const transactions = await getAllTransactions()
    for(const tx of transactions){
        console.log(tx);
    }
}

main()