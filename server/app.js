//a node.js server for walkre
//20130620 Brendan Graetz

var http = require('http');
var express = require('express');

var staticPages = require('./staticPages').staticPages;
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

server.get('/api/v1/:entity', function(req, resp) {
  var entity = req.params.entity;
  resp.send(200, {
    entityName: entity,
    query: (req.query)
  });
});

server.listen(portNumber);
console.log(npmPackage.name, 'v'+npmPackage.version, 'listening on port', portNumber);
