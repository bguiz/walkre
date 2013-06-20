//a node.js server for walkre
//20130620 Brendan Graetz

var http = require('http');

var server = http.createServer();

server.on('request', function(req, resp) {
  resp.writeHead(200);
  resp.write('Walkre\n');
  resp.end();
});

server.listen(9999);
