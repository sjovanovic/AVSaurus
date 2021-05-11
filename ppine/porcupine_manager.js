/*
    Copyright 2018-2020 Picovoice Inc.

    You may not use this file except in compliance with the license. A copy of the license is located in the "LICENSE"
    file accompanying this source.

    Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on
    an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
    specific language governing permissions and limitations under the License.
*/

PorcupineManager = (function () {
  let porcupineWorker;

  let frameProcessorCallback;

  let start = function (
    keywordIDs,
    sensitivities,
    detectionCallback,
    errorCallback,
    initCallback,
    porcupineWorkerScript,
    downsamplingScript,
    frameProcessor,
    readyCallback
  ) {
    
    porcupineWorker = new Worker(porcupineWorkerScript);

    let engine = this;

    console.log('Starting worker', porcupineWorkerScript, porcupineWorker)

    // ppn-init message from the worker signals that the ppn wasm has fully loaded and ready for processing
    porcupineWorker.onmessage = function (messageEvent) {

      console.log('PWorker', messageEvent.data);

      if (messageEvent.data.status === "ppn-init") {
        porcupineWorker.postMessage({
          command: "init",
          keywordIDs: keywordIDs,
          sensitivities: sensitivities,
        });

        WebVoiceProcessor.start([engine], downsamplingScript, errorCallback, function(resp){
          if(readyCallback) {
            resp.porcupineWorker = porcupineWorker
            readyCallback(resp)
          }
        });
        initCallback();
      } else {
        detectionCallback(messageEvent.data.keyword);
      }
    };

    frameProcessorCallback = frameProcessor
  };

  let stop = function () {
    WebVoiceProcessor.stop();
    porcupineWorker.postMessage({ command: "release" });
    porcupineWorker = null;
  };

  let processFrame = function (frame) {
    porcupineWorker.postMessage({ command: "process", inputFrame: frame });
    if(frameProcessorCallback) frameProcessorCallback(frame)
  };

  return { start: start, processFrame: processFrame, stop: stop };
})();
