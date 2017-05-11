/**
 * Copyright 2016 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

var path = require('path');
var fs = require('fs-extra');
var os = require('os');

var jsrsa = require('jsrsasign');
var KEYUTIL = jsrsa.KEYUTIL;

var hfc = require('fabric-client');
var copService = require('fabric-ca-client/lib/FabricCAClientImpl.js');
var User = require('fabric-client/lib/User.js');
var CryptoSuite = require('fabric-client/lib/impl/CryptoSuite_ECDSA_AES.js');
var KeyStore = require('fabric-client/lib/impl/CryptoKeyStore.js');
var ecdsaKey = require('fabric-client/lib/impl/ecdsa/key.js');
var utils = require('fabric-client/lib/utils.js');
var logger = utils.getLogger('Helper');

var config = require('/home/blockchain/Desktop/gw_config.json');

// directory for file based KeyValueStore
module.exports.KVS = '/tmp/hfc-test-kvs';
module.exports.storePathForOrg = function(org) {
    return module.exports.KVS + '_' + org;
};



// specifically set the values to defaults because they may have been overridden when
// running in the overall test bucket ('gulp test')
module.exports.resetDefaults = function() {
    global.hfc.config = undefined;
    require('nconf').reset();
};

module.exports.cleanupDir = function(keyValStorePath) {
    var absPath = path.join(process.cwd(), keyValStorePath);
    var exists = module.exports.existsSync(absPath);
    if (exists) {
        fs.removeSync(absPath);
    }
};

module.exports.getUniqueVersion = function(prefix) {
    if (!prefix) prefix = 'v';
    return prefix + Date.now();
};

// utility function to check if directory or file exists
// uses entire / absolute path from root
module.exports.existsSync = function(absolutePath /*string*/) {
    try  {
        var stat = fs.statSync(absolutePath);
        if (stat.isDirectory() || stat.isFile()) {
            return true;
        } else
            return false;
    }
    catch (e) {
        return false;
    }
};

module.exports.readFile = readFile;

function getSubmitter(client) {

    var caUrl = config.caserver.ca_url;
    var users = config.users;
    var username = users[0].username;
    var password = users[0].secret;


    return client.getUserContext(username)
            .then((user) => {

            return new Promise(
                (resolve, reject) => {
                if (user && user.isEnrolled()) {
        logger.info('Successfully loaded member from persistence');
        return resolve(user);
    }

    // need to enroll it with CA server
    var cop = new copService(caUrl);

    var member;
    return cop.enroll({
            enrollmentID: username,
            enrollmentSecret: password
        }).then((enrollment) => {
            logger.info('Successfully enrolled user \'' + username + '\'');

    member = new User(username, client);

    return member.setEnrollment(enrollment.key, enrollment.certificate,config.mspid);
}).then(() => {
        return client.setUserContext(member);
}).then(() => {
        return resolve(member);
}).catch((err) => {
        logger.error('Failed to enroll and persist user. Error: ' + err.stack ? err.stack : err);
    process.exit();
});
});
});
}

function readFile(path) {
    return new Promise((resolve, reject) => {
            fs.readFile(path, (err, data) => {
            if (!!err)
    reject(new Error('Failed to read file ' + path + ' due to error: ' + err));
else
    resolve(data);
});
});
}

module.exports.getSubmitter = function(client) {
    return getSubmitter(client);
};


module.exports.getArgs = function(chaincodeArgs) {
    var args = [];
    for (var i = 0; i < chaincodeArgs.length; i++) {
        args.push(chaincodeArgs[i]);
    }
    return args;
};