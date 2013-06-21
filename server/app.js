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

var defaultContentTypeMiddleware = function(defaultContentType) {
  var contentTypeMiddleware = function(req, resp, next) {
    req.headers['content-type'] = req.headers['content-type'] || defaultContentType;
    next();
  };
  return contentTypeMiddleware;
};

var maxContentLength = 1e6; //~1mb
var readRequestDataAsStringMW = function(req, resp, next) {
  console.log('readRequestDataAsStringMW');
  req.content = '';
  var contentLength = 0;
  req.on('data', function(data) {
    req.content += data;
    contentLength += data.length;
    if (contentLength > maxContentLength) {
      resp.contentType('application/json');
      resp.send(406, JSON.stringify({
        error: 'Data exceeded size limit'
      }));
      req.connection.destroy(); //without calling next()
    }
  });
  req.on('end', function() {
    next();
  });
};

var acceptOnlyJsonMW = function(req, resp, next) {
  console.log('acceptOnlyJsonMW', req.content);
  try {
    req.json = JSON.parse(req.content);
  }
  catch (exc) {
    //handled in finally block
  }
  finally {
    if (req.json) {
      next();
    }
    else
    {
      resp.contentType('application/json');
      resp.send(406, JSON.stringify({
        error: 'Data was invalid JSON'
      }));
      req.connection.destroy(); //without calling next()
    }
  }
};

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
server.post('/api/v1', [readRequestDataAsStringMW, acceptOnlyJsonMW], function(req, resp) {
  var out = {
    'request': req.json
  };
  console.log(JSON.stringify(out));
  resp.send(200, JSON.stringify(out));
});

server.listen(portNumber);
console.log(npmPackage.name, 'v'+npmPackage.version, 'listening on port', portNumber);
