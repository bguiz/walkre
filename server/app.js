//a node.js server for walkre
//20130620 Brendan Graetz

var http = require('http');
var express = require('express');

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
  -d '[{"name":"geoLookup","qry":{"q":"123 abc"}},{"name":"doesntExist","qry":"doesnt matter"}]' \
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
  for (var idx = 0; idx < req.json.length; ++idx) {
    var apiCall = req.json[idx];
    var apiName = apiCall.name;
    var apiQry = apiCall.qry;
    var apiFn = api[apiName];
    if (apiFn) {
      out.response[idx] = apiFn(apiQry);
    }
    else {
      out.response[idx] = {
        err: 'Specified api does not exist',
        details: {
          apiName: apiName
        }
      };
    }
  }
  resp.send(200, JSON.stringify(out));
});

server.listen(portNumber);
console.log(npmPackage.name, 'v'+npmPackage.version, 'listening on port', portNumber);
