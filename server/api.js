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

exports.add = function(deferred, qry) {
  var result = qry.a + qry.b;
  deferred.resolve(result);
};

exports.multiply = function(deferred, qry) {
  var result = qry.a * qry.b;
  deferred.resolve(result);
};

exports.test = function(deferred, qry) {
  var result = {
    obj: {
      key: 325
    },
    arr: [
      1, 1, 2, 3, 5, 8
    ]
  };
  deferred.resolve(result);
}

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

var validateScoreOne = function(qry) {
  var errs = [];
  if (!qry.mode.max || !(qry.mode.max.time || qry.mode.max.distance)) {
    errs.push('Mode must specify either a max time or distance');
  }
  if (qry.mode.form === 'transit') {
    if (!qry.mode.max.time) {
      errs.push('If mode form is transit, mode max can only specify time');
    }
  }
  return errs;
};

exports.scoreOne = function(deferred, qry) {
  var errs = validateScoreOne(qry);
  if (errs.length > 0) {
    deferred.reject({
      msg: 'Failed to score one',
      errs: errs
    });
    return;
  }
  //determine which API to call
  var apiName = (qry.journeyPlanner === 'melbtrans') ? 'melbtrans' : 'directions'; //gmaps
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
var validateScore = function(qry) {
  var validateErrs = [];
  if (!_.isObject(qry)) {
    validateErrs.push('Query must be an object');
  }
  else {
    if (!(qry.origin && _.isObject(qry.origin))) {
      validateErrs.push('Query must contain an origin');
    }
    else {
      if (!(qry.origin.address && _.isString(qry.origin.address))) {
        validateErrs.push('Query must contain an origin with an address');
      }
      if (!(qry.origin.lat && _.isNumber(qry.origin.lat))) {
        validateErrs.push('Query must contain an origin with a numeric lat');
      }
      if (!(qry.origin.lon && _.isNumber(qry.origin.lon))) {
        validateErrs.push('Query must contain an origin with a numeric lon');
      }
    }
    if (!(qry.destinations && _.isArray(qry.destinations) && qry.destinations.length > 0)) {
      validateErrs.push('Query must contain at least one destination');
    }
    else {
      var numDestinations = qry.destinations.length;
      _.each(qry.destinations, function(dest, idx) {
        if (!(dest || _.isObject(dest))) {
          validateErrs.push('Destination #'+idx+' should be an object');
        }
        else {
          if (numDestinations > 1 && !(dest.weight && _.isNumber(dest.weight))) {
            validateErrs.push('Destination #'+idx+' should specify a numeric weight as there are more than 1');
          }
          if (!dest.location) {
            validateErrs.push('Destination #'+idx+' should specify a location');
          }
          else {
            if (!(dest.location.address && _.isString(dest.location.address))) {
              validateErrs.push('Destination #'+idx+' should specify an address');
            }
            if (!(dest.location.lat && _.isNumber(dest.location.lat))) {
              validateErrs.push('Destination #'+idx+' should specify a numeric lat');
            }
            if (!(dest.location.lon && _.isNumber(dest.location.lon))) {
              validateErrs.push('Destination #'+idx+' should specify a numeric lon');
            }
          }
          if (!(dest.modes && _.isArray(dest.modes) && dest.modes.length > 0)) {
            validateErrs.push('Destination #'+idx+' should specify at least one mode');
          }
          else {
            var numModes = dest.modes.length;
            _.each(dest.modes, function(mode, modeIdx) {
              if (!(mode && _.isObject(mode))) {
                validateErrs.push('mode #'+modeIdx+' destination #'+idx+' should be an object');
              }
              else {
                if (!(mode.form &&
                      (mode.form === 'walking' || mode.form === 'driving' || mode.form === 'transit')
                  )) {
                  validateErrs.push('mode #'+modeIdx+' destination #'+idx+' should specify a mode that is one of walking, driving, or transit');
                }
                if (numModes > 1 && !(mode.weight && _.isNumber(mode.weight))) {
                  validateErrs.push('mode #'+modeIdx+' destination #'+idx+' should specify a numeric weight');
                }
                if (!(mode.max && _.isObject(mode.max))) {
                  validateErrs.push('mode #'+modeIdx+' destination #'+idx+' should specify a max that is an object');
                }
                else {
                  if (!(
                      (mode.max.time && _.isNumber(mode.max.time)) ||
                      (mode.max.distance && _.isNumber(mode.max.distance))
                    )) {
                    validateErrs.push('mode #'+modeIdx+' destination #'+idx+' should specify either a numeric time or a numeric distance in max');
                  }
                  else {
                    if (mode.form === 'transit' && mode.max.distance) {
                      validateErrs.push('mode #'+modeIdx+' destination #'+idx+' may only specify a max time if its form is transit');
                    }
                  }
                }
              }
            });
          }
        }
      });
    }
  }
  return validateErrs;
};

exports.score = function(deferred, qry) {
  var validateErrs = validateScore(qry);
  if (!validateErrs || validateErrs.length > 0) {
    deferred.reject({
      msg: 'Score could not be computed',
      errors: validateErrs
    });
    return;
  }
  qry.journeyPlanner = qry.journeyPlanner || 'gmaps';

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
  });

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
};

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
