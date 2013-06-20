//a node.js server for walkre
//20130620 Brendan Graetz

var http = require('http');
var filesys = require('fs');

var portNumber = 9999;

process.argv.forEach(function(token) {
  var kv = token.split(':');
  if (kv.length === 2) {
    if (kv[0] === 'port') {
      portNumber = parseInt(kv[1], 10);
    }
  }
});

var server = http.createServer();

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

server.on('request', function(req, resp) {
  var responder = staticPages[req.url];
  if (responder) {
    responder(req, resp);
  }
  else {
    staticPages.notfound(req, resp);
  }
});

server.listen(portNumber);
console.log('Listening on port', portNumber);
