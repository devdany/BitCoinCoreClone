const crypto = require('crypto-js');
const hex2binary = require('hex-to-binary');
const Wallet = require('./wallet');
const Transaction = require('./transaction');
const Mempool = require('./memPool');
const _ = require('lodash');

const BLOCK_GENERATION_INTERVAL = 10;
const DIFFICULTY_ADJUSTMENT_INTERVAL = 10;

const {getBalance, getPublicFromWallet, createTx, getPrivateFromWallet} = Wallet;
const {createCoinbaseTx, processTx} = Transaction;
const {addToMemPool, getMemPool, updateMempool} = Mempool;

class Block{
    constructor(index, hash, previousHash, timestamp, data, difficulty, nonce){
        this.index = index;
        this.hash = hash;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.data = data;
        this.difficulty = difficulty;
        this.nonce = nonce;
    }
}

const genesisBlock = new Block(0,'97DEEDC1DA13538A2F221575BE11743953E6DB97D6C73ED906D9F710E682D5E0',null, 1537852555, 'this is genesis',0, 0)

let blockChain = [genesisBlock];

let uTxOuts = [];

const getNewestBlock = () => blockChain[blockChain.length-1];

const getTimestamp = () => Math.round(new Date().getTime() / 1000);

const createHash = (index, previousHash, timestamp, data, difficulty, nonce) => crypto.SHA256(''+index+previousHash+timestamp+JSON.stringify(data) + difficulty + nonce).toString();

const getBlockchain = () => blockChain;

const createNewBlock = () => {
    const coinbaseTx = createCoinbaseTx(getPublicFromWallet(), getNewestBlock().index+1);
    const blockData = [coinbaseTx].concat(getMemPool());


    return createNewRawBlock(blockData)
}

const createNewRawBlock = data => {
    const previousBlock = getNewestBlock();
    const newBlockIndex = previousBlock.index+1;
    const newTimestamp = getTimestamp();
    const difficulty = findDifficulty();
    const newBlock = findBlock(newBlockIndex, previousBlock.hash, newTimestamp, data, difficulty)

    addBlockToChain(newBlock);
    require('./p2p').broadcastNewBlock();
    return newBlock;
}

const findDifficulty = () => {
    const newestBlock = getNewestBlock()

    if(newestBlock.index % 10 === 0 && newestBlock.index !== 0){
        return calculatNewDifficulty(newestBlock, getBlockchain())
    } else {
        return newestBlock.difficulty
    }
}

const calculatNewDifficulty = (newestBlock, blockchain) => {
    const lastCalculatedBlock = blockchain[blockchain.length - DIFFICULTY_ADJUSTMENT_INTERVAL];
    const timeExpected = BLOCK_GENERATION_INTERVAL * DIFFICULTY_ADJUSTMENT_INTERVAL;

    const timeTaken = newestBlock.timestamp - lastCalculatedBlock.timestamp;

    if(timeTaken < timeExpected/2){
        return lastCalculatedBlock.difficulty+1
    }else if (timeTaken > timeExpected*2){
        return lastCalculatedBlock.difficulty-1
    }else{
        return lastCalculatedBlock.difficulty
    }
}

const findBlock = (index, previousHash, timestamp, data, difficulty) => {
    let nonce = 0;

    while(true){
        console.log("current nonce:", nonce)
        const hash = createHash(index, previousHash, timestamp, data, difficulty, nonce)

        if(hashMatchDifficulty(hash, difficulty)){
            return new Block(index, hash, previousHash, timestamp, data, difficulty, nonce)
        }

        nonce ++;

    }
}

const hashMatchDifficulty = (hash, difficulty) => {
    const hashInBinary = hex2binary(hash);
    const requiredZero = "0".repeat(difficulty);
    console.log("Trying difficulty:" + difficulty + ", with hash:"+hashInBinary)
    return hashInBinary.startsWith(requiredZero);
}

const getBlockHash = (block) => createHash(block.index, block.previousHash, block.timestamp, block.data, block.difficulty, block.nonce);

const isBlockStructureValid = (block) => {
    if(typeof block.index !== 'number' ||
        typeof block.hash !== 'string' ||
        typeof block.previousHash !== 'string' ||
        typeof block.timestamp !== 'number' ||
        typeof block.data !== 'object'){
    }

    return (
        typeof block.index === 'number' &&
        typeof block.hash === 'string' &&
        typeof block.previousHash === 'string' &&
        typeof block.timestamp === 'number' &&
        typeof block.data === 'object'
    );
}

const isBlockValid = (candidateBlock, latestBlock) => {
    if(!isBlockStructureValid(candidateBlock)){
        console.log('the candidate block structure is not valid');
        return false;
    }
    if(latestBlock.index +1 !== candidateBlock.index){
        console.log('The CandidateBlock doesnt have a valid index');
        return false;
    }else if(latestBlock.hash !== candidateBlock.previousHash){
        console.log('previous hash invalid!');
        return false;
    }else if(getBlockHash(candidateBlock) !== candidateBlock.hash){
        console.log('hash is not correct');
        return false;
    }else if(!isTimestampValid(candidateBlock, latestBlock)){
        console.log('timestamp is not correct');
        return false;
    }

    return true;

}

const isTimestampValid = (newBlock, previousBlock) => {
    return (previousBlock.timestamp - 60 < newBlock.timestamp &&  newBlock.timestamp-60 < getTimestamp())
}

const isChainValid = (candidateChain) => {
    const isGenesisValid = block => {
        return JSON.stringify(block) === JSON.stringify(genesisBlock);
    };

    if(!isGenesisValid(candidateChain[0])){
        console.log('The candidate chain is not the same our genesisblock');
        return false;
    }

    for(let i = 1; i< candidateChain.length; i++){
        if(!isBlockValid(candidateChain[i], candidateChain[i-1])){
            return false;
        }
    }
    return true;
}

const sumDifficulty = blockchain =>
    blockchain
        .map(blockchain => blockchain.difficulty)
        .map(difficulty => Math.pow(2, difficulty))
        .reduce((a, b) => a+b);


const replaceChain = candidateChain => {
    if(isChainValid(candidateChain) && sumDifficulty(candidateChain) >sumDifficulty(getBlockchain())){
        blockChain = candidateChain;
        return true;
    }else{
        return false;
    }
}

const addBlockToChain = candidateBlock => {
    if(isBlockValid(candidateBlock, getNewestBlock())){

        const processTxs = processTx(candidateBlock.data, uTxOuts, candidateBlock.index);

        if(processTxs === null){
            console.log("couldnt process txs");
            return false;
        }else{
            blockChain.push(candidateBlock);
            uTxOuts = processTxs;
            updateMempool(uTxOuts)
            return true;
        }
    }else{
        return false;
    }
}

const getAccountBalance = () => getBalance(getPublicFromWallet(), uTxOuts)

const getUTxOutList = () => _.cloneDeep(uTxOuts);


const sendTx = (address, amount) =>{
    const tx = createTx(address, amount, getPrivateFromWallet(),getUTxOutList(), getMemPool());

    addToMemPool(tx, getUTxOutList())
    return tx;
}

module.exports = {
    getBlockchain,
    createNewBlock,
    getNewestBlock,
    isBlockStructureValid,
    addBlockToChain,
    replaceChain,
    getAccountBalance,
    sendTx
}