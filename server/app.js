//a node.js server for walkre
//20130620 Brendan Graetz

var http = require('http');
var express = require('express');

var staticPages = require('./staticPages').staticPages;
var middleware = require('./middleware');
var npmPackage = require('../package.json');

var portNumber = npmPackage.config.defaults.portNumber;

process.argv.forEach(function(token) {
  var kv = token.split(':');
  if (kv.length === 2) {
    if (kv[0] === 'port') {
      portNumber = parseInt(kv[1], 10);
    }
  }
});

var server = express();
server.use(express.static(__dirname + '/../static'));

server.get('/api/echo', function(req, resp) {
  resp.contentType('application/json');
  resp.send(200, {
    query: (req.query)
  });
});

/*
e.g.
curl -i -H "Content-Type: application/json" \
  -X POST -d '{"p":[1,1,2,3,5],"a":{"b":{"c":5}}}' \
  http://localhost:9876/api/v1
*/
server.post('/api/v1', [middleware.readRequestDataAsString, middleware.acceptOnlyJson], function(req, resp) {
  var out = {
    'request': req.json
  };
  resp.send(200, JSON.stringify(out));
});

server.listen(portNumber);
console.log(npmPackage.name, 'v'+npmPackage.version, 'listening on port', portNumber);
