//a node.js server for walkre
//20130620 Brendan Graetz

var http = require('http');
var filesys = require('fs');

var portNumber = 9999;

process.argv.forEach(function(token) {
  var kv = token.split(':');
  if (kv.length === 2) {
    if (kv[0] === 'port') {
      portNumber = parseInt(kv[1], 10);
    }
  }
});

var server = http.createServer();

server.on('request', function(req, resp) {
  resp.writeHead({
    'Content-Type': 'text/event-stream'
  });
  filesys.readFile('../static/index.html', function(err, data) {
    resp.write(data);
    resp.end();
  })
});

server.listen(portNumber);
console.log('Listening on port', portNumber);
