var Rating = function() {};


Rating.prototype.use = function( redisClient ) {
  this.client = redisClient ;
} ;

Rating.prototype.create = function(callback) {
  var self = this;
  this.client.incr("nextRatingId", function(err,reply) {
    var rating = {
      id: reply,
      name: "unnamed",
      minLabel: "low",
      maxLabel: "high",
      plotAxisDirection: "lowToHigh"
    } ;
    self.client.multi()
      .zadd( "ratingIds", 0, rating.id )
      .hmset( "rating-" + rating.id, rating )
      .exec( function(err,replies) { callback(rating.id) ; } )
      ;
  }) ;
} ;

Rating.prototype.update_field = function( ratingId, update, callback ) {
  console.info( update ) ;
  var self = this ;
  this.client.hmset( "rating-" + ratingId, update, function(err,reply) {
    callback( update ) ; 
  }); 
} ;

Rating.prototype.get = function(ratingId, callback) {
    this.client.hgetall( "rating-" + ratingId, callback ) ;
} ;

Rating.prototype.getEach = function(ratingIds, callback) {
  var batch = this.client.multi() ;
  for ( var i in ratingIds )
    batch.hgetall( "rating-" + ratingIds[i] ) ;
  batch.exec( callback ) ;
} ;

Rating.prototype.all = function(callback) {
  
  function ratingList( client, cursor, batch, callback ) {
    client.zscan( 'ratingIds', cursor, function(err,reply) {
      cursor = reply[0] ;
      for ( var i=0 ; i < reply[1].length ; i+=2 ) {
        var ratingId = reply[1][i] ;
        batch.hgetall( 'rating-' + ratingId ) ;
      }
      if ( 0 == cursor ) {
        batch.exec( callback ) ;
      } else {
        ratingList( client, cursor, batch, callback ) ;
      }
    }) ;
  }
  
  ratingList( this.client, 0, this.client.multi(), callback ) ;
} ;


module.exports = new Rating() ;