let singleton = require('./Singleton');
let fs = require("fs");
var packet = new Uint8Array(8);
var payload = [];

module.exports = {

    init: function(fVal, responseType, imgList, imgCount, timeStamp, sequenceNumber) {
        //Generate the bytes in binary by parsing the incoming value and adding 0's to fill in empty space to match the bit space occupied in header
        let protocolVersion = 7;
        let byte1 = protocolVersion.toString(2).padStart(3, "0") + fVal.toString(2).padStart(1, "0") + responseType.toString(2).padStart(8, "0").substring(0, 4);
        let byte2 = responseType.toString(2).padStart(8, "0").substring(4, 8) + imgCount.toString(2).padStart(5, "0").substring(0, 4);
        let byte3 = imgCount.toString(2).padStart(5, "0").substring(4, 5) + sequenceNumber.toString(2).padStart(15, "0").substring(0, 7);
        let byte4 = sequenceNumber.toString(2).padStart(15, "0").substring(7, 15);
        let byte5 = timeStamp.toString(2).padStart(32, "0").substring(0, 8);
        let byte6 = timeStamp.toString(2).padStart(32, "0").substring(8, 16);
        let byte7 = timeStamp.toString(2).padStart(32, "0").substring(16, 24);
        let byte8 = timeStamp.toString(2).padStart(32, "0").substring(24, 32);

        packet[0] = parseInt(byte1, 2);
        packet[1] = parseInt(byte2, 2);
        packet[2] = parseInt(byte3, 2);
        packet[3] = parseInt(byte4, 2);
        packet[4] = parseInt(byte5, 2);
        packet[5] = parseInt(byte6, 2);
        packet[6] = parseInt(byte7, 2);
        packet[7] = parseInt(byte8, 2);
        
        //Loop though all requested and valid image requests
        for(let i = 0; i < imgList.length; i++) {
            //Change the file extensions to numerical value
            let fileName = imgList[i].split(".");
            let fileType = 0;

            if(fileName[1].toUpperCase() == "BMP") {
                fileType = 1;
            } 
            else if(fileName[1].toUpperCase() == "JPEG") {
                fileType = 2;
            } 
            else if(fileName[1].toUpperCase() == "GIF") {
                fileType = 3;
            } 
            else if(fileName[1].toUpperCase() == "PNG") {
                fileType = 4;
            } 
            else if(fileName[1].toUpperCase() == "TIFF") {
                fileType = 5;
            } 
            else if(fileName[1].toUpperCase() == "RAW") {
                fileType = 15;
            }
            let byte5 = fileType.toString(2).padStart(4, "0") + fileName[0].length.toString(2).padStart(12, "0").substring(0, 4);
            let byte6 = fileName[0].length.toString(2).padStart(12, "0").substring(4, 12);

            //Add the file name size and extensions to the payload
            let tempPayloadArray = [];
            tempPayloadArray[0] = parseInt(byte5, 2);
            tempPayloadArray[1] = parseInt(byte6, 2);
            let tempBuffer = [Buffer.from(tempPayloadArray)];

            //Get the file size and add it to the payload
            let stats = fs.statSync(`./images/${imgList[i]}`);
            tempBuffer = tempBuffer.concat(Buffer.alloc(2, stats.size.toString(16), 'hex'));
            
            //Add file name to payload
            tempBuffer = tempBuffer.concat(Buffer.from(fileName[0].toLowerCase()));

            //Add the file to the payload
            let imageFile = fs.readFileSync(`./images/${imgList[i]}`);
            tempBuffer = tempBuffer.concat(imageFile);
            payload[i] = Buffer.concat(tempBuffer);
        }
    },

    //--------------------------
    //getpacket: returns the entire packet
    //--------------------------
    getPacket: function() {
        // Handle packet return/concat
        let bufferList = [Buffer.from(packet)];
        bufferList = bufferList.concat(payload);
        return Buffer.concat(bufferList);
    }
};