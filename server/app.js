//a node.js server for walkre
//20130620 Brendan Graetz

var http = require('http');

var staticPages = require('./staticPages').staticPages;

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
