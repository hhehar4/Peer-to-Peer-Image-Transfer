var timeStamp; 
var sequenceNumber;

module.exports = {
    init: function() {
       //Set initial random values for timer
        timeStamp = Math.floor((Math.random() * 999) + 1);
        sequenceNumber = Math.floor((Math.random() * 32768) + 1);

        setInterval(() => {
            timeStamp = (timeStamp + 1) % 4294967296; //Timer increment every 10ms, mod 2^32 to reset
        }, 10);
    },

    getSequenceNumber: function() {
        sequenceNumber = (sequenceNumber + 1) % 32768; //Sequence number increment mod 2^15
        return sequenceNumber;
    },

    //Return the current timer value
    getTimestamp: function() {
        return timeStamp;
    }
};