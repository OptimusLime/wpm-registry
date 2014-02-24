var Q = require('q');
var path = require('path');
var semver = require('semver');
var cuid = require('cuid');
var fstream = require('fstream');

module.exports = inMemoryCache;

function inMemoryCache()
{
	var self = this;

	var allPackages = {};

	self.moduleCacheName = function(username, packageName)
	{
		return username + "/" + packageName;
	}

	//retrieve the latest information about a particular package
	self.getLatestVersion = function(userName, packageName)
	{
		var defer = Q.defer();
		var reject = function() { defer.reject.apply(defer, arguments); };
		var success = function() { defer.resolve.apply(defer, arguments); };
			
		process.nextTick(function()
		{
			var cacheName = self.moduleCacheName(userName, packageName);
			console.log('Checking for latest of: ', cacheName);
			var cachedObject = allPackages[cacheName]; 
			cachedObject = cachedObject || {};

			var latestVersion = cachedObject.latest;

			//nothing less than 0!
			latestVersion = latestVersion || "0.0.0";
			
			//send back the latest version of our object
			success(latestVersion);
		});
	
		return defer.promise;
	}

	return self;
}