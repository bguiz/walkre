//a node.js server for walkre
//20130620 Brendan Graetz

var http = require('http');
var npmPackage = require('../package.json');

var staticPages = require('./staticPages').staticPages;

var portNumber = npmPackage.config.defaults.portNumber;

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
console.log(npmPackage.name, 'v'+npmPackage.version, 'listening on port', portNumber);
