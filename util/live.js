var Live = function() {};


Live.prototype.use = function( redisClientFactory ) {
  this.clientFactory = redisClientFactory ;
} ;


Live.prototype.connect = function connect( socket, channel ) {
  var subscriber = this.clientFactory() ;
  
  function subscribe() {
    subscriber.subscribe(channel) ;
  }

  if ( socket.readyState != socket.OPEN )
    socket.on('open', subscribe ) ;
  else
    subscribe() ;
  
  socket.on('close', function() {
    console.info('socket closed') ;
    subscriber.unsubscribe() ;
    subscriber.quit() ;
  }) ;
  
  socket.on('message', function(msg) {
    console.log("socket message: \"" + msg + "\"" );
  });

  subscriber.on("message", function(channel, message) { socket.send( message ) ; }) ;
}


module.exports = new Live() ;