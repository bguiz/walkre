var Q = require('q');
var _ = require('underscore');

var async = function(fn, qry) {
  var deferred = Q.defer();
  fn(deferred, qry);
  return deferred.promise;
};

// errs.push('Line #'+idx+' should ');
var validateParallel = function(qry) {
  var errs = [];
  if (!(qry && _.isArray(qry) && qry.length > 0)) {
    errs.push('Query should be an array with at least one element');
  }
  else {
    _.each(qry, function(line, idx) {
      if (!(line && _.isObject(line))) {
        errs.push('Line #'+idx+' should be an object');
      }
      else {
        if (!(line.id && line.api && line.qry)) {
          errs.push('Line #'+idx+' should have an id,an api, and a qry');
        }
      }
    });
  }
  return errs;
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

var validateSequential = function(qry) {
  var errs = [];
  if (!(qry && _.isArray(qry) && qry.length > 0)) {
    errs.push('Query should be an array with at least one element');
  }
  else {
    _.each(qry, function(line, idx) {
      if (!(line && _.isObject(line))) {
        errs.push('Line #'+idx+' should be an object');
      }
      else {
        if (!(line.id && line.api && line.qry)) {
          errs.push('Line #'+idx+' should have an id,an api, and a qry');
        }
      }
    });
  }
  return errs;
};

exports.sequential = function(deferred, qry, api) {
  var validateErrs = validateSequential(qry);
  if (validateErrs.length > 0) {
    deferred.reject({
      msg: 'Invalid qryq sequential query',
      errors: validateErrs
    });
    return;
  }
  var numApiCalls = qry.length;
  var out = [];
  function sequentialLine(idx) {
    var line = qry[idx];
    var apiQry = line.qry;
    var apiName = line.api;
    var apiFunc = api[apiName];
    if (!apiFunc) {
      apiFunc = api.noSuchApi;
      apiQry = apiName;
    }
    var promise = async(apiFunc, apiQry);
    promise.then(
      function(result) {
        out.push(result);
        if (idx < numApiCalls - 1) {
          sequentialLine(idx + 1);
        }
        else {
          deferred.resolve(out);
        }
      },
      function(err) {
        deferred.reject({
          error: 'Cannot process query '+apiQry.id,
          detail: err,
          incompleteResults: out
        });
      }
    );
  }
  sequentialLine(0);
}

var validateDependent = function(qry) {
  var errs = [];
  //TODO validation
  return errs;
};

var dependentLine = function(line, apiFunc, linePromisesHash) {
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
      var depId = depIds[idx];
      if (depResult.state === 'fulfilled') {
        dependsResultsHash[depId] = depResult;
      }
      else {
        dependsResultsHash[depId] = null;
      }
    });
    var lineQryWithDepends = {};
    _.extend(
      lineQryWithDepends,
      line.qry,
      {dependsResults: dependsResultsHash}
    );
    apiFunc(lineDeferred, lineQryWithDepends);
  });
  return lineDeferred.promise;
};

exports.dependent = function(deferred, qry, api) {
  var validateErrs = validateDependent(qry);
  if (validateErrs.length > 0) {
    deferred.reject({
      msg: 'Invalid qryq dependent query',
      errors: validateErrs
    });
    return;
  }
  var linePromisesHash = {};
  var linePromises = [];
  _.each(qry, function(line) {
    var apiQry = line.qry;
    var apiName = line.api;
    var apiFunc = api[apiName];
    if (!apiFunc) {
      apiFunc = api.noSuchApi;
      apiQry = apiName;
    }
    var linePromise = dependentLine(line, apiFunc, linePromisesHash);
    linePromises.push(linePromise);
    linePromisesHash[line.id] = linePromise;
  });
  Q.allSettled(linePromises).then(function(lineResults) {
    var out = [];
    _.each(lineResults, function(lineResult, idx) {
      var lineId = qry[idx].id;
      out.push({
        id: lineId,
        response: lineResult
      });
    });
    deferred.resolve(out);
  });
};
