exports.defaultContentType = function(defaultContentType) {
  var contentTypeMiddleware = function(req, resp, next) {
    req.headers['content-type'] = req.headers['content-type'] || defaultContentType;
    next();
  };
  return contentTypeMiddleware;
};

var maxContentLength = 1e6; //~1mb
exports.readRequestDataAsString = function(req, resp, next) {
  console.log('readRequestDataAsStringMW');
  req.content = '';
  var contentLength = 0;
  req.on('data', function(data) {
    req.content += data;
    contentLength += data.length;
    if (contentLength > maxContentLength) {
      resp.contentType('application/json');
      resp.send(406, JSON.stringify({
        error: 'Data exceeded size limit'
      }));
      req.connection.destroy(); //without calling next()
    }
  });
  req.on('end', function() {
    next();
  });
};

exports.acceptOnlyJson = function(req, resp, next) {
  console.log('acceptOnlyJsonMW', req.content);
  try {
    req.json = JSON.parse(req.content);
  }
  catch (exc) {
    //handled in finally block
  }
  finally {
    if (req.json) {
      next();
    }
    else
    {
      resp.contentType('application/json');
      resp.send(406, JSON.stringify({
        error: 'Data was invalid JSON'
      }));
      req.connection.destroy(); //without calling next()
    }
  }
};
