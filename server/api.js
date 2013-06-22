var npmPackage = require('../package.json');

exports.geoLookup = function(qry) {
  return {
    geoLookupEcho: qry
  };
};
