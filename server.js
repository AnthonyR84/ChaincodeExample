let express = require('express');
let app = express();

let bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: false }));

let path = require('path');
let util = require('util');

let hfc = require('fabric-client');
let utils = require('fabric-client/lib/utils.js');
let Peer = require('fabric-client/lib/Peer.js');
let Orderer = require('fabric-client/lib/Orderer.js');
let EventHub = require('fabric-client/lib/EventHub.js');
let logger = utils.getLogger('mortgage gateway');

let config = require('./config.json');
let helper = require('./helper.js');
let allEventhubs = [];

let client = new hfc();
let chain;
let eventhub;
let tx_id = null;
let admin;
let nonce;

let response= {
    "response" : "Hello World"
};

function disconnectEventServers() {
    for(let key in allEventhubs) {
        let eventhub = allEventhubs[key];
        if (eventhub && eventhub.isconnected()) {
            logger.debug('Disconnecting the event hub');
            eventhub.disconnect();
        }
    }
}

app.use(function(request, response, next) {
    response.header("Access-Control-Allow-Origin", "*");
    response.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.post('/chaincode', function(req,res) {

    let bod=JSON.parse(JSON.stringify(req.body));
    
    if (bod.method === "query" ) {
        nonce = utils.getNonce();
        tx_id = chain.buildTransactionID(nonce, admin);

        let request = {
            chaincodeId: config.chaincodeID,
            chainId: config.channelID,
            chaincodeVersion: config.chaincodeVersion,
            txId: tx_id,
            nonce: nonce,
            fcn: bod.function,
            args: [bod.name]
        };
        // Query chaincode
        chain.queryByChaincode(request).then(
            function(response_payloads) {
                console.log(request);
                console.log(response_payloads.toString('utf8'));
                let answer;
                answer=JSON.parse( ' { "status" : "ok" , "message" : "" }');
                answer.message=response_payloads.toString('utf8');
                res.send(answer);
            }
        ).catch(
            function(err) {
                logger.error('Failed to end to end test with error:' + err.stack ? err.stack : err);
            }
        );

    }  else if (bod.method === "invoke" ) {

        
        logger.info('Executing Invoke');
        nonce = utils.getNonce();
        tx_id = chain.buildTransactionID(nonce, admin);

        let request = {
            chainId: config.channelID,
            chaincodeId: config.chaincodeID,
            chaincodeVersion: config.chaincodeVersion,
            fcn: bod.function,
            args: [bod.name],
            txId: tx_id,
            nonce: nonce
        };
        let answer;

        chain.sendTransactionProposal(request).then(
            (results) => {
                let proposalResponses = results[0];
                let proposal = results[1];
                let header   = results[2];
                let all_good = true;
                for(let i in proposalResponses) {
                    let one_good = false;
                    if (proposalResponses && proposalResponses[i].response && proposalResponses[i].response.status === 200) {
                        one_good = true;
                        logger.info('transaction proposal was good');
                    } else {
                        logger.error('transaction proposal was bad');
                    }
                    all_good = all_good & one_good;
                }
                

                if (all_good) {
                    answer=proposalResponses[0].response.payload.toString(); // store results returned by shim.success() in chaincode
                    logger.info(util.format('Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s', proposalResponses[0].response.status, proposalResponses[0].response.message, proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
                    let request = {
                        proposalResponses: proposalResponses,
                        proposal: proposal,
                        header: header
                    };

                    // set the transaction listener and set a timeout of 30sec
                    // if the transaction did not get committed within the timeout period,
                    // fail the test
                    let deployId = tx_id.toString();

                    let eventPromises = [];
                    allEventhubs.forEach((eh) => {
                        let txPromise = new Promise((resolve, reject) => {
                            let handle = setTimeout(reject, 30000);

                            eh.registerTxEvent(deployId.toString(), (tx, code) => {
                                clearTimeout(handle);
                                eh.unregisterTxEvent(deployId);

                                if (code !== 'VALID') {

                                    logger.error('The transaction was invalid, code = ' + code);
                                    reject();
                                } else {
                                    logger.info('The transaction has been committed on peer '+ eh.ep._url);
                                    resolve();
                                }
                            });
                        });

                        eventPromises.push(txPromise);
                    });

                    let sendPromise = chain.sendTransaction(request);
                    return Promise.all([sendPromise].concat(eventPromises))
                        .then((results) => {
                            logger.info('event promise all complete and testing complete');
                            return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call

                        }).catch(function (err){
                            disconnectEventServers();
                            logger.error('Failed to send transaction and get notifications within the timeout period.' + err);
                            process.exit();

                        })

                } else {
                    disconnectEventServers();
                    logger.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
                    process.exit();
                }
            },
            (err) => {
                disconnectEventServers();
                logger.error('Failed to send proposal due to error: ' + err.stack ? err.stack : err);
                process.exit();

            }
        ).then(
            (response) => {

                if (response.status === 'SUCCESS') {
                    logger.info('Successfully sent transaction to the orderer.');
                    let answer2;
                    answer2=JSON.parse( '{ "status" : "ok" , "txid" : "'+tx_id+'"}' );
                    answer2.message = answer;
                    res.send(answer2);
                } else {
                    disconnectEventServers();
                    logger.error('Failed to order the transaction. Error code: ' + response.status);
                    process.exit();
                }

            },
            (err) => {
                disconnectEventServers();
                logger.error('Failed to send transaction due to error: ' + err.stack ? err.stack : err);
                process.exit();
            }
        );

    }
});

function init() {
    chain = client.newChain(config.channelID);
    chain.addOrderer(new Orderer(config.orderer.orderer_url));

//    for (let i = 0; i < config.peers.length; i++) {
    //Prenons uniquement le premier peer pour le mortgage car la requete est envoyée à tous les peers
    for (let i = 0; i < 1; i++) {
        chain.addPeer(new Peer(config.peers[i].peer_url));
        let eh = new EventHub();
        eh.setPeerAddr(config.peers[i].event_url);
        eh.connect();
        allEventhubs.push(eh);
    }

    return hfc.newDefaultKeyValueStore({
        path: config.keyValueStore
    }).then((store) => {
        client.setStateStore(store);
        return helper.getSubmitter(client);
    }).then((admi) => {
            admin=admi;
        },
        (err) => {
            logger.info('Failed to get submitter \'admin\'');
            logger.error('Failed to get submitter \'admin\'. Error: ' + err.stack ? err.stack : err );
            process.exit();
        }
    )
}


init();

let server = app.listen(7000, "localhost",function () {

    let host = server.address().address;
    let port = server.address().port;
    console.log("Example app listening at http://%s:%s", host, port)

});
