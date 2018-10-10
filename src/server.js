const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const blockchain = require('./blockchain');
const P2P = require('./p2p');
const Wallet = require('./wallet');
const Mempool = require('./memPool');


const {getBlockchain, createNewBlock, getAccountBalance, sendTx} = blockchain;
const {startP2PServer, connectToPeers} = P2P;
const {initWallet} = Wallet;
const {getMemPool} = Mempool;

const PORT = process.env.HTTP_PORT || 3000;

const app = express();

app.use(bodyParser.json());
app.use(morgan('combined'));

app
    .route("/blocks")
    .get((req, res) => {
        res.send(getBlockchain());
    })
    .post((req, res) => {
        const newBlock = createNewBlock();
        res.send(newBlock);
    })

app.post("/peers", (req, res) => {
    connectToPeers(req.body.peer);
    res.send();
})

app.get("/me/balance", (req,res) => {
    const balance = getAccountBalance();
    res.send({balance})
})

app.route('/transaction')
    .get((req, res) => {
        //res.send(getMemPool());
    })
    .post((req, res) => {
        try{
            const {body:{address, amount}} = req;
            if(address === undefined || amount === undefined){
                throw Error('please input the address and amount')
            }else{
                const txResult = sendTx(address, amount);
                res.send(txResult);
            }
        }catch(err){
            res.status(400).send(err.message);
        }
    })

const server = app.listen(PORT, () => console.log(`Nomad coin HTTP server running on ${PORT}`))

initWallet();
startP2PServer(server);