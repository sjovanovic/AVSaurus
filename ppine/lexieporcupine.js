/**
 * Lexie wake word using Porcupine
 * Depends on: web_voice_processor.js, porcupine_manager.js from Porcupine repo.
 * 
 * 
 * @param {
 *   path:'./', // path to porcupine files
 *   ready: function(){}, // ready callback
 *   error: function(){}, // error callback
 *   detected: function(){} // keyword detected callback
 * } opts 
 * 
 * Usage:
 * 
 * let lexie = new LexiePorcupine({
 *     detected: function(){ console.log('Lexie Detected') }
 * })
 * 
 * lexie.start() // this must be called from user initiated event like button click
 * 
 * lexiew.stop() // to stop call this
 * 
 * 
 */


let LexiePorcupine = function(opts){
    if(!opts) opts = {}
    this.props = {
        path:'./',
        ready: function(){},
        error: function(){},
        detected: function(){},
        frameProcessor: null,
        initCallback: undefined
    }
    for(let i in opts) this.props[i] = opts[i]

    function convertBinaryStringToUint8Array(bStr) {
        var i, len = bStr.length, u8_array = new Uint8Array(len);
        for (var i = 0; i < len; i++) {
            u8_array[i] = bStr.charCodeAt(i);
        }
        return u8_array;
    }
    
    let lexieUint8 = convertBinaryStringToUint8Array(atob("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"))

    const KEYWORDS_ID = {
        "Lexie": lexieUint8
    };

    const SENSITIVITIES = new Float32Array([
        0.75, // "Lexie"
    ]);

    let inst = this
    let processCallback = function (keyword) {
        if (keyword === "Lexie") {
            inst.props.detected(keyword)
        }
    }

    let readyCallback = this.props.ready
    let audioManagerErrorCallback = this.props.error

    let start = function () {
        PorcupineManager.start(
            KEYWORDS_ID,
            SENSITIVITIES,
            processCallback,
            audioManagerErrorCallback,
            readyCallback,
            this.props.path + "porcupine_worker.js",
            this.props.path + "downsampling_worker.js",
            this.props.frameProcessor,
            this.props.initCallback
        );
    };

    let stop = function () {
        PorcupineManager.stop();
    };

    // public
    this.start = start
    this.stop = stop
}