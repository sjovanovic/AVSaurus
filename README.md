# AVSaurus

Amazon Alexa in browser with wakeword support


## Introduction

This is JavaScript (with Web Assembly - wasm) demo implementation of the Alexa AVS client with wakeword support. There is no server side component.

The wakeword detection part was made with JavaScript/WebAssembly port of excellent [PocketSphinx](https://github.com/syl22-00/pocketsphinx.js) library. This means you can use your own wakewords. Take a look at the source code of [index.html](index.html) for details on how to do that and much more.

## Getting Started

To run this in your browser, you need to have a Alexa Voice Service application's client ID and product ID. If you don't have one, go over to [developer.amazon.com](https://developer.amazon.com) and create one.

While you're there also make sure that your app's Security Profile contains correct "Allowed origins" and "Allowed return URLs".

Once done, edit the [index.html](index.html) from this repository, search for "clientID" and "productID" and put your apps values in there.

To run the example just open it from your favourite browser (best viewd in Chrome).

Note that it won't work if you open it from the file system, you need to serve it from a web server.


## Authors

* **Slobodan Jovanovic** - *Initial work* - [sjovanovic](https://github.com/sjovanovic)


## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

## Acknowledgments

* [PocketSphinx](https://github.com/syl22-00/pocketsphinx.js) for in-browser wakeword detection
