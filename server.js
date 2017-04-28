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
var logger = utils.getLogger('connectackton application');

// Vient de helper
var copService = require('fabric-ca-client/lib/FabricCAClientImpl.js');
var User = require('fabric-client/lib/User.js');



var config = require('./config.json');

var allEventhubs = [];

var client = new hfc();
var chain;
var eventhub;
var tx_id = null;
var admin;
var nounce;
var orderer_ip;

var reponse= {
   "response" : "Hello World"
}


chain = client.newChain(config.channelID);

function disconnectEventServers() {
	for(var key in allEventhubs) {
		var eventhub = allEventhubs[key];
		if (eventhub && eventhub.isconnected()) {
			logger.debug('Disconnecting the event hub');
			eventhub.disconnect();
		}
	}
};

app.use(function(request, response, next) {
  response.header("Access-Control-Allow-Origin", "*");
  response.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});


app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname + '/web/index.html'));
});

app.get('/action.html', function(req, res) {
    res.sendFile(path.join(__dirname + '/web/action.html'));
});

app.get('/script.js', function(req, res) {
    res.sendFile(path.join(__dirname + '/web/script.js'));
});

app.get('/script2.js', function(req, res) {
    res.sendFile(path.join(__dirname + '/web/script2.js'));
});

app.post('/login', function(req, res) {
    //console.log(req.body);
	var pa=JSON.stringify(req.body);
    var bod2=pa.replace('":""}','').replace('{"','').replace(/\\\"/g,'"').replace(/\\"/g,'"');
    var con=JSON.parse(bod2);


	 hfc.newDefaultKeyValueStore({
		path: config.keyValueStore
									}).then(
	   (store) => {
		client.setStateStore(store);
		},
		(err) => {
			logger.error('Failed to set keyvaluestore ' + err.stack ? err.stack : err );
			res.status(400).send("Failed to create keyvaluestore"+err.stack);
		});
	
 //   res.setHeader('Content-Type', 'application/json');
 //	res.send(JSON.parse('{  "data" : "login sucessful"} '));

	var ca_url = "http://" + con.ca_ip + ":7054";
	var username=con.user;
	var password=con.password;
    
	return client.getUserContext(username).then(
		(user) => {
			return new Promise(
			    (resolve, reject) => {
				
				if (user && user.isEnrolled()) {
					logger.info('Successfully loaded member from persistence');
					return resolve(user);
				}
			
				// need to enroll it with CA server
				var cop = new copService(ca_url);

				var member;
				return cop.enroll({
					enrollmentID: username,
					enrollmentSecret: password
					}).then(
						(enrollment) => {
							logger.info('Successfully enrolled user \'' + username + '\'');
							member = new User(username, client);
							return member.setEnrollment(enrollment.key, enrollment.certificate,config.mspid);
						},
						(err) => {
							logger.error("Problem to enrolled to CA");
							res.status(400).send("Problem to enroll the CA "+err.stack);
							reject();
							
						}).then(
							() => {
								return client.setUserContext(member);
								}).then(
									() => {
										return resolve(member);
									}).catch(
									(err) => {
										logger.error('Failed to enroll and persist user. Error: ' + err.stack ? err.stack : err);
										res.status(400).send("Failed to get enrollement certificates "+err.stack);
									});			
				});
		}
		,
		(err) => {
			logger.error('Failed to get enrollement' + err.stack ? err.stack : err );
			res.status(400).send("Failed get enrollment"+err.stack);
		}).then(
		 	(admi) => {
				res.send("login sucessful" );
				admin=admi;	
			},
			(err) => {
				logger.info('Failed to get submitter \'admin\'');
				logger.error('Failed to get submitter \'admin\'. Error: ' + err.stack ? err.stack : err );
				res.status(400).send("Failed to get enrollement certificates "+err.stack);
			});	
});



app.post('/init', function(req, res) {
    //console.log(req.body);
	var pa=JSON.stringify(req.body);
    var bod2=pa.replace('":""}','').replace('{"','').replace(/\\\"/g,'"').replace(/\\"/g,'"');

	var con=JSON.parse(bod2);
	//console.log(con.orderer_url);

    var url="grpc://" + con.orderer_ip+":7050";


	chain.addOrderer(new Orderer(url));


    for (var i = 0; i < 1; i++) {
		chain.addPeer(new Peer(config.peers[i].peer_url));
		let eh = new EventHub();
		 eh.setPeerAddr(config.peers[i].event_url);
		 eh.connect();
		 allEventhubs.push(eh);
	}

	res.send("successful");
});



app.post('/query', function(req,res) {
	//console.log(req.body);
    var bod=JSON.stringify(req.body);
    //console.log(bod);
    var bod2=bod.replace('":""}','').replace('{"','').replace(/\\\"/g,'"').replace(/\\"/g,'"');
    //console.log(bod2);
    var bod3=JSON.parse(bod2);

 // console.log(bod3.args);
 // console.log(bod3.function);

    nonce = utils.getNonce();
	tx_id = chain.buildTransactionID(nonce, admin);

	var request = {
		chaincodeId: config.chaincodeID,
		chainId: config.channelID,
		chaincodeVersion: config.chaincodeVersion,
		txId: tx_id,
		nonce: nonce,
		fcn: bod3.function,
		args: bod3.args
	};
	// Query chaincode
	chain.queryByChaincode(request).then(
	   function(response_payloads) {
	        //console.log(response_payloads[0].toString('utf8'));
		 	res.send(response_payloads[0].toString('utf8'));		
	   }
    							   ).catch(
	   function(err) {
			logger.error('Failed to end to end test with error:' + err.stack ? err.stack : err);
			res.send('Failed to end to end test with error:' + err.stack);
	   }
        						   );
      
    
});


app.post('/invoke', function(req,res) {
    var bod=JSON.stringify(req.body);
    //console.log(bod);
    var bod2=bod.replace('":""}','').replace('{"','').replace(/\\\"/g,'"').replace(/\\"/g,'"');
    //console.log(bod2);
    var bod3=JSON.parse(bod2);
         
    logger.info('Executing Invoke');
  	nonce = utils.getNonce();
	tx_id = chain.buildTransactionID(nonce, admin);

	// send proposal to endorser
	var request = {
		chainId: config.channelID,
		chaincodeId: config.chaincodeID,
		chaincodeVersion: config.chaincodeVersion,
		fcn: bod3.function,
		args: bod3.args,
		txId: tx_id,
		nonce: nonce
	};

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

							    logger.info('transaction proposal was good');
							} else {
								logger.error('transaction proposal was bad');
							}
							all_good = all_good & one_good;
					}
					

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
							});
						});

						eventPromises.push(txPromise);
					});
					var sendPromise = chain.sendTransaction(request);
					
					return Promise.all([sendPromise].concat(eventPromises))
					.then((results) => {

					//	logger.debug(' event promise all complete and testing complete');
						return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call

					}).catch((err) => {
						logger.error('Failed to send transaction and get notifications within the timeout period.');
						res.status(400).send('Failed to send transaction and get notifications within the timeout period.');
				
					});

					} else {
						logger.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
						res.status(400).send('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');

					}
				}, 
				(err) => {
					logger.error('Failed to send proposal due to error: ' + err.stack ? err.stack : err);
					res.status(400).send('Failed to send proposal due to error: ' + err.stack ? err.stack : err);
				}
			).then(
					(response) => {
					
						if (response.status === 'SUCCESS') {
							logger.debug('Successfully sent transaction to the orderer.');
							//var answer;
		        	   		//answer=JSON.parse( ' { "status" : "ok" , "txid" : "'+tx_id+'" }');
			   				res.send(tx_id);
							//console.log('txid: '+tx_id);
						} else {
							logger.error('Failed to order the transaction. Error code: ' + response.status);
							res.status(400).send('Failed to order the transaction. Error code: ' + response.status);
						}
					
					}, 
					(err) => {
						logger.error('Failed to send transaction due to error: ' + err.stack ? err.stack : err);
						res.status(400).send('Failed to send transaction due to error: ' + err.stack ? err.stack : err);
					}
				);

       		
});




var server = app.listen(3000, "localhost",function () {

	  var host = server.address().address
	  var port = server.address().port
	  console.log("Example app listening at http://%s:%s", host, port)

});
