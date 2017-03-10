// server.js
// where your node app starts

// init project
var express = require('express'),
    methodOverride = require('method-override'),
    bodyParser = require('body-parser'),
    xml2js = require('xml2js'),
    crypto = require('crypto'),
    exphbs = require('express-handlebars'),
    querystring = require('querystring'),
    http = require('http'),
    url = require('url'),
    redis = require("redis"),
    expressWsConfig = require('express-ws'),
    passport = require('passport'),
    cookieParser = require('cookie-parser'),
    session = require('express-session'),
    connectRedis = require('connect-redis'),
    passportLocal = require('passport-local'),
    passportGooglePlus = require('passport-google-plus'),
    nodemailer = require('nodemailer'),
    live = require("./util/live.js"),
    user = require("./model/user.js"),
    project = require("./model/project.js"),
    subject = require("./model/subject.js"),
    rating = require("./model/rating.js")
    ;
var app = express();

app.use( methodOverride('_method') );

app.use( cookieParser(process.env.AUTH_SECRET) ) ;
app.use( bodyParser.json() );
app.use( bodyParser.urlencoded({extended: true}) );

app.use(express.static('public'));

/**************************************** WEB SOCKETS ****************************************/

var expressWs = expressWsConfig(app) ;


/**************************************** VIEW RENDERING ****************************************/

var hbs = exphbs.create({
  defaultLayout: 'single',
  //extname: '.hbr',
  helpers: {
    //wholeContext: function(x) { return x ; },
    toJSON: function(object) { return JSON.stringify(object); },
    clientId: function(provider) { return process.env[provider + '_CLIENT_ID'] ; }
  }
});



// app.set("views", __dirname + '/views/' );
app.engine('handlebars', hbs.engine ) ;
app.set("view engine", "handlebars") ;

/**************************************** PERSISTENCE ****************************************/

var client = redis.createClient( { url:process.env.REDIS_URL } ) ;
client.on("error", function (err) {
    console.log("Redis Error " + err);
});


/**************************************** AUTHENTICATION ****************************************/

var RedisStore = connectRedis(session);
app.use( session({
  store: new RedisStore( { url:process.env.REDIS_URL } ),
  secret: process.env.AUTH_SECRET,
  resave: false,
  saveUninitialized: false//,
  //cookie: { httpOnly: true, maxAge: 2419200000 }
})) ;
app.use( passport.initialize() ) ;
app.use( passport.session() ) ;

passport.serializeUser(function(userToSerialize, done) {
    // console.info( 'serializing user: ' + JSON.stringify(userToSerialize)  + " -> " + userToSerialize.id ) ;
    done(null, userToSerialize.id);
});

passport.deserializeUser(function(id, done) {
  user.get( id, function(err, deserializedUser) {
    // console.info( 'deserialized user: ' + id + " -> " + JSON.stringify(deserializedUser) ) ;
    done(null, deserializedUser);
  });
});

passport.use(
  new passportGooglePlus(
    {
      clientId: process.env.GOOGLE_PLUS_CLIENT_ID,
      clientSecret: process.env.GOOGLE_PLUS_CLIENT_SECRET
    },
    function(tokens,profile,done) {
      var access_token = tokens.access_token ;
      var id_token = tokens.id_token ;
      var token_type = tokens.token_type ; // 'Bearer'
      var displayName = profile.displayName ;
      var email = profile.email ;
      // console.info( "access_token: " + JSON.stringify(access_token) ) ;
      // console.info( "id_token: " + JSON.stringify(id_token) ) ;
      // console.info( "token_type: " + JSON.stringify(token_type) ) ;
      // console.info( "displayName: " + JSON.stringify(displayName) ) ;
      // console.info( "email: " + JSON.stringify(email) ) ;

      user.find( 'googleId', profile.id , function( err, reply ) {
        if (err)
          return done(err) ;

        if ( reply ) {

          return done(null, reply) ;

        } else {

          var newUser = {} ;
          newUser.googleId = profile.id ;
          newUser.googleToken = id_token ;
          newUser.displayName = displayName ;
          newUser.email = email ;

          user.save( newUser, function(err,reply) {
            console.info( "err: " + err ) ;
            if ( err )
              throw err ;
            return done(null, reply) ;
          }) ;
        }

      }) ;
    }
  )
)  ;

passport.use( 'local-login',
  new passportLocal(
    {
      usernameField: 'email',
      passwordField: 'token',
      passReqToCallback: true
    },
    function(request,email,token,done) {
      console.info( "local-login/email: " + JSON.stringify(email) ) ;
      console.info( "local-login/token: " + JSON.stringify(token) ) ;

      user.find( 'email', email , function( err, reply ) {
        if (err)
          return done(err) ;

        if ( !reply )
          return done(null,false) ;

        // if ( token != reply.localToken )
        //   return done(null,false) ;

        // console.info( 'returning user: ' + JSON.stringify(reply) ) ;
        return done(null, reply) ;
      }) ;
    }
  )
)  ;

passport.use( 'local-signup',
  new passportLocal(
    {
      usernameField: 'email',
      passwordField: 'token',
      passReqToCallback: true
    },
    function(request,email,token,done) {
      console.info( "local-signup/email: " + JSON.stringify(email) ) ;
      console.info( "local-signup/token: " + JSON.stringify(token) ) ;

      user.find( 'email', email , function( err, reply ) {
        if (err)
          return done(err) ;

        if ( reply ) {
          console.info( "user found " + JSON.stringify(reply) ) ;
          return done(null,false) ; // email already linked
        }

        user.create( function(userId) {
          console.info( "created user #" + userId ) ;
          var update = {
            localToken: crypto.randomBytes(16).toString('hex'),
            displayName: email,
            email: email
          } ;
          user.update_field( userId, update, function(reply) {
            console.info( "updated user with " + JSON.stringify(reply) ) ;
            user.get( userId, function(err,newUser) {
              console.info( "resulting user is " + JSON.stringify(newUser) ) ;
              done(null, reply) ;
            }) ;
          }) ;
          
        } ) ;

      }) ;
    }
  )
)  ;

app.use( function(request,response,next) {
    if ( request.isAuthenticated() )
      response.locals.user = request.user ;
  return next() ;
}) ;

var requireAuthentication = function(request,response,next) {
  if ( request.isAuthenticated() ) {
    /* good to go */
    // console.log( 'isAuthenticated: ' + JSON.stringify(request.user)) ;
    return next() ;
  } else {
    /* not authenticated yet */
    // console.info( "not authenticated yet" ) ;
    response.redirect('/auth/login') ;
  }
} ;

/**************************************** APPLICATION ****************************************/

live.use( function() { return redis.createClient( { url:process.env.REDIS_URL } ) ; }) ;

user.use(client) ;
project.use(client) ;
subject.use(client) ;
rating.use(client) ;

app.get("/", function (request, response) {
  response.render( "index" );
});

/**************************************** MISC ****************************************/

app.post('/auth/google/callback', passport.authenticate('google'), function (request, response) {
   // console.info("google callback") ;      
  response.send( request.user ) ;
});

app.post('/auth/local/create', passport.authenticate('local-signup'), function (request, response) {
  console.info("local signup") ;      
  response.redirect( '/' ) ;
});

app.post('/auth/local/authorize', passport.authenticate('local-login'), function (request, response) {
  console.info("local login") ;      
  response.redirect( '/' ) ;
});

app.get('/auth/login', function (request, response) {
  response.render( 'user/login' ) ;
});

/**************************************** USER ****************************************/

var userRoutes = express.Router() ;
app.use( '/user', requireAuthentication, userRoutes ) ;

userRoutes.get("/", function (request, response) {
  user.all( function(err,users) {
      if ( 'json' == request.accepts('html','json') )
        response.status(200).json( users );
      else
        response.render( "user/index", { users: users } );
  });
});

userRoutes.get('/:userId', function (request, response) {
  user.get( request.params.userId, function(err,reply) {
    response.render( 'user/login', { user: reply } ) ;
  }) ;
});

userRoutes.post("/:userId", function (request, response) {
  var fieldName = request.body.field ;
  var fieldValue = request.body.value ;
  var update = { } ;
  update[ fieldName ] = fieldValue ;
  user.update_field( request.params.userId, update, function(reply) {
    response.type('text/plain') ;
    response.status(200).send( reply[fieldName] );
  }) ;
});

/**************************************** PROJECT ****************************************/

var anyProjectRoutes = express.Router() ;
app.use( '/project', requireAuthentication, anyProjectRoutes ) ;

anyProjectRoutes.get("/", function (request, response) {
  project.all( function(err,projects) {
      response.render( "project/index", { projects: projects } );
  });
});

anyProjectRoutes.put("/", function (request, response) {
  project.create( function(newProjectId) {
    response.redirect( newProjectId ) ;
  }) ;
});

var projectModel = function(request,response,next) {
  request.projectId = request.params.projectId ;
  project.get( request.projectId, function(err,reply) {
    //console.info( "putting project #" + request.projectId + " in the request/response") ;
    response.locals.project = reply ;
    next() ;
  }) ;
} ;

var projectRoutes = express.Router() ;
anyProjectRoutes.use( '/:projectId', projectModel, projectRoutes ) ;

var projectParticipantModel = function(request,response,next) {
  request.participantId = request.params.participantId ;
  user.get( request.participantId, function(err,participant) {
    //console.info( "putting participant #" + request.participantId + " in the request/response") ;
    response.locals.participant = participant ;
    next() ;
  }) ;
} ;

var projectParticipantRoutes = express.Router() ;
projectRoutes.use( '/participant/:participantId', projectParticipantModel, projectParticipantRoutes ) ;


projectRoutes.get("", function (request, response) {
  response.render( "project" );
});

projectRoutes.get("/subject/", function (request, response) {
  project.getSubjects( request.projectId, function(err,subjects) {
      if ( 'json' == request.accepts('html','json') ) {
        response.status(200).json( subjects );
      } else {
        response.locals.project.subjects = subjects ;
        response.render( 'project/subjects', { subjects: subjects } ) ;
      }
    } ) ;
});

projectRoutes.put("/subject/:subjectId", function (request, response) {
  project.addSubject( request.projectId, request.params.subjectId, function(err,subject) {
    if ( 'json' == request.accepts('html','json') ) {
      response.status(200).json( subject );
    } else {
      response.render( 'subject', { subject: subject } ) ;
    }
  }) ;
});

projectRoutes.delete("/subject/:subjectId", function (request, response) {
  project.removeSubject( request.projectId, request.params.subjectId, function(err,reply) {
    if ( 'json' == request.accepts('html','json') ) {
      response.status(200).json( {} );
    } else {
      response.render( "project" );
    }
  }) ;
});


projectRoutes.get("/rating/", function (request, response) {
  project.getRatings( request.projectId, function(err,ratings) {
      if ( 'json' == request.accepts('html','json') ) {
        response.status(200).json( ratings );
      } else {
        project.get( request.projectId, function(err,project) {
          project.ratings = ratings ;
          response.render( 'project/ratings', { project: project, ratings: ratings } ) ;
        } ) ;
      }
    } ) ;
});

projectRoutes.put("/rating/:ratingId", function (request, response) {
  project.addRating( request.projectId, request.params.ratingId, function(err,reply) {
    if ( 'json' == request.accepts('html','json') ) {
      response.status(200).json( reply );
    } else {
      response.render( 'rating', { rating: reply } ) ;
    }
  }) ;
});

projectRoutes.delete("/rating/:ratingId", function (request, response) {
  project.removeRating( request.projectId, request.params.ratingId, function(err,reply) {
    if ( 'json' == request.accepts('html','json') ) {
      response.status(200).json( {} );
    } else {
      project.get( request.projectId, function(err,reply) {
        response.render( "project", { project: reply } );
    } ) ;
    }
  }) ;
});


projectRoutes.get("/participant/", function (request, response) {
  project.getParticipants( request.projectId, function(err,participants) {
      if ( 'json' == request.accepts('html','json') ) {
        response.status(200).json( participants );
      } else {
        project.get( request.projectId, function(err,project) {
          project.participants = participants ;
          response.render( 'project/participants', { project: project, participants: participants } ) ;
        } ) ;
      }
    } ) ;
});

projectParticipantRoutes.put("", function (request, response) {
  project.addParticipant( request.projectId, request.participantId, function(err,reply) {
    if ( 'json' == request.accepts('html','json') ) {
      response.status(200).json( reply );
    } else {
      response.render( 'user', { user: reply } ) ;
    }
  }) ;
});

projectParticipantRoutes.delete("", function (request, response) {
  project.removeParticipant( request.projectId, request.participantId, function(err,reply) {
    if ( 'json' == request.accepts('html','json') ) {
      response.status(200).json( {} );
    } else {
      project.get( request.projectId, function(err,reply) {
        response.render( "project", { project: reply } );
    } ) ;
    }
  }) ;
});



projectRoutes.post("", function (request, response) {
  var fieldName = request.body.field ;
  var fieldValue = request.body.value ;
  var update = { } ;
  update[ fieldName ] = fieldValue ;
  project.update_field( request.projectId, update, function(project) {
    response.type('text/plain') ;
    response.status(200).send( project[fieldName] );
  }) ;
});

projectRoutes.ws("/feedback", function (socket, request) {
  live.connect( socket, 'project-' + request.projectId ) ;
});

projectRoutes.get("/feedback", function (request, response) {
  var filter = function(a) { return true; } ;
      
  project.getParticipants( request.projectId, function(err,participants) {
    response.locals.project.participants = participants ;
    response.locals.participants = participants ;
    project.getSubjects( request.projectId, function(err,subjects) {
      response.locals.project.subjects = subjects ;
      project.getRatings( request.projectId, function(err,ratings) {
        response.locals.project.ratings = ratings ;
        project.getAnswers( request.projectId, filter, function(answers) {
          response.locals.project.answers = answers ;
          if ( 'json' == request.accepts('html','json') ) {
            response.status(200).json( answers );
          } else {
            response.render( 'project/feedback', { answers: answers } ) ;
          }
        } ) ;
      } ) ;
    } ) ;
  } );
});

projectParticipantRoutes.get("/feedback", function (request, response) {
  var filter = function(a) { return a.participantId == request.participantId ; } ;
  
  project.getParticipants( request.projectId, function(err,participants) {
    response.locals.project.participants = participants ;
    response.locals.participants = [ response.locals.participant ] ;
    project.getSubjects( request.projectId, function(err,subjects) {
      response.locals.project.subjects = subjects ;
      project.getRatings( request.projectId, function(err,ratings) {
        response.locals.project.ratings = ratings ;
        project.getAnswers( request.projectId, filter, function(answers) {
          response.locals.answers = answers ;
          if ( 'json' == request.accepts('html','json') ) {
            response.status(200).json( answers );
          } else {
            response.render( 'project/feedback', { answers: answers } ) ;
          }
        } ) ;
      } ) ;
    } );
  } );
});

projectRoutes.put("/answer/:subjectId/:ratingId", function (request, response) {
  var commit = 'false' != request.query.commit ;
  console.info("recording answer for participant #" + request.participantId ) ;
  project.addAnswer( request.projectId, request.params.subjectId, request.params.ratingId, null, request.body.value, function(value) {
      response.status(200).json( value ) ;              
  }, commit ) ;
});

projectParticipantRoutes.put("/answer/:subjectId/:ratingId", function (request, response) {
  var commit = 'false' != request.query.commit ;
  console.info("recording answer for participant #" + request.participantId ) ;
  project.addAnswer( request.projectId, request.params.subjectId, request.params.ratingId, request.participantId, request.body.value, function(value) {
      response.status(200).json( value ) ;              
  }, commit ) ;
});

projectRoutes.ws("/plot/:ratingIdHz/:ratingIdVt", function (socket, request) {
  live.connect( socket, 'project-' + request.projectId ) ;
});
        
projectParticipantRoutes.ws("/plot/:ratingIdHz/:ratingIdVt", function (socket, request) {
  live.connect( socket, 'project-' + request.projectId ) ;
});
        
projectRoutes.get( ["/plot/:ratingIdHz/:ratingIdVt", "/participant/:participantId/plot/:ratingIdHz/:ratingIdVt"], function (request, response) {
  if ( request.params.participantId ) {
    request.participantId = request.params.participantId ;
    user.get( request.participantId, function(err,participant) {
      //console.info( "putting participant #" + request.participantId + " in the request/response") ;
      response.locals.participant = participant ;
    }) ;
  }
  
  var ratingIdHz = request.params.ratingIdHz ;
  var ratingIdVt = request.params.ratingIdVt ;
  var ratingIdLabel = request.query.label ;
  var lockHz = (request.query.lock || "").split(/[^0-9]+/).indexOf(ratingIdHz) >= 0 ;
  var lockVt = (request.query.lock || "").split(/[^0-9]+/).indexOf(ratingIdVt) >= 0 ;
  var plot = {
    projectId: request.projectId,
    points: [],
    lockHz: lockHz,
    lockVt: lockVt
  } ;
  
  var filter ;
  if ( request.params.participantId )
    filter =  function(a) { return a.participantId == request.params.participantId ; } ;
  else
    filter = function(a) { return true ; } ;

  project.getParticipants( request.projectId, function(err,participants) {
    response.locals.participants = participants ;
    
    project.getSubjects( request.projectId, function(err,subjects) {
      response.locals.subjects = subjects ;

      rating.getEach( [ratingIdHz, ratingIdVt], function(err,ratings) {
        plot.hz = ratings[0] ;
        plot.vt = ratings[1] ;

        project.getAnswers( request.projectId, filter, function(answers) {
          response.locals.answers = answers ;

          for ( var i in response.locals.subjects ) {
            var subject = response.locals.subjects[i] ;
            var subjectAnswers = response.locals.answers[subject.id] ;

            plot.points.push( {
              subject: subject,
              participantId: '_',
              label: ratingIdLabel ? subjectAnswers[ratingIdLabel]['_'] : subject.name,
              hz: subjectAnswers[ratingIdHz]['_'],
              vt: subjectAnswers[ratingIdVt]['_']
            } );

            for ( var j in response.locals.participants ) {
              var participant = response.locals.participants[j] ;
              
              if ( !subjectAnswers[ratingIdHz].hasOwnProperty(participant.id) ) continue ;
              if ( !subjectAnswers[ratingIdVt].hasOwnProperty(participant.id) ) continue ;
              
              plot.points.push( {
                subject: subject,
                participantId: participant.id,
                label: ratingIdLabel ? subjectAnswers[ratingIdLabel][participant.id] : subject.name,
                hz: subjectAnswers[ratingIdHz][participant.id],
                vt: subjectAnswers[ratingIdVt][participant.id]
              } );
            }
          }

          if ( 'json' == request.accepts('html','json') ) {
            response.status(200).json( plot );
          } else {
            response.render( 'project/plot', { plot: plot } ) ;
          }

        } ) ;
      } ) ;
    } ) ;
  } ) ;
});

/**************************************** SUBJECT ****************************************/

var subjectRoutes = express.Router() ;
app.use( '/subject', requireAuthentication, subjectRoutes ) ;

subjectRoutes.get("/", function (request, response) {
  subject.all( function(err,subjects) {
      if ( 'json' == request.accepts('html','json') )
        response.status(200).json( subjects );
      else
        response.render( "subject/index", { subjects: subjects } );
  });
});

subjectRoutes.put("/", function (request, response) {
  subject.create( function(subjectId) {
    response.redirect( subjectId ) ;
  }) ;
});

subjectRoutes.get("/:subjectId", function (request, response) {
  subject.get( request.params.subjectId, function(err,subject) {
      response.render( "subject", { subject: subject } );
    } ) ;
});

subjectRoutes.post("/:subjectId", function (request, response) {
  var fieldName = request.body.field ;
  var fieldValue = request.body.value ;
  var update = { } ;
  update[ fieldName ] = fieldValue ;
  subject.update_field( request.params.subjectId, update, function(subject) {
    response.type('text/plain') ;
    response.status(200).send( subject[fieldName] );
  }) ;
});

/**************************************** RATING ****************************************/

var ratingRoutes = express.Router() ;
app.use( '/rating', requireAuthentication, ratingRoutes ) ;

ratingRoutes.get("/", function (request, response) {
  rating.all( function(err,ratings) {
      if ( 'json' == request.accepts('html','json') )
        response.status(200).json( ratings );
      else
        response.render( "rating/index", { ratings: ratings } );
  });
});

ratingRoutes.put("/", function (request, response) {
  rating.create( function(ratingId) {
    response.redirect( ratingId ) ;
  }) ;
});

ratingRoutes.get("/:ratingId", function (request, response) {
  rating.get( request.params.ratingId, function(err,rating) {
      response.render( "rating", { rating: rating } );
    } ) ;
});

ratingRoutes.post("/:ratingId", function (request, response) {
  var fieldName = request.body.field ;
  var fieldValue = request.body.value ;
  var update = { } ;
  update[ fieldName ] = fieldValue ;
  rating.update_field( request.params.ratingId, update, function(rating) {
    response.type('text/plain') ;
    response.status(200).send( rating[fieldName] );
  }) ;
});


/**************************************** STARTUP ****************************************/

var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});
