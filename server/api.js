var Q = require('q');
var url = require('url');
var request = require('request');
var gmaps = require('googlemaps');
var fs = require('fs');

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
    deferred.resolve(body);
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

var delayInterval = 9637;
var maxDelayDeviation = 27659;
var scrapesPerGroup = 2;

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

exports.ptv = function(deferred, qry) {
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
  console.log('ptv:', urlOpts);
  request(theUrl, function(err, resp, body) {
    //TODO post processing
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    deferred.resolve(body);
  });
};
