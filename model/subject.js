var Subject = function() {};


Subject.prototype.use = function( redisClient ) {
  this.client = redisClient ;
} ;

Subject.prototype.create = function(callback) {
  var self = this;
  this.client.incr("nextSubjectId", function(err,reply) {
    var subject = {
      id: reply,
      name: "unnamed",
      description: "no description provided"
    } ;
    self.client.multi()
      .zadd( "subjectIds", 0, subject.id )
      .hmset( "subject-" + subject.id, subject )
      .exec( function(err,replies) { callback(subject.id) ; } )
      ;
  }) ;
} ;

Subject.prototype.update_field = function( subjectId, update, callback ) {
  var self = this ;
  this.client.hmset( "subject-" + subjectId, update, function(err,reply) {
    callback( update ) ; 
  }); 
} ;

Subject.prototype.get = function(subjectId, callback) {
    this.client.hgetall( "subject-" + subjectId, callback ) ;
} ;

Subject.prototype.all = function(callback) {
  
  function subjectList( client, cursor, batch, callback ) {
    client.zscan( 'subjectIds', cursor, function(err,reply) {
      cursor = reply[0] ;
      for ( var i=0 ; i < reply[1].length ; i+=2 ) {
        var subjectId = reply[1][i] ;
        batch.hgetall( 'subject-' + subjectId ) ;
      }
      if ( 0 == cursor ) {
        batch.exec( callback ) ;
      } else {
        subjectList( client, cursor, batch, callback ) ;
      }
    }) ;
  }
  
  subjectList( this.client, 0, this.client.multi(), callback ) ;
} ;


module.exports = new Subject() ;