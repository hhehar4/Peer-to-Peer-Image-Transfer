var packet = new Uint8Array(4);
var payload = [];

module.exports = {
  init: function (protocolVersion, imgList) {
    let requestType = 0; //Indicates query
    //Generate the bytes in binary by parsing the incoming value and adding 0's to fill in empty space to match the bit space occupied in header
    let byte1 = protocolVersion.toString(2).padStart(3, "0") + imgList.length.toString(2).padStart(5, "0").substring(0, 5);
    let byte4 = requestType.toString(2).padStart(8, "0").substring(0, 8);

    packet[0] = parseInt(byte1, 2);
    packet[3] = parseInt(byte4, 2);

    //Loop through all image names in the request
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

      //Add the file names and extensions to the payload
      let tempPayloadArray = [];
      tempPayloadArray[0] = parseInt(byte5, 2);
      tempPayloadArray[1] = parseInt(byte6, 2);
      let tempBuffer = [Buffer.from(tempPayloadArray)];
      tempBuffer = tempBuffer.concat(Buffer.from(fileName[0]));
      payload[i] = Buffer.concat(tempBuffer);
    }
  },

  //--------------------------
  //getBytePacket: returns the entire packet in bytes
  //--------------------------
  getBytePacket: function () {
    // enter your code here
    let bufferList = [Buffer.from(packet)];
    bufferList = bufferList.concat(payload);
    return Buffer.concat(bufferList);
  },

  //--------------------------
  //getBitPacket: returns the entire packet in bits format
  //--------------------------
  getBitPacket: function () {
    let bufferList = [Buffer.from(packet)];
    bufferList = bufferList.concat(payload);
    bufferList = Buffer.concat(bufferList);
    let bitArray = []
    for (const pair of bufferList.entries()) {
      bitArray[pair[0]] = parseInt(pair[1], 10).toString(2).padStart(8, "0");
    }
    return bitArray;
  },
};