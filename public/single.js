
// client-side js
// run by the browser each time your view template is loaded

// by default, you've got jQuery,
// add other scripts at the bottom of index.html


function googleSignIn(googleUser) {
  var id_token = googleUser.getAuthResponse().id_token ;
  $.ajax( ) ;
}

function googleSignInCallback(authResult) {
  if ( authResult.code ) {
    $.post('/auth/google/callback', { code: authResult.code } )
    .done(function(data) {
        $('#signinButton').hide();
      })
      ; 
  } else if (authResult.error) {
    console.log('There was an error: ' + authResult.error);
  }
}