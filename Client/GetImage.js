let net = require("net");
let fs = require("fs");
let open = require("open");
let ITPpacket = require("./ITPRequest");

var args = process.argv.slice(2);
let sock = new net.Socket();
let fullData = [];

//Get server ip and port from command line
let serverAddress = args[args.indexOf("-s") + 1];
if(args.indexOf("-s") == -1) {
    console.log("No address specified");
    return process.exit();
} 
let serverIP = serverAddress.substring(0, serverAddress.indexOf(':'));
let serverPort = serverAddress.substring(serverAddress.indexOf(':') + 1);

//Get protocol version from command line
if(args.indexOf("-v") == -1) {
    console.log("No version specified");
    return process.exit();
}
let protocolVersion = parseInt(args[args.indexOf("-v") + 1]);

//Get list of image names from command line
if((args.indexOf("-q") == -1) || (args.indexOf("-q") + 1 == args.indexOf("-v"))) {
    console.log("No file names specified");
    return process.exit();
} 
let imagesList = args.slice(args.indexOf("-q") + 1, args.indexOf("-v"));

ITPpacket.init(protocolVersion, imagesList);

//Connect to server, set socket timeout, write the request packet to socket
sock.connect(serverPort, serverIP);
sock.setTimeout(5000);
sock.write(ITPpacket.getBytePacket());

console.log(`Connected to ImageDB server on: ${serverAddress}\n`);

//Runs when data is received from server
sock.on('data', function(data) {
    //Get all the data from the server
    fullData.push(data);
    sock.end();
});

sock.on('end', async function() {
    console.log(`ITP packet header received:`);
    //Get the data from the array and save it into a single buffer
    let allBuffers = Buffer.concat(fullData);
    //Traverse the buffer and convert the data to binary
    let bitArray = []
    for (const pair of allBuffers.entries()) {
        bitArray[pair[0]] = parseInt(pair[1], 10).toString(2).padStart(8, "0");
    }
    
    //Print out the packet header in binary
    for (let i = 0; i < 8; i++) {
        process.stdout.write(bitArray[i] + " ");
        if(i > 0 && i % 4 == 3) {
            console.log();
        }
    }
    console.log();

    //Get field information by parsing the array containing the bytes in binary
    let incomingVersion = parseInt(bitArray[0].substring(0, 3), 2);

    let fulfilledIndicator = parseInt(bitArray[0].substring(3, 4), 2);
    if(fulfilledIndicator == 1) {
        fulfilledIndicator = "Yes";
    } else {
        fulfilledIndicator = "Partially";
    }

    let responseType = parseInt(bitArray[0].substring(4, 8) + bitArray[1].substring(0, 4), 2);
    if(responseType == 0) {
        responseType = "Query";
    } else if(responseType == 1) {
        responseType = "Found";
    } else if(responseType == 2) {
        responseType = "Not Found";
    } else {
        responseType = "Busy";
    }

    let imgCount = parseInt(bitArray[1].substring(4, 8) + bitArray[2].substring(0, 1), 2);
    let sequenceNumber = parseInt(bitArray[2].substring(1, 8) + bitArray[3].substring(0, 8), 2);
    let timeStamp = parseInt(bitArray[4] + bitArray[5] + bitArray[6] + bitArray[7], 2);

    //Console display for field information
    console.log(`Server sent:`);
    console.log(`   --ITP Version: ${incomingVersion}`);
    console.log(`   --Fulfilled: ${fulfilledIndicator}`);
    console.log(`   --Response Type: ${responseType}`);
    console.log(`   --Image Count: ${imgCount}`);
    console.log(`   --Sequence Number: ${sequenceNumber}`);
    console.log(`   --Timestamp: ${timeStamp}`);

    console.log('\nDisconnected from server');
    console.log('Connection Closed');
    
    let byteOffset = 0;
    //Parse the incoming image data within the payload
    for(let i = 1; i <= imgCount; i++) {
        let fileExtensionCode = parseInt(bitArray[8 + byteOffset].substring(0, 4), 2);
        let fileExtension = "";
        //Parse the appropriate extension given the image type field
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
        //Get the details of each file request
        let fileNameSize = parseInt(bitArray[8 + byteOffset].substring(4, 8) + bitArray[9 + byteOffset].substring(0, 8), 2);
        let imageSize = parseInt(bitArray[10 + byteOffset].substring(0, 8) + bitArray[11 + byteOffset].substring(0, 8), 2);
        let fileName = (allBuffers.slice(12 + byteOffset, 12 + byteOffset + fileNameSize)).toString();
        let imageFile = (allBuffers.slice(12 + byteOffset + fileNameSize, 12 + byteOffset + fileNameSize + imageSize));

        //Save and open the images
        fs.writeFileSync(fileName + "." + fileExtension, imageFile);
        await open(fileName + "." + fileExtension, {wait: true});
        
        //Change byte offset to account for the already parsed bytes within the payload
        byteOffset = byteOffset + 4 + fileNameSize + imageSize;
    }
});