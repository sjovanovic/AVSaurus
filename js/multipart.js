// multipart response parser
var Multipart = {
  parse: (function() {
    function Parser(arraybuf, boundary) {
      this.array = arraybuf;
      this.token = null;
      this.current = null;
      this.i = 0;
      this.boundary = boundary;
    }

    Parser.prototype.skipPastNextBoundary = function() {
      var boundaryIndex = 0;
      var isBoundary = false;

      while (!isBoundary) {
        if (this.next() === null) {
          return false;
        }

        if (this.current === this.boundary[boundaryIndex]) {
          boundaryIndex++;
          if (boundaryIndex === this.boundary.length) {
            isBoundary = true;
          }
        } else {
          boundaryIndex = 0;
        }
      }

      return true;
    }

    Parser.prototype.parseHeader = function() {
      var header = '';
      var _this = this;
      var skipUntilNextLine = function() {
        header += _this.next();
        while (_this.current !== '\n' && _this.current !== null) {
          header += _this.next();
        }
        if (_this.current === null) {
          return null;
        }
      };

      var hasSkippedHeader = false;
      while (!hasSkippedHeader) {
        skipUntilNextLine();
        header += this.next();
        if (this.current === '\r') {
          header += this.next(); // skip
        }

        if (this.current === '\n') {
          hasSkippedHeader = true;
        } else if (this.current === null) {
          return null;
        }
      }

      return header;
    }

    Parser.prototype.next = function() {
      if (this.i >= this.array.byteLength) {
        this.current = null;
        return null;
      }

      this.current = String.fromCharCode(this.array[this.i]);
      this.i++;
      return this.current;
    }

    function buf2String(buf) {
      var string = '';
      buf.forEach(function (byte) {
        string += String.fromCharCode(byte);
      });
      return string;
    }

    function processSections(arraybuf, sections) {
      for (var i = 0; i !== sections.length; ++i) {
        var section = sections[i];
        if (section.header['content-type'] === 'text/plain' || section.header['content-type'] === 'application/json') {
          section.text = buf2String(arraybuf.slice(section.bodyStart, section.end));
        } else {
          var imgData = arraybuf.slice(section.bodyStart, section.end);
          section.file = new Blob([imgData], {
            type: section.header['content-type']
          });
          var fileNameMatching = (/\bfilename\=\"([^\"]*)\"/g).exec(section.header['content-disposition']) || [];
          section.fileName = fileNameMatching[1] || '';
        }
        var matching = (/\bname\=\"([^\"]*)\"/g).exec(section.header['content-disposition']) || [];
        section.name = matching[1] || '';

        delete section.headerStart;
        delete section.bodyStart;
        delete section.end;
      }

      return sections;
    }

    function multiparts(arraybuf, boundary) {
      boundary = '--' + boundary;
      var parser = new Parser(arraybuf, boundary);

      var sections = [];
      while (parser.skipPastNextBoundary()) {
        var header = parser.parseHeader();

        if (header !== null) {
          var headerLength = header.length;
          var headerParts = header.trim().split('\n');

          var headerObj = {};
          for (var i = 0; i !== headerParts.length; ++i) {
            var parts = headerParts[i].split(':');
            headerObj[parts[0].trim().toLowerCase()] = (parts[1] || '').trim();
          }

          sections.push({
            'bodyStart': parser.i,
            'header': headerObj,
            'headerStart': parser.i - headerLength
          });
        }
      }

      // add dummy section for end
      sections.push({
        'headerStart': arraybuf.byteLength - boundary.length - 2 // 2 hyphens at end
      });
      for (var i = 0; i !== sections.length - 1; ++i) {
        if(i+1 === sections.length-1){
          sections[i].end = sections[i+1].headerStart
        }else{
          sections[i].end = sections[i+1].headerStart - boundary.length;
        }
        

        if (String.fromCharCode(arraybuf[sections[i].end]) === '\r' || '\n') {
          sections[i].end -= 1;
        }
        if (String.fromCharCode(arraybuf[sections[i].end]) === '\r' || '\n') {
          sections[i].end -= 1;
        }
      }
      // remove dummy section
      sections.pop();

      sections = processSections(arraybuf, sections);

      return sections;
    }

    return multiparts;
  })()
};
