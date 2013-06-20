//a node.js server for walkre
//20130620 Brendan Graetz

var http = require('http');
var filesys = require('fs');

var server = http.createServer();

server.on('request', function(req, resp) {
  resp.writeHead({'Content-Type': 'text/event-stream'});
  filesys.readFile('../static/index.html', function(err, data) {
    resp.write(data);
    resp.end();
  })
});

server.listen(9999);
