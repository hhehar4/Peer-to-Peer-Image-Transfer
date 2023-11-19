let net = require('net');
let singleton = require('./Singleton');
let fs = require("fs");
let ITPpacket = require('./ITPResponse');
let Searchpacket = require('./SearchRequest');
let peerID = __dirname.split("\\").pop().split("-")[0];
let tableSize = __dirname.split("\\").pop().split("-")[1];
var HOST = '127.0.0.1';
var peerRandPORT = Math.floor((Math.random() * 16383) + 49152); //Generate random ephemeral port number within the range 49152 to 65535 for peer server
var imgRandPORT = Math.floor((Math.random() * 16383) + 49152); //Generate random ephemeral port number within the range 49152 to 65535 for image server
var packet = new Uint8Array(4);
let peerTable = [];
let currImgSock = [];
currImgSock.push({host: "", port: "", fullImgData: []});
let foundImages = [];
let missingImages = [];
var clientCount = 0;
var currentClient = [];
let missingBuffer = [];
let foundCounter = 0;
let semaphore = 0;
let semaphore2 = 0;

module.exports = {
    handlePeerClientJoining: function (sock) {
        let protocolVersion = 7;
        let outgoingMessageType;
        let peerTableLength = peerTable.length;
        //Check if peer table is full, if not, add the incoming connect to the peer table
        if(peerTableLength == tableSize) {
            outgoingMessageType = 2;
            console.log('\nPeer table full: ' + sock.remoteAddress + ':' + sock.remotePort + ' redirected');
        } 
        else {
            peerTable.push({host: sock.remoteAddress, port: sock.remotePort, sock: sock});
            outgoingMessageType = 1;
            console.log('\nConnected from peer ' + sock.remoteAddress + ':' + sock.remotePort);
        }
        
        //Parse the packet field information into bytes
        let byte1 = protocolVersion.toString(2).padStart(3, "0") + outgoingMessageType.toString(2).padStart(8, "0").substring(0, 5);
        let byte2 = outgoingMessageType.toString(2).padStart(8, "0").substring(5, 8) + peerTableLength.toString(2).padStart(13, "0").substring(0, 5);
        let byte3 = peerTableLength.toString(2).padStart(13, "0").substring(5, 13);
        let byte4 = peerID.length.toString(2).padStart(8, "0");

        packet[0] = parseInt(byte1, 2);
        packet[1] = parseInt(byte2, 2);
        packet[2] = parseInt(byte3, 2);
        packet[3] = parseInt(byte4, 2);

        let bufferList = [Buffer.from(packet)];
        let tempBuffer = [Buffer.from(peerID)];
        bufferList = bufferList.concat(tempBuffer);

        //Parse the peer table information into bytes for the packet
        for(let i = 0; i < peerTableLength; i++) {
            let tempPayloadArray = [];
            let splitHost = peerTable[i].host.split(".");
            //Parse the IP
            let byteIP1 = (parseInt(splitHost[0])).toString(2).padStart(8, "0");
            let byteIP2 = (parseInt(splitHost[1])).toString(2).padStart(8, "0");
            let byteIP3 = (parseInt(splitHost[2])).toString(2).padStart(8, "0");
            let byteIP4 = (parseInt(splitHost[3])).toString(2).padStart(8, "0");
            //Parse the port
            let bytePort1 = peerTable[i].port.toString(2).padStart(16, "0").substring(0, 8);
            let bytePort2 = peerTable[i].port.toString(2).padStart(16, "0").substring(8, 16);
            tempPayloadArray[0] = parseInt(byteIP1, 2);
            tempPayloadArray[1] = parseInt(byteIP2, 2);
            tempPayloadArray[2] = parseInt(byteIP3, 2);
            tempPayloadArray[3] = parseInt(byteIP4, 2);
            tempPayloadArray[4] = parseInt(bytePort1, 2);
            tempPayloadArray[5] = parseInt(bytePort2, 2);

            tempBuffer = [Buffer.from(tempPayloadArray)];

            bufferList = bufferList.concat(tempBuffer);
        }

        bufferList = Buffer.concat(bufferList);
        //Write the packet to the socket
        sock.write(bufferList);
    },

    addPeerTable: function (host, port, sock) {
        //Checks if the peer table entry already exists, if not, add the new entry to the peer table
        if(!peerTable.some(peer => ((peer.host === host) && (peer.port === port)))) {
            peerTable.push({host: host, port: port, sock: sock});
        } 
    },

    getPeerTable: function () {
        return peerTable;
    },

    handleImgClientJoining: async function (sock) {
        sock.on('data', async function(data) {
            //Parse the buffer and the binary and retrieve the field values for version and request type
            let bitArray = [];
            for (const pair of data.entries()) {
                bitArray[pair[0]] = parseInt(pair[1], 10).toString(2).padStart(8, "0");
            }

            let incomingVersion = parseInt(bitArray[0].substring(0, 3), 2);
            let requestType = parseInt(bitArray[3].substring(0, 8), 2);
            let reservedCheck = parseInt(bitArray[1].substring(0, 8) + bitArray[2].substring(0, 8), 2);

            //Check version, request Type, and reserved bytes to check if its a client or another peer
            if(incomingVersion == 7 && requestType == 0 && reservedCheck == 0 && clientCount == 0) {
                //Runs for a client
                clientCount++;
                currentClient[0] = sock;
                let timeStamp = singleton.getTimestamp();
                let sequenceNumber = singleton.getSequenceNumber();
                console.log(`\nClient-${timeStamp} is connected at timestamp: ${timeStamp}\n`);
                console.log(`ITP packet header received:`);

                //Print out the packet header in binary
                for (let i = 0; i < bitArray.length; i++) {
                    process.stdout.write(bitArray[i] + " ");
                    if(i > 0 && i % 4 == 3) {
                        console.log();
                    }
                }
                console.log("\n");

                //Parse the binary and retrieve remaining field values
                let imgCount = parseInt(bitArray[0].substring(3, 8), 2);
                foundImages = [];
                missingImages = [];
                let fileNameList = [];
                let fileExtensionList = [];
                let byteOffset = 0;
                let fVal = 1;
                let responseType = 2;

                //Get all images saved to server
                let images = [];
                fs.readdirSync('./images').forEach(image => {
                    images.push(image.toLowerCase());
                });

                //Parse individual file names
                for(let i = 1; i <= imgCount; i++) {
                    //Get the details of each file request
                    let fileExtensionCode = parseInt(bitArray[4 + byteOffset].substring(0, 4), 2);
                    let fileNameSize = parseInt(bitArray[4 + byteOffset].substring(4, 8) + bitArray[5 + byteOffset].substring(0, 8), 2);
                    let fileName = (data.slice(6 + byteOffset, 6 + byteOffset + fileNameSize)).toString().toLowerCase();
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

                    fileExtensionList.push(fileExtension);
                    fileNameList.push(fileName);

                    //Check if the specified image exists, if yes, add it to image request list otherwise add it to the list of missing images
                    if(images.includes(fileName + '.' + fileExtension)) {
                        foundImages.push(fileName + '.' + fileExtension);
                        responseType = 1;
                    } 
                    else {
                        missingImages.push(fileName + '.' + fileExtension);
                        fVal = 0;
                    }

                    //Change byte offset to account for the already parsed bytes within the payload
                    byteOffset = byteOffset + 2 + fileNameSize;
                }

                //Console display for field information
                console.log(`Client-${timeStamp} requests:`)
                console.log(`   --ITP version: ${incomingVersion}`);
                console.log(`   --Image Count: ${imgCount}`);
                console.log(`   --Request Type: Query`);
                console.log(`   --Image File Extension(s): ${fileExtensionList.toString()}`);
                console.log(`   --Image File Name(s): ${fileNameList.toString()}\n`);

                let searchID = Math.floor((Math.random() * 256) + 1);

                //Send out search packets if image is missing
                if(missingImages.length > 0) {
                    Searchpacket.init(missingImages, searchID, peerID, HOST, imgRandPORT);
                    for(let j = 0; j < peerTable.length; j++) {
                        peerTable[j].sock.write(Searchpacket.getPacket());
                    }
                }

                //If there are no missing images, send out the normal image response packet to client with the images
                if(missingImages.length == 0) {
                    //Generate return packet
                    ITPpacket.init(fVal, responseType, foundImages, foundImages.length, timeStamp, sequenceNumber);
                    sock.write(ITPpacket.getPacket());
                    sock.destroy();
                }

                sock.on('close', function(hadError) {
                    //Handle socket closing message
                    console.log(`Client-${timeStamp} closed the connection`);
                    clientCount = 0;
                });
            }

            //Return busy packet if another client attempts to join while a client is requesting
            else if(incomingVersion == 7 && requestType == 0 && reservedCheck == 0 && clientCount != 0){
                let timeStamp = singleton.getTimestamp();
                let sequenceNumber = singleton.getSequenceNumber();
                ITPpacket.init(0, 3, [], 0, timeStamp, sequenceNumber);
                sock.write(ITPpacket.getPacket());
            }

            //If 2 reserved bytes do not equal 0, it means that the incoming packet is from another peer and not a client
            else if(reservedCheck != 0) {
                //Runs on incoming image packet
                //Introduce a semaphore so multiple incoming images do not overwrite eachother
                while(((currImgSock[0].port != sock.remotePort) && (currImgSock[0].port != "")) && (semaphore == 1)){}
                semaphore = 1;
                //Collect all incoming image packets, sorted by transmission
                let tempImgInfo = currImgSock.shift();
                let tempImgArray = tempImgInfo.fullImgData;
                tempImgArray.push(data);
                currImgSock.push({host: sock.remoteAddress, port: sock.remotePort, fullImgData: tempImgArray});
                semaphore = 0;
                sock.end();

                sock.on('end', async function() {
                    //Introduce a semaphore so multiple packets are not sent
                    while(semaphore2 == 1) {}
                    semaphore2 = 1;
                    if(currImgSock[0].fullImgData.length > 0) {
                        let imgDataToSend = [];
                        let currentHeaderStartIndex = -1;
                        //Parse through all received image packets
                        for(let k = 0; k < currImgSock[0].fullImgData.length; k++) {
                            let tempBitArray = [];
                            for (const pair of currImgSock[0].fullImgData[k].entries()) {
                                tempBitArray[pair[0]] = parseInt(pair[1], 10).toString(2).padStart(8, "0");
                            } 

                            //Check if it is a start of a transmission or a continuation using the first 12 bits
                            //If it is a continuation, append it to the first packet of the transmission
                            let tempVersionCheck = parseInt(tempBitArray[0].substring(0, 3), 2);
                            let tempFValCheck = parseInt(tempBitArray[0].substring(3, 5), 2);
                            let tempResponseCheck = parseInt(tempBitArray[0].substring(4, 8) + tempBitArray[1].substring(0, 4), 2);

                            if(tempVersionCheck == 7 && tempFValCheck == 0 && tempResponseCheck == 1) {
                                currentHeaderStartIndex++;
                                imgDataToSend[currentHeaderStartIndex] = [currImgSock[0].fullImgData[k]];
                            } else {
                                imgDataToSend[currentHeaderStartIndex].push(currImgSock[0].fullImgData[k]);
                            }
                        }

                        //Loop through all packets
                        for(const imgPacket of imgDataToSend) {
                            //Combine all segments of a transmission into one
                            let allBuffersCombined = Buffer.concat(imgPacket);
                            let bitArrayPeer = [];
                            //Traverse the buffer and convert the data to binary
                            for (const pair of allBuffersCombined.entries()) {
                                bitArrayPeer[pair[0]] = parseInt(pair[1], 10).toString(2).padStart(8, "0");
                            }

                            //Get field information by parsing the array containing the bytes in binary
                            let incomingVersionPeer = parseInt(bitArrayPeer[0].substring(0, 3), 2);
                            let imgCountPeer = parseInt(bitArrayPeer[1].substring(4, 8) + bitArrayPeer[2].substring(0, 1), 2);

                            let byteOffsetPeer = 0;
                            //Parse the incoming image data within the payload
                            for(let i = 1; i <= imgCountPeer; i++) {
                                let fileExtensionCodePeer = parseInt(bitArrayPeer[8 + byteOffsetPeer].substring(0, 4), 2);
                                let fileExtensionPeer = "";
                                //Parse the appropriate extension given the image type field
                                if(fileExtensionCodePeer == 1) {
                                    fileExtensionPeer = "bmp";
                                } 
                                else if(fileExtensionCodePeer == 2) {
                                    fileExtensionPeer = "jpeg";
                                } 
                                else if(fileExtensionCodePeer == 3) {
                                    fileExtensionPeer = "gif";
                                } 
                                else if(fileExtensionCodePeer == 4) {
                                    fileExtensionPeer = "png";
                                } 
                                else if(fileExtensionCodePeer == 5) {
                                    fileExtensionPeer = "tiff";
                                } 
                                else if(fileExtensionCodePeer == 15) {
                                    fileExtensionPeer = "raw";
                                }
                                //Get the details of each file request
                                let fileNameSizePeer = parseInt(bitArrayPeer[8 + byteOffsetPeer].substring(4, 8) + bitArrayPeer[9 + byteOffsetPeer].substring(0, 8), 2);
                                let imageSizePeer = parseInt(bitArrayPeer[10 + byteOffsetPeer].substring(0, 8) + bitArrayPeer[11 + byteOffsetPeer].substring(0, 8), 2);
                                let fileNamePeer = (allBuffersCombined.slice(12 + byteOffsetPeer, 12 + byteOffsetPeer + fileNameSizePeer)).toString();
                                let imageFilePeer = (allBuffersCombined.slice(12 + byteOffsetPeer + fileNameSizePeer, 12 + byteOffsetPeer + fileNameSizePeer + imageSizePeer));

                                //If incoming images is one of the missing images, save its data and remove it from the missing images list
                                //This ensures that duplicate incoming images are not sent
                                if(missingImages.includes(fileNamePeer + '.' + fileExtensionPeer)) {
                                    missingImages.splice(missingImages.indexOf(fileNamePeer + '.' + fileExtensionPeer), 1);
                                    missingBuffer = missingBuffer.concat(allBuffersCombined.slice(8 + byteOffsetPeer, 12 + byteOffsetPeer + fileNameSizePeer + imageSizePeer));
                                    foundCounter++;
                                }

                                //Change byte offset to account for the already parsed bytes within the payload
                                byteOffsetPeer = byteOffsetPeer + 4 + fileNameSizePeer + imageSizePeer;
                            }

                            //If all images are found, send them to client
                            if(missingImages.length == 0) {
                                let timeStamp = singleton.getTimestamp();
                                let sequenceNumber = singleton.getSequenceNumber();
                                ITPpacket.init(1, 1, foundImages, foundImages.length + foundCounter, timeStamp, sequenceNumber);
                                let tempITP = [ITPpacket.getPacket()];
                                tempITP = tempITP.concat([Buffer.concat(missingBuffer)]);
                                currentClient[0].write(Buffer.concat(tempITP));
                                currentClient[0].destroy();
                                missingBuffer = [];
                                foundCounter = 0;
                            }
                        }

                        //Reset to allow for new clients
                        sock.destroy();
                        currImgSock.shift();
                        currImgSock.push({host: "", port: "", fullImgData: []});
                    }
                    semaphore2 = 0;
                });
            }
        });        
    },

    imgRandPORT: imgRandPORT,
    peerRandPORT: peerRandPORT,
};