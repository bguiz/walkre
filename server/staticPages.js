var http = require('http');
var filesys = require('fs');

var staticPages = {
  '/': function(req, resp) {
    resp.writeHeader(200, {
      'Content-Type': 'text/html'
    });
    var fileReader = filesys.createReadStream('../static/index.html');
    fileReader.pipe(resp, {
      end: false
    });
    fileReader.on('end', function() {
      console.log(req.url, 'served at:',(Date.now()));
      resp.end();
    });
  },
  '/favicon.ico': function(req, resp) {
    resp.writeHeader(200, {
      'Content-Type': 'image/x-icon'
    });
    var fileReader = filesys.createReadStream('../static/favicon.ico');
    fileReader.pipe(resp);
  },
  'notfound': function(req, resp) {
    resp.writeHeader(404, {
      'Content-Type': 'text/plain'
    });
    resp.write('Could not find: ' + req.url);
    resp.end();
  }
};

exports.staticPages = staticPages;
