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

	self.moduleCacheName = function(userName, packageName)
	{
		return userName + "/" + packageName;
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

			var latestVersion = cachedObject.version;

			//nothing less than 0!
			latestVersion = latestVersion || "0.0.0";
			
			//send back the latest version of our object
			success(latestVersion);
		});
	
		return defer.promise;
	}

	self.getPackageCache = function(userName, packageName)
	{
		var defer = Q.defer();
		var reject = function() { defer.reject.apply(defer, arguments); };
		var success = function() { defer.resolve.apply(defer, arguments); };
			
		process.nextTick(function()
		{
			//what did we save it under .. i furgitttt
			var cacheName = self.moduleCacheName(userName, packageName);
			
			//send back the latest version of our object
			success(allPackages[cacheName]);
		});
	
		return defer.promise;
	}


	self.updatePackageCache = function(userName, packageName, cacheObject)
	{
		var defer = Q.defer();
		var reject = function() { defer.reject.apply(defer, arguments); };
		var success = function() { defer.resolve.apply(defer, arguments); };

		
		process.nextTick(function()
		{
			//we need to fetch from the cache using our information, then we update with new properites
			var cacheName = self.moduleCacheName(userName, packageName);
			
			//all in memory, so jsut check updated our cache object
			allPackages[cacheName] = cacheObject;

			console.log(allPackages);

			//done updating cache let it be known
			success({success:true});

		});


		return defer.promise;

	}



	return self;
}