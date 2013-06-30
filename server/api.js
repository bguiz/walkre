var Q = require('q');
var url = require('url');
var request = require('request');
var gmaps = require('googlemaps');
var fs = require('fs');
var _ = require('underscore');
var moment = require('moment');

var npmPackage = require('../package.json');

exports.async = function(fn, qry) {
  var deferred = Q.defer();
  fn(deferred, qry);
  return deferred.promise;
};

exports.delayedAsync = function(fn, qry, delayMs) {
  var deferred = Q.defer();
  setTimeout(function() {
    fn(deferred, qry);
  }, delayMs);
  return deferred.promise;
};

exports.randomDelayedAsync = function(fn, qry, minDelayMs, maxDelayMs) {
  var delayMs = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1) + minDelayMs);
  return exports.delayedAsync(fn, qry, delayMs);
};

exports.noSuchApi = function(deferred, apiCall) {
  deferred.resolve({
    err: 'Specified api does not exist',
    details: {
      apiName: apiCall.name
    }
  });
};

var nominatimDefaults = npmPackage.config.defaults.nominatim;
var googlemapsDefaults = npmPackage.config.defaults.googlemaps;

exports.geoLookup = function(deferred, qry) {
  //http://nominatim.openstreetmap.org/search
  urlOpts = {
    protocol: 'http',
    hostname: 'nominatim.openstreetmap.org',
    pathname: '/search',
    query: {
      format: 'json',
      q: qry.address,
      countrycodes: nominatimDefaults.countrycodes,
      limit: nominatimDefaults.limit
    }
  };
  var theUrl = url.format(urlOpts);
  console.log('geoLookup:', qry.address);
  request(theUrl, function(err, resp, body) {
    var result;
    //console.log('urlOpts=', urlOpts, 'err=', err, 'body=', body);
    if (err) {
      result = {
        error: err
      };
    }
    else {
      var json;
      try {
        json = JSON.parse(body);
      }
      catch (exc) {
        //do nothing, handled in finally
      }
      finally {
        if (!json) {
          json = {
            error: 'Got result, but unable to parse',
            details: {
              raw: body
            }
          };
        }
        result = json;
      }
    }
    deferred.resolve(result);
  });
};

exports.gmapsGeoLookup = function(deferred, qry) {
  console.log('gmapsGeoLookup:', qry.address);
  var handler = function(err, body) {
    //TODO error checking, handling
    _.each(body.results, function(result) {
      if (result.geometry && result.geometry.location) {
        var geo = result.geometry.location;
        if (geo.lat && geo.lng) {
          body.lat = geo.lat;
          body.lon = geo.lng;
          deferred.resolve(body);
          return;
        }
      }
    });
    deferred.reject('No geo coordinate found for address '+qry.adress);
  };
  var sensor = qry.sensor || googlemapsDefaults.sensor;
  gmaps.geocode(qry.address, handler, sensor);
};

exports.geoReverse = function(deferred, qry) {
  //http://nominatim.openstreetmap.org/reverse
  urlOpts = {
    protocol: 'http',
    hostname: 'nominatim.openstreetmap.org',
    pathname: '/reverse',
    query: {
      format: 'json',
      lat: qry.lat,
      lon: qry.lon,
      zoom: nominatimDefaults.reverseZoomLevel
    }
  };
  var theUrl = url.format(urlOpts);
  request(theUrl, function(err, resp, body) {
    var result;
    //console.log('urlOpts=', urlOpts, 'err=', err, 'body=', body);
    if (err) {
      result = {
        error: err
      };
    }
    else {
      var json;
      try {
        json = JSON.parse(body);
      }
      catch (exc) {
        //do nothing, handled in finally
      }
      finally {
        if (!json) {
          json = {
            error: 'Got result, but unable to parse',
            details: {
              raw: body
            }
          };
        }
        result = json;
      }
    }
    deferred.resolve(result);
  });
};

exports.directions = function(deferred, qry) {
  var handler = function(err, body) {
    console.log('directions err=', err, 'body=', body);
    if (err) {
      result = {
        error: err
      };
    }
    else {
      var json;
      try {
        if (typeof body === 'string') {
          json = JSON.parse(body);
        }
        else {
          //TODO proper check to check if it actually is a valid object
          json = body;
        }
      }
      catch (exc) {
        //do nothing, handled in finally
      }
      finally {
        if (json) {
          //post processing
          var summary = {
          };
          var summaryErrs = [];
          if (json.status === 'OK' && json.routes && json.routes.length > 0) {
            var legs = json.routes[0].legs;
            if (legs && legs.length > 0) {
              var leg = legs[0];
              if (leg.distance && leg.duration) {
                summary.distance = leg.distance.value; //in meters
                summary.duration = leg.duration.value; //in seconds
              }
              else {
                summaryErrs.push('No distance and duration found');
              }
              if (leg.steps && leg.steps.length > 0) {
                var steps = leg.steps;
                var travelModeSummary = '';
                var currentTravelMode = '';
                var numTravelModeSwitches = 0;
                for (var idx = 0; idx < steps.length; ++idx) {
                  var step = steps[idx];
                  var travelMode;
                  var forceSwitch = false;
                  if (step.transit_details) {
                    var line = step.transit_details.line;
                    if (line) {
                      var vehicle = line.vehicle;
                      if (vehicle) {
                        travelMode = vehicle.type;
                        forceSwitch = true;
                      }
                    }
                  }
                  if (!travelMode) {
                    travelMode = step.travel_mode;
                  }
                  if (forceSwitch || (travelMode !== currentTravelMode)) {
                    ++numTravelModeSwitches;
                    if (numTravelModeSwitches > 1) {
                      travelModeSummary += '-';
                    }
                    currentTravelMode = travelMode
                    travelModeSummary += currentTravelMode;
                  }
                }
                summary.mode = {
                  description: travelModeSummary,
                  switches: (numTravelModeSwitches - 1)
                };
              }
              else {
                summaryErrs.push('No steps found');
              }
            }
            else {
              summaryErrs.push('No legs found');
              console.log('No legs found routes=', json.routes);
            }
          }
          else {
            summaryErrs.push('No routes found');
            console.log('No routes found', json);
          }
          if (summaryErrs.length > 0) {
            summary.errors = summaryErrs;
          }
          result = {
            summary: summary,
            raw: json
          };
        }
        else {
          result = {
            error: 'Got result, but unable to parse',
            details: {
              raw: body
            }
          };
        }
      }
    }
    deferred.resolve(result);
  };
  var sensor = qry.sensor || googlemapsDefaults.sensor;
  var mode = qry.mode || googlemapsDefaults.directionsTravelMode;
  var optionalParams = {
    mode: mode
  };
  var departureTime = qry.departureTime;
  var arrivalTime = qry.arrivalTime;
  if (!departureTime && !arrivalTime && mode === 'transit') {
    //ensure that gmaps api requirement is met - when mode is transit, either the arrival time or the departure time must be specified
    departureTime = Math.round(Date.now() / 1000);
  }
  if (departureTime) {
    optionalParams.departure_time = departureTime;
  }
  if (arrivalTime) {
    optionalParams.arrival_time = arrivalTime;
  }
  console.log('optionalParams=', optionalParams);
  // NOTE This fix is required to be patched into node-googlmaps for optional parameters to be passed in this way:
  // Pull request: https://github.com/moshen/node-googlemaps/pull/24
  // Commit: https://github.com/bguiz/node-googlemaps/commit/7b462021521908070f3d8b8dfdce496a0866fb96
  gmaps.directions(qry.fromAddress, qry.toAddress, handler, sensor, optionalParams);
};

var scrapeDefaults = npmPackage.config.defaults.scrape;
var delayInterval = scrapeDefaults.delayInterval;
var maxDelayDeviation = scrapeDefaults.maxDelayDeviation;
var scrapesPerGroup = scrapeDefaults.scrapesPerGroup;

var scrapeGeoLookupGroup = function(groupInpArrSlice, groupScrapePromises, grpIdx) {
  var allGroupScrapePromise = Q.defer();
  Q.all(groupScrapePromises).then(function(groupScrapeResults) {
    var out = [];
    // console.log('groupScrapeResults=', JSON.stringify(groupScrapeResults));
    console.log('groupScrapeResults.length=', groupScrapeResults.length);
    for (var i = 0; i < groupScrapeResults.length; ++i) {
      var scrapeResult = groupScrapeResults[i];
      console.log('grpIdx=', grpIdx, 'i=', i, 'scrapeResult=', JSON.stringify(scrapeResult));
      var scrapeInp = groupInpArrSlice[i];
      console.log('scrapeInp= groupInpArrSlice['+i+']=', JSON.stringify(scrapeInp));

      var singleResult = scrapeInp; //TODO use a deep clone instead
      var selectedResult = scrapeResult.results[0]; //TODO decide what to do if there are more than one result
      if (selectedResult && selectedResult.geometry && selectedResult.geometry.location) {
        var location = selectedResult.geometry.location;
        singleResult.lat = location.lat;
        singleResult.lon = location.lng;
      }
      else {
        singleResult.lat = null;
        singleResult.lon = null;
      }
      console.log('singleResult=', JSON.stringify(singleResult));
      out.push(singleResult);
    }
    var result = JSON.stringify(out);
    console.log('result=', result);
    fs.writeFileSync('./output/results.part.'+grpIdx+'.json', result); //DEBUG only
    allGroupScrapePromise.resolve(out);
  });
  return allGroupScrapePromise.promise;
};

exports.scrapeGeoLookup = function(deferred, qry) {
  //expects qry to be an array of objects, each of which has an address property
  //the result of this will be a copy of the qry object, but with each object having a lat and lon property set on it
  var delayTime = 0;
  var delayDeviation = 0;
  var numScrapes = qry.length;
  var allGroupScrapePromises = [];

  var grpIdx = 0;
  for (var globIdx = 0; globIdx < numScrapes; globIdx += scrapesPerGroup) {
    ++grpIdx;
    var startIdx = globIdx;
    var endIdx = startIdx + scrapesPerGroup;
    if (endIdx > numScrapes) {
      endIdx = numScrapes;
    }

    var groupScrapePromises = [];
    for (var idx = startIdx; idx < endIdx; ++idx) {
      var scrapeInp = qry[idx];
      var scrapePromise = exports.randomDelayedAsync(
        exports.gmapsGeoLookup, scrapeInp, delayTime, delayTime + delayDeviation);
      groupScrapePromises.push(scrapePromise);

      delayTime += delayInterval;
      if (delayDeviation < maxDelayDeviation) {
        maxDelayDeviation += delayInterval;
      }
    }

    var groupInpArrSlice = qry.slice(startIdx, endIdx);
    var allGroupScrapePromise = scrapeGeoLookupGroup(groupInpArrSlice, groupScrapePromises, grpIdx);
    allGroupScrapePromises.push(allGroupScrapePromise);
  }

  console.log('allGroupScrapePromises.length=', allGroupScrapePromises.length);
  Q.allSettled(allGroupScrapePromises).then(function(allGroupScrapeResults) {
    //flatten an array of arrays into a single array
    var out = [];
    console.log('allGroupScrapeResults.length=', allGroupScrapeResults.length);
    console.log('allGroupScrapeResults=', allGroupScrapeResults);
    for (var i = 0; i < allGroupScrapeResults.length; ++i) {
      var state = allGroupScrapeResults[i];
      if (state.state === 'fulfilled') {
        var groupScrapeResult = state.value;
        console.log('groupScrapeResult.length=', groupScrapeResult.length);
        console.log('groupScrapeResult=', groupScrapeResult);
        for (var j = 0; j < groupScrapeResult.length; ++j) {
          var scrapeResult = groupScrapeResult[j];
          console.log('scrapeResult=', scrapeResult);
          out.push(scrapeResult);
        }
      }
      else
      {
        console.log('Group scrape', i, 'failed, reason:', state.reason);
      }
    }
    var result = JSON.stringify(out);
    console.log('result=', result);
    fs.writeFileSync('./output/results.all.json', result); //DEBUG only
    console.log('completed scrape');
    deferred.resolve(result);
  });

  // var scrapePromises = [];
  // for (var idx = 0; idx < numScrapes; ++idx) {
  //   var scrapeInp = qry[idx];
  //   scrapePromises.push(exports.randomDelayedAsync(exports.gmapsGeoLookup, scrapeInp, delayTime, delayTime + delayDeviation));
  //   delayTime += delayInterval;
  //   if (delayDeviation < maxDelayDeviation) {
  //     maxDelayDeviation += delayInterval;
  //   }
  // }
  // Q.all(scrapePromises).then(function(scrapeResults) {
  //   var out = [];
  //   console.log('scrapeResults=', scrapeResults);
  //   for (var idx = 0; idx < numScrapes; ++idx) {
  //     var scrapeResult = scrapeResults[idx];
  //     var scrapeInp = qry[idx];
  //     var selectedResult = scrapeResult.results[0];
  //     var singleResult = scrapeInp; //TODO use a deep clone instead
  //     singleResult.lat = selectedResult.geometry.location.lat;
  //     singleResult.lon = selectedResult.geometry.location.lng;
  //     out.push(singleResult);
  //   }
  //   console.log('JSON.stringify(out)=', JSON.stringify(out));
  //   fs.writeFileSync('./out.str.json', JSON.stringify(out)); //DEBUG only
  //   deferred.resolve(out);
  // });
};

exports.melbtrans = function(deferred, qry) {
  //http://melbournetransport.co/api/melbserver/search/v0.1/do.js
  urlOpts = {
    protocol: 'http',
    hostname: 'melbournetransport.co',
    pathname: '/api/melbserver/search/v0.1/do.js',
    query: {
      oname: qry.from.address,
      olat: qry.from.lat,
      olong: qry.from.lon,
      dname: qry.to.address,
      dlat: qry.to.lat,
      dlong: qry.to.lon,
      ddate: qry.date,  // '20130131'
      dtime: qry.time  // '2359'
    }
  };
  var theUrl = url.format(urlOpts);
  console.log('melbtrans:', urlOpts);
  request(theUrl, function(err, resp, body) {
    //TODO post processing
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    deferred.resolve(body);
  });
};

var parseDurationString = function(inp, delim) {
  delim = delim || /\s+/;
  var toks = inp.split(delim);
  var hash = {};
  _.each(toks, function(tok) {
    var len = tok.length;
    if (len > 1) {
      var unit = tok.substring(len - 1, len);
      var num = tok.substring(0, len - 1);
      num = parseInt(num, 10);
      hash[unit] = num;
    }
  });
  return hash;
};

exports.scoreOne = function(deferred, qry) {
  //determine which API to call
  var apiName = 'directions'; //gmaps
  if (!qry.mode.max || !(qry.mode.max.time || qry.mode.max.distance)) {
    deferred.reject('Mode must specify either a max time or distance');
    return;
  }
  if (qry.mode.form === 'transit') {
    if (!qry.mode.max.time) {
      deferred.reject('If mode form is transit, mode max can only specify time');
      return;
    }
    if (qry.journeyPlanner === 'melbtrans') {
      apiName = 'melbtrans';
    }
  }
  var transportDeferred = Q.defer();
  var apiFunc = exports[apiName];
  var transportQry;
  var timeNow = moment();
  if (apiName === 'melbtrans') {
    transportQry = {
      from: qry.origin,
      to: qry.destination,
      date: (timeNow.format('YYYYMMDD')),
      time: (timeNow.format('HHmm'))
    };
  }
  else {
    //{"mode":"walking","fromAddress":"36 Meadow Wood Walk, Narre Warren VIC 3805","toAddress":"23 New Street, Dandenong VIC 3175"}}
    transportQry = {
      mode: qry.mode.form,
      fromAddress: qry.origin.address,
      toAddress: qry.destination.address
    };
  }
  apiFunc(transportDeferred, transportQry);
  transportDeferred.promise.then(function(result) {
    var out = qry;
    if (apiName === 'melbtrans') {
      var trips = result.trips;
      if (trips && trips.length > 0) {
        //find the duration for all suggested trips and average them
        var durationSum = 0;
        _.each(trips, function(trip) {
          var durationHash = parseDurationString(trip.duration);
          var duration = moment.duration(durationHash);
          durationSum += duration.asSeconds();
        });
        var averageDuration = durationSum / trips.length;
        var score = qry.mode.max.time / averageDuration;
        out.score = score;
        deferred.resolve(out);
      }
      else {
        deferred.reject('No trips returned');
        return;
      }
    }
    else {
      //TODO parse gmaps
    }
    out.raw = result;
    deferred.resolve(out);
  });
};

exports.score = function(deferred, qry) {
  qry.journeyPlanner = qry.journeyPlanner || 'gmaps';
  var needGeo =
    (qry.journeyPlanner === 'melbtrans')
    || _.some(qry.destinations, function(destination) {
      destination.hasOwnProperty('fixed') && (destination.fixed === true);
    });
  var originPromises = [];
  var destinationPromises = [];
  if (needGeo) {
    //get geolocations for all locations present
    if (!qry.origin.lat || !qry.origin.lon) {
      var originGeoDeferred = Q.defer();
      exports.gmapsGeoLookup(originGeoDeferred, qry.origin);
      originPromises.push(originGeoDeferred.promise);
    }
    _.each(qry.destinations, function(destination) {
      var destGeoDeferred = Q.defer();
      exports.gmapsGeoLookup(destGeoDeferred, destination.location);
      destinationPromises.push(destGeoDeferred.promise);
    }, this);
  }
  var originPromisesDeferred = Q.defer();
  Q.allSettled(originPromises).then(function(results) {
    _.each(results, function(result) {
      if (result.state === 'fulfilled') {
        var val = result.value;
        qry.origin.lat = val.lat;
        qry.origin.lon = val.lon;
      }
      else {
        console.log('originPromises allSettled:', result.error);
      }
    }, this);
    originPromisesDeferred.resolve(qry.origin);
  });
  var destinationsPromisesDeferred = Q.defer();
  Q.allSettled(destinationPromises).then(function(results) {
    _.each(results, function(result, idx) {
      if (result.state === 'fulfilled') {
        var val = result.value;
        qry.destinations[idx].location.lat = val.lat;
        qry.destinations[idx].location.lon = val.lon;
      }
      else {
        console.log('destinationPromises allSettled:', result.error);
      }
    }, this);
    destinationsPromisesDeferred.resolve(qry.destinations);
  });
  Q.allSettled([originPromisesDeferred.promise, destinationsPromisesDeferred.promise]).then(function(results) {
    //we don't care about the results returned, because they were modified in place in the qry object
    //more importantly, we are now assured that all addresses have a lat and lon, if needGeo is true
    var scorePromises = [];

    //get the transport information from the origin to each destination using each transport mode
    var origin = qry.origin;
    _.each(qry.destinations, function(destination) {
      //TODO check that weights add up for destinations
      _.each(destination.modes, function(mode) {
        //we have origin, destination, and mode
        //TODO check that weights add up for modes
        //now work out the transport information between this origin and this destination using this mode
        var scoreDeferred = Q.defer();
        scorePromises.push(scoreDeferred.promise);
        exports.scoreOne(scoreDeferred, {
          origin: origin,
          destination: destination.location,
          mode: mode,
          journeyPlanner: qry.journeyPlanner
        });
      });
    }, this);

    Q.allSettled(scorePromises).then(function(scoreResults) {
      var orig_dest_mode = {};
      _.each(scoreResults, function(result) {
        if (result.state === 'fulfilled') {
          var score = result.value;
          orig_dest_mode[score.origin.address] = 
            orig_dest_mode[score.origin.address] || 
            {};
          orig_dest_mode[score.origin.address][score.destination.address] = 
            orig_dest_mode[score.origin.address][score.destination.address] || 
            {};
          orig_dest_mode[score.origin.address][score.destination.address][score.mode.form] = 
            orig_dest_mode[score.origin.address][score.destination.address][score.mode.form] || 
            {
              origin: score.origin,
              destination: score.destination,
              mode: score.mode,
              score: score.score
            };
        }
        else {
          console.log('scorePromises allSettled:', result.error);
        }
      });

      // parse weights to calculate aggregate score, iterate over original qry rather than score results,
      //in case some results are rejections
      var origin = qry.origin;
      var destinationWeightSum = 0;
      var destinationScoreSum = 0;
      var calcErrors = [];
      _.each(qry.destinations, function(destination) {
        var destinationWeight = destination.weight || 1.0;
        destinationWeightSum += destinationWeight;
        var modeWeightSum = 0;
        var modeScoreSum = 0;
        _.each(destination.modes, function(mode) {
          var modeWeight = mode.weight || 1.0;
          modeWeightSum += modeWeight;
          var modeScore = 0;
          if (
            orig_dest_mode[origin.address] &&
            orig_dest_mode[origin.address][destination.location.address] &&
            orig_dest_mode[origin.address][destination.location.address][mode.form]) {
            modeScore = orig_dest_mode[origin.address][destination.location.address][mode.form].score;
          }
          else {
            calcErrors.push('No data available for journey from '+origin.address+
              ' to '+destination.address+
              ' by '+mode.form);
          }
          modeScoreSum += (modeScore * modeWeight);
        });
        destinationScoreSum += (modeScoreSum / modeWeightSum * destinationWeight);
      });
      destinationScoreSum = destinationScoreSum / destinationWeightSum;
      //divide by weight sums to scale to 0 to 1 range

      var out = {
        score: (destinationScoreSum * 0.5),
        errors: calcErrors,
        raw: scoreResults
      };
      deferred.resolve(out);
    });
  });
  // setTimeout(function() {deferred.resolve({echo:qry})}, 1000); //DEBUG output
};

/* {
  "origin":{address":"36 Meadow Wood Walk, Narre Warren VIC 3805"},
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
} */

exports.testDagQueue = function(deferred, qry) {
    var batch = [
      {"id":"a1","depends":[],"data":{"some":"data a1"}},
      {"id":"b1","depends":["a1"],"data":{"some":"data b1"}},
      {"id":"b2","depends":["a1"],"data":{"some":"data b2"}},
      {"id":"c1","depends":["b1","b2"],"data":{"some":"data c1"}},
      {"id":"x1","depends":[],"data":{"some":"data x1"}},
    ];

    var doData = function (data, dependsResultsHash, deferred) {
      //Not real processing, simply echoes input after a delay for async simulation purposes
      var out = {
        echo: {
          data: data,
          depends: dependsResultsHash
        }
      };
      setTimeout(function() {
        deferred.resolve(out);
      }, 1000);
    };

    var doLine = function(line, linePromisesHash) {
      var lineDeferred = Q.defer();
      var dependsPromises = [];
      var depIds = line.depends;
      _.each(depIds, function(depId) {
        var dependPromise = linePromisesHash[depId];
        dependsPromises.push(dependPromise);
      });
      Q.allSettled(dependsPromises).then(function(dependsResults) {
        var dependsResultsHash = {};
        _.each(dependsResults, function(depResult, idx) {
          if (depResult.state === 'fulfilled') {
            var depId = depIds[idx];
            dependsResultsHash[depId] = depResult;
          }
        });
        doData(line.data, dependsResultsHash, lineDeferred);
      });
      return lineDeferred.promise;
    };

    var doBatch = function(batch) {
      var linePromisesHash = {};
      var linePromises = [];
      _.each(batch, function(line) {
        var linePromise = doLine(line, linePromisesHash);
        linePromises.push(linePromise);
        linePromisesHash[line.id] = linePromise;
      });
      Q.allSettled(linePromises).then(function(lineResults) {
        var out = [];
        _.each(lineResults, function(lineResult, idx) {
          var lineId = batch[idx].id;
          out.push({
            id: lineId,
            response: lineResult
          });
        });
        console.log(out);
        deferred.resolve(out);
      });
    }

    doBatch(batch);
};
