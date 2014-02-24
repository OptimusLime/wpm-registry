var express = require('express'); 
var User = require('../models/user.js')
var organizer = require('../utils/organizer.js');
var qUtils = require('../utils/qUtils.js');

module.exports = function(passport) {

	//we create an express app to handle publishing logic
	var app = express();

	//make sure body objects are parsed
	//app.use(express.bodyParser());

	// =============================================================================
	// Initiate Desire to Upload Package ===========================================
	// =============================================================================

	app.post('/packages/:username/:moduleName', passport.authenticate('login', {
		session : 'false',
		//failureRedirect : '/signup', // redirect back to the signup page if there is an error
		failureFlash : true // allow flash messages
	}), express.bodyParser(), function(req, res)
	{
		//we need to know if we're allowed to publish this object in the first place

		var packageInfo = req.body.properties;

		var postedUser = {username: req.params.username, module: req.params.moduleName};
		var packFileName = req.body.fileName;
		var checksum = req.body.checksum;
		var commandOptions = req.body.options;

		organizer.approveModuleUpload(req.user, postedUser, packageInfo, commandOptions)
			.then(function()
			{
				//we wouldn't be here if it wasn't approved (we would have been rejected with an error)

				//now we need to figure out what to tell wpm for uploading the project
				return organizer.prepareModuleUpload(req.user, packageInfo, checksum);
			})
			.done(function(uploadParams)
			{	
				res.json({success: true, parameters: uploadParams});
			}, 
			function(err)
			{
				res.json({success: false, error: err});
			});		
	});

	app.post('/email/:email', function(req, res)
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