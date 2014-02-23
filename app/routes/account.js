var express = require('express'); 
var User = require('../models/user.js')

module.exports = function(passport) {

	//we create an express app that simply handles the account creation side of the registry
	//it will be paired with other routes in other apps
	//this way, all sections of the app can remain separate testable express apps
	var app = express();

	//make sure body objects are parsed
	//app.use(express.bodyParser());

	// =============================================================================
	// Check Username and E-mail ===================================================
	// =============================================================================

	app.get('/username/:username', function(req, res)
	{
		//count how many users with that id
		var username = req.params.username;

		//do a user count on individuals with that name
		//return whether or not it exists
		User.count({username:username}, function(err, count)
		{
			var usernameExists = count > 0;
			res.json({exists: usernameExists});
		});
	});

	app.get('/email/:email', function(req, res)
	{
		//count how many users with that id
		var email = req.params.email;

		//do a user count on individuals with that name
		//return whether or not it exists
		User.count({email:email}, function(err, count)
		{
			var emailExists = count > 0;
			res.json({exists: emailExists, email: email});
		});
	});

	// =============================================================================
	// AUTHENTICATE (FIRST LOGIN) ==================================================
	// =============================================================================

	app.post('/login', passport.authenticate('login', {
		session : 'false',
		//failureRedirect : '/signup', // redirect back to the signup page if there is an error
		failureFlash : true // allow flash messages
	}), function(req, res)
	{
		console.log('login finished, authentication successful');
		var authenticated =  req.isAuthenticated();
		res.json({success: authenticated});
	});


	// process the signup form
	app.post('/signup', passport.authenticate('signup', {
		session : 'false',
		failureFlash : true // allow flash messages
	}), function(req, res)
	{
		console.log('Signup body info after the fact: ');
		console.log(req.body);
		var authenticated =  req.isAuthenticated();
		res.json({success: authenticated});
	});

	//pass back our express application routes
	return app;
};