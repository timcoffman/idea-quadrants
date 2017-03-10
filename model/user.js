var User = function User() {} ;

User.prototype.use = function( redisClient ) {
  this.client = redisClient ;
} ;

User.prototype.get = function(userId, callback) {
    this.client.hgetall( "user-" + userId, callback ) ;
} ;

User.prototype.all = function(callback) {
  
  function userList( client, cursor, batch, callback ) {
    client.zscan( 'userIds', cursor, function(err,reply) {
      cursor = reply[0] ;
      for ( var i=0 ; i < reply[1].length ; i+=2 ) {
        var userId = reply[1][i] ;
        batch.hmget( 'user-' + userId, 'id', 'displayName', 'email' ) ;
      }
      if ( 0 == cursor ) {
        batch.exec( function(err,replies) {
          var users = [] ;
          for ( var i in replies ) {
            users.push( {
              id: replies[i][0],
              displayName: replies[i][1],
              email: replies[i][2]
            } ) ;
          }
          callback(err,users) ;
        } ) ;
      } else {
        userList( client, cursor, batch, callback ) ;
      }
    }) ;
  }
  
  userList( this.client, 0, this.client.multi(), callback ) ;
} ;

User.prototype.find = function find( byField, withValue, callback ) {
  console.info( "searching users by " + byField + " for " + withValue ) ;
  
  function userList( client, cursor, keys, batch, callback ) {
    
    client.scan( cursor, 'MATCH', 'user-*', function(err,reply) {
      cursor = reply[0] ;
      for ( var i in reply[1] ) {
        var key = reply[1][i] ;
        keys.push( key ) ;
        batch.hget( key, byField ) ;
        console.info( "checking " + key + "...")
      }
      
      if ( 0 == cursor ) {
        batch.exec( function(err,replies) {
          for ( var i in replies ) {
            if ( replies[i] == withValue ) {
              client.hmget( keys[i], 'id', 'displayName', 'email', function(err,reply) {
                var user = {
                  id: reply[0],
                  displayName: reply[1],
                  email: reply[2]
                } ;
                callback( err, user ) ;
              }) ;
              return ;
            }
          }
          callback(null,null) ;
        } ) ;
      } else {
        userList( client, cursor, keys, batch, callback ) ;
      }
      
    }) ;
  }
    
  userList( this.client, 0, [], this.client.multi(), callback ) ;
};

User.prototype.create = function create( callback ) {
  var self = this;
  this.client.incr("nextUserId", function(err,reply) {
    var user = {
      id: reply
    };
    self.client.multi()
      .zadd( "userIds", 0, user.id )
      .hmset( "user-" + user.id, user )
      .exec( function(err,replies) { callback(user.id) ; } )
      ;
  }) ;
};

User.prototype.update_field = function( userId, update, callback ) {
  var self = this ;
  this.client.hmset( "user-" + userId, update, function(err,reply) {
    callback( update ) ; 
  }); 
} ;

module.exports = new User() ;



