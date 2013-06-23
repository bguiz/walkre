var Q = require('q');
var url = require('url');
var request = require('request');
var gmaps = require('googlemaps');

var npmPackage = require('../package.json');

exports.async = function(fn, qry) {
  var deferred = Q.defer();
  fn(deferred, qry);
  return deferred.promise;
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
                  if (step.travel_mode !== currentTravelMode) {
                    ++numTravelModeSwitches;
                    if (numTravelModeSwitches > 1) {
                      travelModeSummary += '-';
                    }
                    currentTravelMode = step.travel_mode
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
