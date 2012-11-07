// SSL Certificates
var fs = require('fs');

var options = {key:  fs.readFileSync('certs/privatekey.pem').toString(),
			   cert: fs.readFileSync('certs/certificate.pem').toString(),
			   ca:  [fs.readFileSync('certs/certrequest.csr').toString()]};

// Get AppFog port, or set 8001 as default one
var port = process.env.VMC_APP_PORT || 8001;

// HTTP server
function requestListener(req, res)
{
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.write('This is a SimpleSignaling handshake server. You can get a copy ');
  res.write('of the source code at ');
  res.end  ('<a href="https://github.com/piranna/SimpleSignaling">GitHub</a>');
}

var server = require('http').createServer(requestListener);
//var server = require('https').createServer(options, requestListener);
    server.listen(port);

// Handshake server
var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({server: server});

// Maximum number of connection to manage simultaneously before start clossing
var MAX_PENDING_SOCKETS = 64;
var MAX_SOCKETS = 1024;

//Array to store connections (we want to remove them later on insertion order)
wss.pending_sockets = [];
wss.sockets = [];

function find(sockets, socketId)
{
    for(var i=0, socket; socket = sockets[i]; i++)
    {
        if(socket.id == socketId)
            return socket;
    }
}

wss.on('connection', function(socket)
{
    // Message received
    socket.onmessage = function(message)
    {
        message = JSON.parse(message.data);

        var uid = message[0];

        var soc = find(wss.sockets, uid);

        // UID registration
        if(message.length == 1)
        {
            // Check if we are trying to use a yet registered UID
            if(soc)
            {
                // It's the same socket, update the UID
                if(socket == soc)
                    socket.uid = uid;

                // Trying to set the UID of a different socket, raise error
                else
                {
//                  socket.send(JSON.stringify([uid, 'Yet registered']));
                    console.warn(uid+' is yet registered');
                }
            }

            // Socket want to register for the first time
            else
            {
                // Close the oldest sockets if we are managing too much
                // (we earn some memory)
                while(wss.sockets.length >= MAX_SOCKETS)
                    wss.sockets[0].close();

                // Set the socket UID
                socket.uid = uid;

                // Start managing the new socket
                var index = wss.pending_sockets.indexOf(socket);
                wss.pending_sockets.splice(index, 1);
                wss.sockets.push(socket);

//                console.log("Connected socket.uid: "+socket.uid);
            }
        }

        // Forward message
        else if(soc)
        {
            message[1] = socket.uid;

            soc.send(JSON.stringify(message));
        }

        // Trying to send a message to a non-connected peer, raise error
        else
        {
//            socket.send(JSON.stringify([uid, 'Not connected']));
            console.warn(socket.uid+' -> '+uid);
        }
    };

    socket.onclose = function()
    {
        wss.pending_sockets.splice(wss.pending_sockets.indexOf(socket), 1);
        wss.sockets.splice(wss.sockets.indexOf(socket), 1);
    };

    // Close the oldest pending sockets if we are managing too much (we earn
    // memory)
    while(wss.pending_sockets.length >= MAX_PENDING_SOCKETS)
        wss.pending_sockets[0].close();

    // Set the new socket as pending
    wss.pending_sockets.push(socket);
});