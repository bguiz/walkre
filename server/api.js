var Q = require('q');
var url = require('url');
var request = require('request');

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
    console.log('urlOpts=', urlOpts, 'err=', err, 'body=', body);
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
    console.log('urlOpts=', urlOpts, 'err=', err, 'body=', body);
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
