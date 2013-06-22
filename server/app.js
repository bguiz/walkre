//a node.js server for walkre
//20130620 Brendan Graetz

var http = require('http');
var express = require('express');
var Q = require('q');

var staticPages = require('./staticPages').staticPages;
var middleware = require('./middleware');
var api = require('./api');
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

curl -i -X POST \
  -d '[{"name":"geoLookup","qry":{"q":"123 abc"}},{"name":"geoReverse","qry":{"lat":123.456,"lon":987.543}},{"name":"doesntExist","qry":"doesnt matter"}]' \
  http://localhost:9876/api/v1

curl -i -X POST \
  -d '[{"name":"geoLookup","qry":{"address":"36 Meadow Wood Walk, Narre Warren VIC 3805"}},{"name":"geoReverse","qry":{"lat":-38.0231307,"lon":145.3003536}}]' \
  http://localhost:9876/api/v1

*/
server.post('/api/v1', [middleware.readRequestDataAsString, middleware.acceptOnlyJson], function(req, resp) {
  if (Object.prototype.toString.call(req.json) !== '[object Array]') {
    resp.contentType('application/json');
    resp.send(406, JSON.stringify({
      error: 'Expected an array of api calls'
    }));
    return;
  }
  var out = {
    'request': req.json,
    'response': {}
  };
  var numApiCalls = req.json.length;
  var apiPromises = [];
  for (var idx = 0; idx < numApiCalls; ++idx) {
    var apiCall = req.json[idx];
    var apiName = apiCall.name;
    var apiQry = apiCall.qry;
    var apiFunc = api[apiName];
    if (!apiFunc) {
      apiFunc = api.noSuchApi;
      apiQry = apiCall;
    }
    apiPromises.push(api.async(apiFunc, apiQry));
  }
  Q.all(apiPromises).then(function(apiResults) {
    out.response = apiResults;
    resp.send(200, JSON.stringify(out));
  });
});

server.listen(portNumber);
console.log(npmPackage.name, 'v'+npmPackage.version, 'listening on port', portNumber);
