var Project = function() {};


Project.prototype.use = function( redisClient ) {
  this.client = redisClient ;
} ;

Project.prototype.create = function(callback) {
  var self = this;
  this.client.incr("nextProjectId", function(err,reply) {
    var project = {
      id: reply,
      name: "unnamed"
    } ;
    self.client.multi()
      .zadd( "projectIds", 0, project.id )
      .hmset( "project-" + project.id, project )
      .exec( function(err,replies) { callback(project.id) ; } )
      ;
  }) ;
} ;

Project.prototype.update_field = function( projectId, update, callback ) {
  var self = this ;
  this.client.hmset( "project-" + projectId, update, function(err,reply) {
    callback( update ) ; 
  }); 
} ;

Project.prototype.get = function(projectId, callback) {
    this.client.hgetall( "project-" + projectId, callback ) ;
} ;

Project.prototype.all = function(callback) {
  
  function projectList( client, cursor, batch, callback ) {
    client.zscan( 'projectIds', cursor, function(err,reply) {
      cursor = reply[0] ;
      for ( var i=0 ; i < reply[1].length ; i+=2 ) {
        var projectId = reply[1][i] ;
        batch.hgetall( 'project-' + projectId ) ;
      }
      if ( 0 == cursor ) {
        batch.exec( callback ) ;
      } else {
        projectList( client, cursor, batch, callback ) ;
      }
    }) ;
  }
  
  projectList( this.client, 0, this.client.multi(), callback ) ;
} ;

Project.prototype.getRatings = function(projectId,callback) {
  function projectRatingList( client, cursor, batch, callback ) {
    client.sscan( 'project-' + projectId + '-ratingIds', cursor, function(err,reply) {
      cursor = reply[0] ; 
      for ( var i in reply[1] ) {
        var ratingId = reply[1][i] ;
        batch.hgetall( 'rating-' + ratingId ) ;
      }
      if ( 0 == cursor ) {
        batch.exec( callback ) ;
      } else {
        projectRatingList( client, cursor, batch, callback ) ;
      }
    });
  }
  
  projectRatingList( this.client, 0, this.client.multi(), callback ) ;
};

Project.prototype.addRating = function(projectId,ratingId,callback) {
  var self = this ;
  this.client.sadd( 'project-' + projectId + '-ratingIds', ratingId, function(err,reply) {
    self.client.hgetall( "rating-" + ratingId, callback ) ;
  }); 
};

Project.prototype.removeRating = function(projectId,ratingId,callback) {
  var self = this ;
  this.client.srem( 'project-' + projectId + '-ratingIds', ratingId, callback ); 
};

Project.prototype.getSubjects = function(projectId,callback) {
  function projectSubjectList( client, cursor, batch, callback ) {
    client.sscan( 'project-' + projectId + '-subjectIds', cursor, function(err,reply) {
      cursor = reply[0] ; 
      for ( var i in reply[1] ) {
        var subjectId = reply[1][i] ;
        batch.hgetall( 'subject-' + subjectId ) ;
      }
      if ( 0 == cursor ) {
        batch.exec( callback ) ;
      } else {
        projectSubjectList( client, cursor, batch, callback ) ;
      }
    });
  }
  
  projectSubjectList( this.client, 0, this.client.multi(), callback ) ;
};

Project.prototype.addSubject = function(projectId,subjectId,callback) {
  var self = this ;
  this.client.sadd( 'project-' + projectId + '-subjectIds', subjectId, function(err,reply) {
    self.client.hgetall( "subject-" + subjectId, callback ) ;
  }); 
};

Project.prototype.removeSubject = function(projectId,subjectId,callback) {
  var self = this ;
  this.client.srem( 'project-' + projectId + '-subjectIds', subjectId, callback ); 
};


Project.prototype.getParticipants = function(projectId,callback) {
  function projectUserList( client, cursor, batch, callback ) {
    client.sscan( 'project-' + projectId + '-userIds', cursor, function(err,reply) {
      cursor = reply[0] ; 
      for ( var i in reply[1] ) {
        var userId = reply[1][i] ;
        batch.hgetall( 'user-' + userId ) ;
      }
      if ( 0 == cursor ) {
        batch.exec( callback ) ;
      } else {
        projectUserList( client, cursor, batch, callback ) ;
      }
    });
  }
  
  projectUserList( this.client, 0, this.client.multi(), callback ) ;
};

Project.prototype.addParticipant = function(projectId,userId,callback) {
  var self = this ;
  this.client.sadd( 'project-' + projectId + '-userIds', userId, function(err,reply) {
    self.client.hgetall( "user-" + userId, callback ) ;
  }); 
};

Project.prototype.removeParticipant = function(projectId,userId,callback) {
  var self = this ;
  this.client.srem( 'project-' + projectId + '-userIds', userId, callback ); 
};


Project.prototype.getAnswers = function(projectId,filter,callback) {
 
  function projectAnswerList( client, cursor, answers, callback ) {
    client.hscan( 'project-' + projectId + '-answers', cursor, function(err,reply) {
      cursor = reply[0] ; 
      for ( var i=0 ; i < reply[1].length ; i+=2 ) {
        var subjectAndRatingAndUser = reply[1][i+0].split(/:/) ;
        var answer = reply[1][i+1] ;
        var subjectId = subjectAndRatingAndUser[0] ;
        var ratingId = subjectAndRatingAndUser[1] ;
        var userId = subjectAndRatingAndUser.length > 2 ? subjectAndRatingAndUser[2] : '_' ;
        
        if ( !filter( {
            subjectId: subjectId,
            ratingId: ratingId,
            participantId: userId,
            value: answer
          } ) ) continue ;
        
        //console.info( "fetching answer " + subjectId + ":" + ratingId + ":" + userId ) ;
        
        var subjectAnswers = answers[ subjectId ] ;
        if ( typeof subjectAnswers == 'undefined' )
          subjectAnswers = answers[ subjectId ] = { } ;

        var ratingAnswers = subjectAnswers[ ratingId  ] ;
        if ( typeof ratingAnswers == 'undefined' )
          ratingAnswers = subjectAnswers[ ratingId ] = { } ;
        

        ratingAnswers[ userId ] = answer ;
      }
      if ( 0 == cursor ) {
        callback( answers ) ;
      } else {
        projectAnswerList( client, cursor, answers, callback ) ;
      }
    });
  }
  
  projectAnswerList( this.client, 0, { }, callback ) ;
};

Project.prototype.addAnswer = function(projectId,subjectId,ratingId,participantId,value,callback, commit) {
  var field ;
  if ( participantId && participantId != '_' )
    field = subjectId + ':' + ratingId + ':' + participantId ;
  else
    field = subjectId + ':' + ratingId ;
  
  if ( commit ) {
    this.client.hset( 'project-' + projectId + '-answers', field, value, function(err,reply) {
        callback( value );
      });
  } else {
    callback( value );
  }
    
  this.client.publish('project-' + projectId, JSON.stringify( {
    type: 'update',
    committed: commit,
    key: { projectId: projectId, subjectId: subjectId, ratingId: ratingId, participantId: participantId },
    value: value
  } ) ) ;
};

Project.prototype.removeAnswer = function(projectId,subjectId,ratingId,participantId,callback) {
  var field ;
  if ( participantId && participantId != '_' )
    field = subjectId + ':' + ratingId + ':' + participantId ;
  else
    field = subjectId + ':' + ratingId ;
  
  var self = this ;
  this.client.hrem( 'project-' + projectId + '-answers', field, callback ); 
};


module.exports = new Project() ;