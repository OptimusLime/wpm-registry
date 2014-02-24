// server.js

// set up ======================================================================
// get all the tools we need
var express  = require('express');
var app      = express();
var port     = process.env.PORT || 3000;
var mongoose = require('mongoose');
var passport = require('passport');
var flash    = require('connect-flash');

var configDB = require('./config/database.js');



// configuration ===============================================================
mongoose.connect(configDB.url); // connect to our database

require('./app/auth/passport.js')(passport); // pass passport for configuration

app.configure(function() {

	// set up our express application
	app.use(express.logger('dev')); // log every request to the console
	app.use(express.cookieParser()); // read cookies (needed for auth)
	//body parsing only happens for certain routes, not across the app
	// app.use(express.bodyParser()); // get information from html forms

	app.set('view engine', 'ejs'); // set up ejs for templating

	// required for passport
	app.use(express.session({ secret: 'ilovescotchscotchyscotchscotch' })); // session secret
	app.use(passport.initialize());
	app.use(passport.session()); // persistent login sessions
	app.use(flash()); // use connect-flash for flash messages stored in session

});

// routes ======================================================================
var accountRoutes = require('./app/routes/account.js')(passport); // load our routes and pass in our app and fully configured express standalone
var publishRoutes = require('./app/routes/publish.js')(passport); // load our routes and pass in our app and fully configured express standalone

//middleware to handle account login/creation
app.use(accountRoutes);

//middleware to handle publishing logic for packages
app.use(publishRoutes);




// launch ======================================================================
app.listen(port);
console.log('The magic happens on port ' + port);
