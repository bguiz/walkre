var Q = require('q');
var _ = require('underscore');

var validateParallel = function(qry) {
  var errs = [];
  //TODO perform validation
  return errs;
};

var async = function(fn, qry) {
  var deferred = Q.defer();
  fn(deferred, qry);
  return deferred.promise;
};

exports.parallel = function(deferred, qry, api) {
  var validateErrs = validateParallel(qry);
  if (validateErrs.length > 0) {
    deferred.reject({
      msg: 'Invalid qryq parallel query',
      errors: validateErrs
    });
    return;
  }
  var numApiCalls = qry.length;
  var apiPromises = [];
  _.each(qry, function(line) {
    var apiQry = line.qry;
    var apiName = line.api;
    var apiFunc = api[apiName];
    if (!apiFunc) {
      apiFunc = api.noSuchApi;
      apiQry = apiName;
    }
    apiPromises.push(async(apiFunc, apiQry));
  });
  Q.allSettled(apiPromises).then(function(apiResults) {
    var out = [];
    _.each(apiResults, function(apiResult, idx) {
      var result = _.extend({
        id: qry[idx].id,
        api: qry[idx].api},
        apiResult);
      out.push(result);
    });
    deferred.resolve(out);
  });
};
