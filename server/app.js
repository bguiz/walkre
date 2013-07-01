//a node.js server for walkre
//20130620 Brendan Graetz

var http = require('http');
var express = require('express');
var Q = require('q');

var staticPages = require('./staticPages').staticPages;
var middleware = require('./middleware');
var api = require('./api');
var locations = require('./locations');
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
server.use(express.errorHandler({ dumpExceptions: true, showStack: true }));

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

curl -i -X POST \
  -d '[{"name":"directions","qry":{"mode":"walking","fromAddress":"36 Meadow Wood Walk, Narre Warren VIC 3805","toAddress":"23 New Street, Dandenong VIC 3175"}}]' \
  http://localhost:9876/api/v1

curl -i -X POST \
  -d '[{"name":"directions","qry":{"mode":"transit","fromAddress":"6 Mirrabooka Crescent Little Bay NSW 2036","toAddress":"UNSW, High Street Kensington, NSW 2052, Australia"}}]' \
  http://localhost:9876/api/v1

curl -i -X POST \
  -d '[{"name":"melbtrans","qry":{"from":{"address":"36 Meadow Wood Walk, Narre Warren VIC 3805","lat":-38.0231307,"lon":145.3003536},"to":{"address":"Flinders Street Station, Melbourne VIC 3000, Australia","lat":-37.818289,"lon":144.967177},"date":"20130714","time":"0830"}}]' \
  http://localhost:9876/api/v1

curl -i -X POST \
  -d '[{"name":"testDagQueue","qry":{"doesnt":"matter"}}]' \
  http://localhost:9876/api/v1

curl -i -X POST \
  -d '[{"name":"testDagQueue","qry":{"doesnt":"matter"}}]' \
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

/*
e.g.

curl -i -X GET \
  http://localhost:9876/api/v1/scrapeLocations?name=supermarkets

*/
server.get('/api/v1/scrapeLocations', function(req, resp) {
  console.log('req.query=', req.query);
  var qry = locations[req.query.name];
  var promise = api.async(api.scrapeGeoLookup, qry);
  promise.then(function(result) {
    resp.send(200, JSON.stringify(result));
  });
});

/*
e.g.

curl -i -X POST \
  -d '{
        "origin":{"address":"36 Meadow Wood Walk, Narre Warren VIC 3805"},
        "journeyPlanner":"melbtrans",
        "destinations":[
          {
            "fixed":true,"class":"work","weight":0.8,"location":{"address":"19 Bourke Street, Melbourne, VIC 3000"},
            "modes":[{"form":"transit","max":{"time":2400}}]
          }
        ]
      }' \
  http://localhost:9876/api/v1/score


curl -i -X POST \
  -d '{
        "origin":{"address":"36 Meadow Wood Walk, Narre Warren VIC 3805"},
        "journeyPlanner":"melbtrans",
        "destinations":[
          {
            "fixed":true,"class":"work","weight":0.8,"location":{"address":"19 Bourke Street, Melbourne, VIC 3000"},
            "modes":[{"form":"transit","max":{"time":2400}}]
          },
          {
            "class":"supermarkets","weight":0.2,
            "modes":[{"form":"walking","weight":0.75,"max":{"distance":1000}},{"form":"driving","weight":0.25,"max":{"time":300}}]
          }
        ]
      }' \
  http://localhost:9876/api/v1/score

The above query means:

From the address `36 Meadow Wood Walk, Narre Warren VIC 3805`,
I would like to be able to get to `work` by `transit` at `19 Bourke Street, Melbourne, VIC 3000`,
and to be able to get to the nearest `supermarket` by either `walking` or `driving`.
Getting to `work` is 4 times (0.8/0.2) as important as getting to the shops.
I would like to spend at most 40 minutes getting to work.
Getting to the nearest `supermarket` by `walking` is 3 times (0.75/0.25) as important as getting there by `driving`.
I would like to spend a maximum of 5 minutes (300seconds) `driving` or a maximum of 1km (1000metres) `walking`.
... also use melbtrans for transit information (defaults if unspecified to gmaps)

Rules:

- For the query
  - The query must specify an `address`, and its value should be a street address
  - The query may optionally specify a `journeyPlanner` to use. If not specified, it defaults to using google maps.
  - The query must specify a list of `destinations`, and this must contain at least one `destination`

- For `destinations`
  - If a destination specifies `fixed` as true, it is considered a `fixed` destination. Otherwise it is comsidered a `nearest` destination.
  - `fixed` `destinations` must specify a `class` and `address`.
    - The value of `class` is arbitrary, but must be unique across all `destinations`, both `fixed` and `nearest`
    - The value of `address` is a street address
  - `nearest` `destinations` must specify a `class`. The value of `class` must match the list of known location categories.
  - If more than one `destination` is specified in the query (either `fixed` or `nearest`), all of them must specify a weight, and these weights must add up to 1.

- For `modes`
  - Each `mode` must specify a `form` and a `max`
    - The `mode` must be one of the follwing: `walking`, `driving`, `transit`
    - The `max` must specify either a `distance` or a `time`, and their values are in metres and seconds, respectively
      - If the `mode`'s `form` is `transit`, then the `max` may only specify a `time`, and `distance` is not allowed.
  - If more than one `mode` is specified for a `destination`, all of them  must specify a weight, and these weights must add up to 1.

Computation:

Simple linear arithmetic is used to compute a weighted score for the destinations.
If a maximum time is specified for a destination for a mode, the specified time is divided by the actual time taken, and scaled to 50 points.
If a maximum disatnce is specified for a destination for a mode, the specified distance is divided actual distance, and scaled to 50 points.
The score for a destination is the weighted average of the scores for the modes of that destination.
The score for the query is the weighted average of the scores for the destinations.
Using this method, of course, lends itself to the possibility that scores exceeding 100 may be achieved, and this is intentional by design.
If you do not wish for this to happen, you can of course always adjust the max distance and max time values supplied in the query.

*/

server.post('/api/v1/score', [middleware.readRequestDataAsString, middleware.acceptOnlyJson], function(req, resp) {
  var qry = req.json;
  var out = {
    'request': req.json,
    'response': {}
  };
  var promise = api.async(api.score, req.json);
  promise.then(function(result) {
    out.response = result;
    resp.send(200, JSON.stringify(out));
  }, function(reason) {
    resp.send(500, JSON.stringify({reason: reason}));
  });
});

server.listen(portNumber);
console.log(npmPackage.name, 'v'+npmPackage.version, 'listening on port', portNumber);
