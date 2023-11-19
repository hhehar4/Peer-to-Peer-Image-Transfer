let net = require('net');
let singleton = require('./Singleton');
let handler = require('./ClientsHandler')
let ITPpacket = require('./ITPResponse');
let Searchpacket = require('./SearchRequest');
let fs = require("fs");
var HOST = '127.0.0.1';
let peerRandPORT = handler.peerRandPORT;
var imgRandPORT = handler.imgRandPORT;
var args = process.argv.slice(2);
let recentSearchIDs = [];

net.bytesWritten = 300000;
net.bufferSize = 300000;

singleton.init();

let peerServer = net.createServer();
peerServer.listen(peerRandPORT, HOST);

let imageDB = net.createServer();
imageDB.listen(imgRandPORT, HOST);

console.log('ImageDB server is started at timestamp: '+ singleton.getTimestamp() +' and is listening on ' + HOST + ':' + imgRandPORT);

//Gets file name and table size given the folder
let peerID = __dirname.split("\\").pop().split("-")[0];
let tableSize = __dirname.split("\\").pop().split("-")[1];
let possibleRedirects = [];
let visitedRedirects = [];

//Initalize as peer server when only "node peer" is entered
if(args.length == 0) {
    console.log('This peer address is: ' + HOST + ':' + peerRandPORT + ' located at ' + peerID);

} //Initialize as peer client when additional arguments are provided
else {
    let serverAddress = args[1].split(":");
    let peerSock = new net.Socket();

    //Connect to specified address
    peerSock.connect({
        port: serverAddress[1],
        ip: serverAddress[0],
        localPort: peerRandPORT
    });
    
    //Runs once a response is received from the server
    peerSock.on("data", function(data) {
        let bitArray = []
        //Get all the incoming data
        for (const pair of data.entries()) {
            bitArray[pair[0]] = parseInt(pair[1], 10).toString(2).padStart(8, "0");
        }

        //Read the version and check if it equals 7
        let incomingVersion = parseInt(bitArray[0].substring(0, 3), 2);
        if(incomingVersion == 7) {
            //Get the rest of the incoming information from the packet
            let incomingMessageType = parseInt(bitArray[0].substring(3, 8) + bitArray[1].substring(0, 3), 2);

            //Check if it is a search packet
            if(incomingMessageType == 3) {
                let searchID = parseInt(bitArray[2].substring(0, 8), 2);
                //Check if search was recently requested, if not proceed to check for images
                if(!(recentSearchIDs.includes(searchID))) {
                    //Update recent searches table
                    if(recentSearchIDs.length == tableSize) {
                        recentSearchIDs.shift();
                    }
                    recentSearchIDs.push(searchID);

                    //Get all images saved to server
                    let images = [];
                    fs.readdirSync('./images').forEach(image => {
                        images.push(image.toLowerCase());
                    });

                    //Parse the binary and retrieve remaining field values
                    let requestedImgCount = parseInt(bitArray[1].substring(3, 8), 2);
                    let senderIDLength = parseInt(bitArray[3].substring(0, 8), 2);
                    let senderID = (data.slice(4, 4 + senderIDLength)).toString();
                    let referenceIP = parseInt(bitArray[4 + senderIDLength], 2) + '.' + parseInt(bitArray[5 + senderIDLength], 2) + '.' + parseInt(bitArray[6 + senderIDLength], 2) + '.' + parseInt(bitArray[7 + senderIDLength], 2);
                    let referencePort = parseInt(bitArray[8 + senderIDLength] + bitArray[9 + senderIDLength], 2);

                    let byteOffset = 10 + senderIDLength;
                    let foundSearchImages = [];
                    let missingSearchImages = [];
                    let fVal = 1;

                    //Get all the image names
                    for(let i = 0; i < requestedImgCount; i++) {
                        //Get the details of each file request
                        let fileExtensionCode = parseInt(bitArray[byteOffset].substring(0, 4), 2);
                        let fileNameSize = parseInt(bitArray[byteOffset].substring(4, 8) + bitArray[byteOffset + 1].substring(0, 8), 2);
                        let fileName = (data.slice(2 + byteOffset, 2 + byteOffset + fileNameSize)).toString().toLowerCase();
                        let fileExtension = "";

                        //Parse the appropriate extension give the image type field
                        if(fileExtensionCode == 1) {
                            fileExtension = "bmp";
                        } 
                        else if(fileExtensionCode == 2) {
                            fileExtension = "jpeg";
                        } 
                        else if(fileExtensionCode == 3) {
                            fileExtension = "gif";
                        } 
                        else if(fileExtensionCode == 4) {
                            fileExtension = "png";
                        } 
                        else if(fileExtensionCode == 5) {
                            fileExtension = "tiff";
                        } 
                        else if(fileExtensionCode == 15) {
                            fileExtension = "raw";
                        }

                        //Check if the specified image exists, if yes, add it to image request list otherwise add it to missing images list
                        if(images.includes(fileName + '.' + fileExtension)) {
                            foundSearchImages.push(fileName + '.' + fileExtension);
                        } 
                        else {
                            missingSearchImages.push(fileName + '.' + fileExtension);
                            fVal = 0;
                        }

                        //Change byte offset to account for the already parsed bytes within the payload
                        byteOffset = 2 + byteOffset + fileNameSize;
                    }

                    //Send found images to host through the socket infomation specified in the search packet
                    if(foundSearchImages.length > 0) {
                        ITPpacket.init(fVal, 1, foundSearchImages, foundSearchImages.length, singleton.getTimestamp(), singleton.getSequenceNumber());

                        let newImageSock = new net.Socket();
                        newImageSock.connect({
                            port: referencePort,
                            ip: referenceIP
                        });

                        newImageSock.write(ITPpacket.getPacket());

                        newImageSock.on('end', async function() {
                            newImageSock.destroy();
                        });
                    }

                    //Forward search packet containing any missing images to other peers
                    if(missingSearchImages.length > 0) {
                        Searchpacket.init(missingSearchImages, searchID, senderID, referenceIP, referencePort);
                        let peerTableList = handler.getPeerTable();

                        //Send search packet containing missing images to all local peers
                        for(let j = 0; j < peerTableList.length; j++) {
                            //Filter out the original sender
                            if(peerTableList[j].port != peerSock.remotePort) {
                                peerTableList[j].sock.write(Searchpacket.getPacket());
                            }
                        }
                    }
                }

            } else {
                //Runs for a new peer requesting to join
                let numberOfPeers = parseInt(bitArray[1].substring(3, 8) + bitArray[2].substring(0, 8), 2);
                let senderIDLength = parseInt(bitArray[3].substring(0, 8), 2);
                let senderID = (data.slice(4, 4 + senderIDLength)).toString();

                let incomingPeerTable = [];
                //Get the server's peer table from the packet
                for(let i = 0; i < numberOfPeers; i++) {
                    let peerIP = parseInt(bitArray[4 + senderIDLength + (6 * i)], 2) + '.' + parseInt(bitArray[5 + senderIDLength + (6 * i)], 2) + '.' + parseInt(bitArray[6 + senderIDLength + (6 * i)], 2) + '.' + parseInt(bitArray[7 + senderIDLength + (6 * i)], 2);
                    let peerPort = parseInt(bitArray[8 + senderIDLength + (6 * i)] + bitArray[9 + senderIDLength + (6 * i)], 2);

                    incomingPeerTable.push({host: peerIP, port: peerPort, sock: peerSock});

                    //Check if socket has already been redirected to a specific address, if not, add the address to a potential redirect list
                    if(!visitedRedirects.some(peer => ((peer.host === peerIP) && (peer.port === peerPort)))) {
                        possibleRedirects.push({host: peerIP, port: peerPort});
                    } 
                }
                
                //If accepted
                if(incomingMessageType == 1) {
                    //Display field information
                    console.log('Connected to peer ' + senderID + ':' + peerSock.remotePort + ' at timestamp: ' + singleton.getTimestamp());
                    console.log('This peer address is: ' + peerSock.localAddress + ':' + peerSock.localPort + ' located at ' + peerID );
                    console.log('Received ack from: ' + senderID + ':' + peerSock.remotePort);
                    if(numberOfPeers > 0) {
                        let displayPeerString = [];
                        for(let i = 0; i < numberOfPeers; i++) {
                            displayPeerString.push('[' + incomingPeerTable[i].host + ':' + incomingPeerTable[i].port + ']');
                        }
                        console.log('   which is peered with: ' + displayPeerString );
                    }
                    
                    //Add the server address to the client's peer table
                    handler.addPeerTable(peerSock.remoteAddress, peerSock.remotePort);
                } //If redirect
                else if(incomingMessageType == 2) {
                    //Display field information
                    console.log('Received ack from: ' + senderID + ':' + peerSock.remotePort);
                    if(numberOfPeers > 0) {
                        let displayPeerString = [];
                        for(let i = 0; i < numberOfPeers; i++) {
                            displayPeerString.push('[' + incomingPeerTable[i].host + ':' + incomingPeerTable[i].port + ']');
                        }
                        console.log('   which is peered with: ' + displayPeerString );
                    }
                    console.log('\nThe join has been declined; the auto-join process is performing ...\n');

                    //Check if there are available redirects
                    if(possibleRedirects.length > 0) {
                        //Destroy the existing connection and open a new connection to a possible redirect. Move the redirect to the visited peers
                        peerSock.destroy();
                        let redirect = possibleRedirects.shift();
                        visitedRedirects.push({host: redirect.host, port: redirect.port});
                        peerSock.connect({
                            port: redirect.port,
                            ip: redirect.host,
                            localPort: peerRandPORT
                        });
                    } 
                    else {
                        console.log('No connection possible');
                    }
                }
            }
        }
    });

    peerSock.on('error', function(err){});
}

//Handle incoming peer connections
peerServer.on('connection', function(sock) {
    handler.handlePeerClientJoining(sock);
    
    sock.on('error', function(err){});
});

//Handle incoming peer connections
imageDB.on('connection', async function(sock) {
    handler.handleImgClientJoining(sock);

    sock.on('error', function(err){});
});
