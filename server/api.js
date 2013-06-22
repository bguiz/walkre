var Q = require('q');

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

exports.geoLookup = function(deferred, qry) {
  //simulate delay for asynchronous testing
  setTimeout(function() {
      var result = {
          geoLookupEcho: qry
        };
      deferred.resolve(result);
  }, 1500);
};

exports.geoReverse = function(deferred, qry) {
  //simulate delay for asynchronous testing
  setTimeout(function() {
      var result = {
          geoReverseEcho: qry
        };
      deferred.resolve(result);
  }, 250);
};
