var express = require('express');
var app = express();

var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: false }));
//app.use(bodyParser.json());

var path = require('path');
var util = require('util');

var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');
var EventHub = require('fabric-client/lib/EventHub.js');
var logger = utils.getLogger('mortgage gateway');

var config = require('./config.json');
var helper = require('./helper.js');
var allEventhubs = [];

var client = new hfc();
var chain;
var eventhub;
var tx_id = null;
var admin;
var nonce;

var reponse= {
    "response" : "Hello World"
};

function disconnectEventServers() {
    for(var key in allEventhubs) {
        var eventhub = allEventhubs[key];
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
    var bod=JSON.stringify(req.body);
    //console.log(bod);
    var bod2=bod.replace('":""}','').replace('{"','').replace(/\\\"/g,'"').replace(/\\"/g,'"');
    //console.log(bod2);
    var bod3=JSON.parse(bod2);

    var request = {
        chainId: config.channelID,
        chaincodeId: config.chaincodeID,
        chaincodeVersion: config.chaincodeVersion,
        fcn: bod3.params.ctorMsg.function,
        args: bod3.params.ctorMsg.args,
        txId: tx_id,
        nonce: nonce
    };


    //console.log(bod3.params.ctorMsg.args);

    if (bod3.method === "deploy" ) {
        logger.info('Executing Deploy');
        nonce = utils.getNonce();
        tx_id = chain.buildTransactionID(nonce, admin);

        chain.sendDeploymentProposal(request).then(
            function(results) {
                return helper.processProposal(tx_id,eventhub,chain, results, 'deploy');
            }
        ).then(
            function(response) {
                if (response.status === 'SUCCESS') {
                    logger.info('Successfully sent deployment transaction to the orderer.');
                    var answer;
                    answer=JSON.parse( ' { "status" : "ok" }');
                    res.send(answer);
                } else {
                    logger.error('Failed to order the deployment endorsement. Error code: ' + response.status);
                }
            }
        ).catch(
            function(err) {
                disconnectEventServers();
                logger.error(err.stack ? err.stack : err);
            }
        );


    } else if (bod3.method === "query" ) {
        nonce = utils.getNonce();
        tx_id = chain.buildTransactionID(nonce, admin);

        // Query chaincode
        chain.queryByChaincode(request).then(
            function(response_payloads) {
                //console.log(response_payloads[0].toString('utf8'));
                var answer;
                answer=JSON.parse( ' { "status" : "ok" , "message" : "" }');
                answer.message=response_payloads[0].toString('utf8');
                res.send(answer);

                //res.end(response_payloads[0].toString('utf8'));
            }
        ).catch(
            function(err) {
                logger.error('Failed to end to end test with error:' + err.stack ? err.stack : err);
            }
        );

    }  else if (bod3.method === "invoke" ) {



        logger.info('Executing Invoke');
        nonce = utils.getNonce();
        tx_id = chain.buildTransactionID(nonce, admin);

        // send proposal to endorser

        chain.sendTransactionProposal(request).then(
            (results) => {
            var proposalResponses = results[0];
        var proposal = results[1];
        var header   = results[2];
        var all_good = true;
        for(var i in proposalResponses) {
            let one_good = false;
            if (proposalResponses && proposalResponses[i].response && proposalResponses[i].response.status === 200) {
                //console.log(proposalResponses[i].response);
                one_good = true;
                //logger.info('transaction proposal was good');
            } else {
                logger.error('transaction proposal was bad');
            }
            all_good = all_good & one_good;
        }
        //console.log("");

        if (all_good) {
            logger.debug(util.format('Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s', proposalResponses[0].response.status, proposalResponses[0].response.message, proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
            var request = {
                proposalResponses: proposalResponses,
                proposal: proposal,
                header: header
            };

            // set the transaction listener and set a timeout of 30sec
            // if the transaction did not get committed within the timeout period,
            // fail the test
            var deployId = tx_id.toString();

            var eventPromises = [];
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
                logger.debug('The transaction has been committed on peer '+ eh.ep.addr);
                resolve();
            }
        })
        })

            eventPromises.push(txPromise);
        })

            var sendPromise = chain.sendTransaction(request);
            return Promise.all([sendPromise].concat(eventPromises))
                    .then((results) => {

                    //	logger.debug(' event promise all complete and testing complete');
                    return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call

        }).catch((err) => {
                disconnectEventServers();
            logger.error('Failed to send transaction and get notifications within the timeout period.');
            process.exit();

        })

        } else {
            disconnectEventServers();
            logger.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
            process.exit();
        }
    },
        (err) =;> {
            disconnectEventServers();
            logger.error('Failed to send proposal due to error: ' + err.stack ? err.stack : err);
            process.exit();

        }
    ).then(
            (response) => {

            if (response.status === 'SUCCESS';) {
            logger.debug('Successfully sent transaction to the orderer.');
            var answer;
            answer=JSON.parse( ' { "status" : "ok" , "txid" : "'+tx_id+'" }');
            res.send(answer);
            console.log('txid: '+tx_id);
        } else {
            disconnectEventServers();
            logger.error('Failed to order the transaction. Error code: ' + response.status);
            process.exit();
        }

    },
        (err) =;> {
            disconnectEventServers();
            logger.error('Failed to send transaction due to error: ' + err.stack ? err.stack : err);
            process.exit();
        }
    )

    }
});




function init() {
    chain = client.newChain(config.channelID);
    chain.addOrderer(new Orderer(config.orderer.orderer_url));

//    for (var i = 0; i < config.peers.length; i++) {
    //Prenons uniquement le premier peer pour le mortgage car la requete est envoyée à tous les peers
    for (var i = 0; i < 1; i++) {
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

}).then(
        (admi) => {
        admin = admi;
    admin.mspImpl._id = config.mspid;
},
    (err) =;> {
        logger.info('Failed to get submitter \'admin\'');
        logger.error('Failed to get submitter \'admin\'. Error: ' + err.stack ? err.stack : err );
        process.exit();
    }
)
}


init();


var server = app.listen(7000, "localhost",function () {

    var host = server.address().address;
    var port = server.address().port;
    console.log("Example app listening at http://%s:%s", host, port)

});
