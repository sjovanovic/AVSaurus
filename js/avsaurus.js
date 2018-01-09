function AVSaurus(options) {
  var defaults = {
    'workerDir':'js'
  }
  options = options || {}
  for(var i in defaults){
    if(options[i] === undefined){
      options[i] = defaults[i]
    }
  }

  var inst = this;

  // These will be initialized later
  var recognizer, recorder, callbackManager, audioContext, detectedKeywords = 0;

  // Only when both recorder and recognizer do we have a ready application
  var isRecorderReady = isRecognizerReady = isEverythingReady = false;

  // A convenience function to post a message to the recognizer and associate
  // a callback to its response
  function postRecognizerJob(message, callback) {
    var msg = message || {};
    if (callbackManager) msg.callbackId = callbackManager.add(callback);
    if (recognizer) recognizer.postMessage(msg);
  };

  // This function initializes an instance of the recorder
  // it posts a message right away and calls onReady when it
  // is ready so that onmessage can be properly set
  function spawnWorker(workerURL, onReady) {
    recognizer = new Worker(workerURL);
    recognizer.onmessage = function(event) {
      onReady(recognizer);
    };
    // As arguments, you can pass non-default path to pocketsphinx.js and pocketsphinx.wasm:
    recognizer.postMessage({
      'pocketsphinx.wasm': 'pocketsphinx.wasm',
      'pocketsphinx.js': 'pocketsphinx.js'
    });
    //recognizer.postMessage({});
  };

  var setString = function(view, offset, str) {
    var len = str.length;
    for (var i = 0; i < len; ++i)
      view.setUint8(offset + i, str.charCodeAt(i));
  };

  /**
   * Another consumer is for recording after the wakeword
   * @type {Object}
   */
  var anotherConsumer = {
    postMessage: function(data) {
      if (data && data.command == 'process') {
        //console.log('Buffer data', data, data.data[0], data.data[1], data.data[2])
        if(inst.audioProcess){
          inst.audioProcess(data)
        }
      }
    }
  }

  // Callback function once the user authorises access to the microphone
  // in it, we instanciate the recorder
  function startUserMedia(stream) {
    var input = audioContext.createMediaStreamSource(stream);
    // Firefox hack https://support.mozilla.org/en-US/questions/984179
    window.firefox_audio_hack = input;
    inst.lastSilence = Date.now()
    var audioRecorderConfig = {
      worker: options.workerDir + '/audioRecorderWorker.js',
      errorCallback: function(er) {
        if(er == 'silent'){
          inst.lastSilence = Date.now()
        }else{
          console.log("Error from recorder: " + er);
        }
      }
    };
    recorder = new AudioRecorder(input, audioRecorderConfig);
    // If a recognizer is ready, we pass it to the recorder
    if (recognizer) recorder.consumers = [recognizer, anotherConsumer];
    isRecorderReady = true;

    if(isRecognizerReady && !isEverythingReady){
      isEverythingReady = true
      startRecording()
    }

    console.log("Audio recorder ready");
  };

  // This starts recording. We first need to get the id of the keyword search to use
  var startRecording = function(id) {
    id = id || 1
    if (recorder && recorder.start(id)) {
      console.log("Recording started");
      detectedKeywords = 0
      inst.trigger('ready')
    }
  };

  // Stops recording
  var stopRecording = function() {
    recorder && recorder.stop();
    console.log("Recording stopped");
    inst.trigger('paused')
  };

  // Called once the recognizer is ready
  // We then add the grammars to the input select tag and update the UI
  var recognizerReady = function() {
    isRecognizerReady = true;
    if(isRecorderReady && !isEverythingReady){
      isEverythingReady = true
      startRecording()
    }
    console.log("Recognizer ready");
  };

  // This adds a keyword search from the array
  // We add them one by one and call it again as
  // a callback.
  // Once we are done adding all grammars, we can call
  // recognizerReady()
  var feedKeyword = function(g, index, id) {
    if (id && (keywordIds.length > 0)) keywordIds[0].id = id.id;
    if (index < g.length) {
      keywordIds.unshift({
        title: g[index].title
      })
      postRecognizerJob({
          command: 'addKeyword',
          data: g[index].g
        },
        function(id) {
          feedKeyword(keywords, index + 1, {
            id: id
          });
        });
    } else {
      recognizerReady();
    }
  };

  // This adds words to the recognizer. When it calls back, we add grammars
  var feedWords = function(words) {
    postRecognizerJob({
        command: 'addWords',
        data: words
      },
      function() {
        feedKeyword(keywords, 0);
      });
  };

  // This initializes the recognizer. When it calls back, we add words
  var initRecognizer = function() {
    // You can pass parameters to the recognizer, such as : {command: 'initialize', data: [["-hmm", "my_model"], ["-fwdflat", "no"]]}
    // -kws_threshold - 1e-0 : strict, > 1e-50 : permissive
    postRecognizerJob({
        command: 'initialize',
        data: [
          ["-kws_threshold", options.wakewordSensitivity || "1e-80"]
        ]
      },
      function() {
        if (recorder) {
          recorder.consumers = [recognizer, anotherConsumer];
        }
        feedWords(wordList);
      });
  };


  function startWav(sampleRate, numChannels){
    this.sampleRate = sampleRate || 16000;
    this.numChannels = numChannels || 1;
    this.numSamples = 0;
    this.dataViews = [];
  }
  this.startWav = startWav
  function cleanupWav(){
    delete this.dataViews;
  }

  function addBufferToWav(buffer){
    var view = new DataView(new ArrayBuffer(buffer.byteLength)), offset = 0, x;
    for(var i=0 ;i < buffer.length; i++){
      x = buffer[i] //* 0x7fff;
      //view.setInt16(offset, x < 0 ? Math.max(x, -0x8000) : Math.min(x, 0x7fff), true);
      view.setInt16(offset, x, true);
      offset += 2
    }

    this.numSamples += buffer.byteLength;
    this.dataViews.push(view);
  }
  this.addBufferToWav = addBufferToWav;

  function getBlobFromWav(contentType){
    var dataSize = this.numChannels * this.numSamples * 2,
        view = new DataView(new ArrayBuffer(44));
    setString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    setString(view, 8, 'WAVE');
    setString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, this.numChannels, true);
    view.setUint32(24, this.sampleRate, true);
    view.setUint32(28, this.sampleRate * 4, true);
    view.setUint16(32, this.numChannels * 2, true);
    view.setUint16(34, 16, true);
    setString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    this.dataViews.unshift(view);
    var blob = new Blob(this.dataViews, { type: contentType || 'audio/wav' });
    cleanupWav()
    return blob;
  }
  this.getBlobFromWav = getBlobFromWav

  // download blob to local machine
	// example: saveData(blob, fileName)
  this.saveData = (function () {
	    var a = document.createElement("a");
	    document.body.appendChild(a);
	    return function (blob, fileName) {
	        var url = window.URL.createObjectURL(blob);
	        a.href = url;
	        a.download = fileName;
	        a.click();
	        window.URL.revokeObjectURL(url);
	    };
	}());


  this.keywordDetected = function(keyword){
    var inst = this
    this.startWav()
    this.wavStarted = true;
    this.silenceCount = 0

    console.log('Detected', keyword)

    inst.trigger('wakeword', keyword)

    this.samplingTimeout = setTimeout(function(){
      inst.wavStarted = false
      inst.sampleObtained()
    }, 10000)

  }
  this.audioProcess = function(audio){
    if(this.wavStarted){
      this.addBufferToWav(audio.data)

      // detect silence (by sampling)
      var ssum = 0, idx = 0, samples = 20, silenceThreshold = 50.0, silenceMaxLength = 5;
      for(var i=0;i<samples;i++){
        idx = Math.round(Math.random() * audio.data.length)
        ssum += Math.abs(audio.data[idx]);
      }
      //console.log('Silence', ssum / i)
      if(ssum / i < silenceThreshold){
        this.silenceCount += 1
      }else{
        this.silenceCount = 0
      }
      // if silence is detected in more than silenceMaxLength buffers
      if(this.silenceCount >= silenceMaxLength){
        clearTimeout(this.samplingTimeout)
        this.wavStarted = false
        this.silenceCount = 0
        inst.sampleObtained()
      }

      // detect silence (using the audio recorder)
      /*
      var silenceMaxLength = 5, continuityThresholdMilis = 1000;
      if(Date.now() - inst.lastSilence < continuityThresholdMilis){
        this.silenceCount += 1
      }else{
        this.silenceCount = 0
      }
      if(this.silenceCount >= silenceMaxLength){
        clearTimeout(this.samplingTimeout)
        this.silenceCount = 0
        this.wavStarted = false
        inst.sampleObtained()
      }
      */

    }
  }

  this.sampleObtained = function(){
    console.log('Sample obtained, sending...')
    inst.stopRecording()
    inst.trigger('sending')
    inst.alexaRecognize()
  }

  this.setAccessToken = function(token){
    this.accessToken = token
  }

  this.alexaRecognize = function(){

    var token = this.accessToken;

    var formData = new FormData();

    // JavaScript file-like object
    var metadata = {
        "messageHeader": {
            "deviceContext":[{
                "name":"playbackState",
                "namespace":"AudioPlayer",
                "payload":{
                    "streamId":"",
                    "offsetInMilliseconds":"0",
                    "playerActivity":"IDLE"
                }
            }]
        },
        "messageBody":{
            "profile":"alexa-close-talk",
            "locale":"en-us",
            "format":"audio/L16; rate=16000; channels=1"
        }
    }
    var content = JSON.stringify(metadata); // the body of the new file...
    var blob = new Blob([content], { type: "application/json; charset=UTF-8"});
    formData.append("request", blob, 'json');

    // audio/L16; rate=16000; channels=1
    formData.append("audio", this.getBlobFromWav('audio/L16; rate=16000; channels=1'), 'sample');

    var request = new XMLHttpRequest();
    request.responseType = "arraybuffer"
    request.open("POST", "https://access-alexa-na.amazon.com/v1/avs/speechrecognizer/recognize");
    request.setRequestHeader("Authorization", "Bearer " + token);

    request.onload = function(e) {

      if (request.status < 200 || request.status >= 300) {
        if(request.status == 403){
          // token expired
          inst.trigger('token_expired')
        }
        inst.startRecording()
        return console.error('Request failed.  Returned status of ' + request.status)
      }

      if(request.status == 204){ // no content
        inst.startRecording()
        return inst.trigger('replied')
      }

      // get boundary
      var contentType = request.getResponseHeader("Content-Type");
      var boundary = ""
      try{
        boundary = contentType.match(/boundary=(.+?)\;/)[1]
      }catch(er){}

      inst.trigger('talking')

      var sounds = []
      var arrayBuffer = request.response;
      if (arrayBuffer) {
        var byteArray = new Uint8Array(arrayBuffer);
        var sections = Multipart.parse(byteArray, boundary);
        //console.log(sections);

        for (var i = 0; i !== sections.length; ++i) {
          if (sections[i].header['content-type'] === 'audio/mpeg') {
            sounds.push(new Audio(window.URL.createObjectURL(sections[i].file)))
          }else{
            var reader = new FileReader();
            // This fires after the blob has been read/loaded.
            reader.addEventListener('loadend', (e) => {
              var text = e.srcElement.result;
              console.log('Reply text:', text);
            });
            // Start reading the blob as text.
            reader.readAsText(sections[i].file);
          }
        }
      }

      inst.playSounds(sounds, function(err){
        if(err){
          console.log('Warning: Failed to play sound', err)
          inst.confirmPlaySounds(sounds, function(err){
            if(err){
              sounds = []
              inst.startRecording()
              inst.trigger('replied')
            }
          })
        }
      })
    }

    request.send(formData);
  }

  this.playSounds = function(sounds, cb) {
    if (sounds && sounds.length > 0) {
      var i = -1;

      function playSnd() {
        i++;
        if (i == sounds.length) {
          sounds = []
          inst.startRecording()
          inst.trigger('replied')
          cb.call(inst)
          return;
        };
        sounds[i].addEventListener('ended', playSnd);
        var prms = sounds[i].play()
        if (prms) {
          prms.catch(function(err) {
            cb.call(inst, err)
          });
        }
      }
      playSnd();
    }
  }

  this.confirmPlaySounds = function(sounds, cb){
    if(inst.trigger('click_confirm', [function(){
      inst.playSounds(sounds, cb)
    }])){
      return;
    }
    var dv = document.createElement('button')
    dv.id = 'confirm_play_btn'
    dv.style.left = '10px'
    dv.innerHTML = 'Play the response'
    dv.onclick = function(){
      dv.parentNode.removeChild(dv)
      inst.playSounds(sounds, cb)
    }
    document.body.appendChild(dv)
  }

  // events minimal implementation
  this.on = function(evtName, fn){
    if(!this.events){
      this.events = {}
    }
    var npts = evtName.split('.'), there = this.events
    for(var i=0; i<npts.length; i++){
      if(!there[npts[i]]){
        if(i == npts.length - 1){
          there[npts[i]] = fn
          break;
        }else{
          there[npts[i]] = {}
        }
      }
      there = there[npts[i]]
    }
  }
  this.trigger = function(evtName, args){
    var inst = this
    if(!this.events){ return }
    var npts = evtName.split('.'), there = this.events, isRun = false
    for(var i=0; i<npts.length; i++){
      if(there[npts[i]]){
        if(i == npts.length - 1 && typeof there[npts[i]] != 'function'){
          for(var j in there[npts[i]]){
            if(typeof there[npts[i]][j] == 'function'){
              isRun = true
              there[npts[i]][j].apply(inst, args)
            }
          }
          return isRun
        }
        if(typeof there[npts[i]] == 'function'){
          isRun = true
          there[npts[i]].apply(inst, args)
        }
        there = there[npts[i]]
      }else{
        break
      }
    }
    return isRun
  }

  // generate sounds
  inst.sound = function(frequency, type, time){
    var context = inst.soundContext ? inst.soundContext : new AudioContext()
    inst.soundContext = context;
    var o = null
    var g = null
    time = time || 1.0
    // example: frequency: 440.0, type: sine | square | triangle | sawtooth, time: 1 (second)
    o = context.createOscillator()
    g = context.createGain()
    o.type = type
    o.connect(g)
    o.frequency.value = frequency
    g.connect(context.destination)

    o.start(0)

    g.gain.setValueAtTime(g.gain.value, context.currentTime);
    g.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + time)



  }


  // When the page is loaded, we spawn a new recognizer worker and call getUserMedia to
  // request access to the microphone

  function init() {
    console.log("Initializing web audio and speech recognizer, waiting for approval to access the microphone");
    callbackManager = new CallbackManager();
    spawnWorker(options.workerDir + "/recognizer.js", function(worker) {
      // This is the onmessage function, once the worker is fully loaded
      worker.onmessage = function(e) {

        //console.log('Recognizer: ', e.data)

        // This is the case when we have a callback id to be called
        if (e.data.hasOwnProperty('id')) {
          var clb = callbackManager.get(e.data['id']);
          var data = {};
          if (e.data.hasOwnProperty('data')){
            data = e.data.data;
          }
          if (clb){
            clb(data);
          }
        }
        // This is a case when the recognizer has a new count number
        if (e.data.hasOwnProperty('hyp')) {
          var newCount = e.data.hyp;
          if (e.data.hasOwnProperty('final') && e.data.final) {
            newCount = "Final: " + newCount;
          }
          //console.log(newCount);
        }

        // this triggers each time new keyword is recognized
        if (e.data.hasOwnProperty('hypseg')) {
          if(e.data.hypseg.length > detectedKeywords){
            detectedKeywords = e.data.hypseg.length
            var detected = {
              'word':e.data.hypseg[0].word,
              'start':e.data.hypseg[0].start,
              'end':e.data.hypseg[0].end
            }
            if(inst.keywordDetected){
              inst.keywordDetected(detected)
            }
          }
        }

        // This is the case when we have an error
        if (e.data.hasOwnProperty('status') && (e.data.status == "error")) {
          console.log("Error in " + e.data.command + " with code " + e.data.code);
        }
      };
      // Once the worker is fully loaded, we can call the initialize function
      initRecognizer();
    });

    // The following is to initialize Web Audio
    try {
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
      window.URL = window.URL || window.webkitURL;
      audioContext = new AudioContext();
    } catch (e) {
      console.log("Error initializing Web Audio browser");
    }
    if (navigator.getUserMedia) {
      navigator.getUserMedia({
        audio: true
      }, startUserMedia, function(e) {
        console.log("No live audio input in this browser");
      });
    } else {
      console.log("No web audio support in this browser");
    }
  };

  // This is the list of words that need to be added to the recognizer
  // This follows the CMU dictionary format
  /*
  var wordList = [["ONE", "W AH N"], ["TWO", "T UW"], ["THREE", "TH R IY"], ["FOUR", "F AO R"], ["FIVE", "F AY V"], ["SIX", "S IH K S"], ["SEVEN", "S EH V AH N"], ["EIGHT", "EY T"], ["NINE", "N AY N"], ["ZERO", "Z IH R OW"], ["NEW-YORK", "N UW Y AO R K"], ["NEW-YORK-CITY", "N UW Y AO R K S IH T IY"], ["PARIS", "P AE R IH S"] , ["PARIS(2)", "P EH R IH S"], ["SHANGHAI", "SH AE NG HH AY"], ["SAN-FRANCISCO", "S AE N F R AE N S IH S K OW"], ["LONDON", "L AH N D AH N"], ["BERLIN", "B ER L IH N"], ["SUCKS", "S AH K S"], ["ROCKS", "R AA K S"], ["IS", "IH Z"], ["NOT", "N AA T"], ["GOOD", "G IH D"], ["GOOD(2)", "G UH D"], ["GREAT", "G R EY T"], ["WINDOWS", "W IH N D OW Z"], ["LINUX", "L IH N AH K S"], ["UNIX", "Y UW N IH K S"], ["MAC", "M AE K"], ["AND", "AE N D"], ["AND(2)", "AH N D"], ["O", "OW"], ["S", "EH S"], ["X", "EH K S"]];
  var keywords = [{title: "SIX", g: "SIX"}, {title: "ROCKS", g: "ROCKS"}, {title: "GREAT", g: "GREAT"}];
  var keywordIds = [];
  */


  // K AH M P Y UW T ER .
  var wordList = [
    ["COMPUTER", "K AH M P Y UW T ER"]
  ];
  var keywords = [{
    title: "COMPUTER",
    g: "COMPUTER"
  }];
  var keywordIds = [];

  // add wakewords
  /**
   *
   {
     'wakewords':[{
       id:'COMPUTER',
       pronounce: 'K AH M P Y UW T ER' // from http://www.speech.cs.cmu.edu/cgi-bin/cmudict
     }]
   }
   */
  if(options.wakewords){
    wordList = []
    keywords = []
    var id, pro
    for(var i in options.wakewords){
      id = options.wakewords[i].id, pro = options.wakewords[i].pronounce
      wordList.push([id, pro])
      keywords.push({
        title: id,
        g: id
      })
    }
  }



  // expose to public
  this.startRecording = startRecording
  this.stopRecording = stopRecording


  init()
}
