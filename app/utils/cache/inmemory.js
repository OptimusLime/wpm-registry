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

	self.setStorageManager = function(storageManager)
	{
		self.storageManager = storageManager;
	}

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
			
		self.getPackageCache(userName, packageName)
			.then(function(cachedObject)
			{
				// console.log('Cached: ', cachedObject);

				//two reasons: it doesn't exist, or it's a cold start
				if(!cachedObject)
				{
					//we dont' have a cached object (and we attempted to load from storage)
					//therefore, this doesn't exists
					reject({success:false, error: "No cache object returned, must have been a storage loading error."});
				}
				else
				{
					//the cached object might be empty, we still return a reasonable version (undefined will cause issues)
					var latestVersion = cachedObject.version;

					//nothing less than 0!
					latestVersion = latestVersion || "0.0.0";
					
					//send back the latest version of our object
					success(latestVersion);
				}
			})
		
		return defer.promise;
	}

	self.getPackageCache = function(userName, packageName)
	{
		var defer = Q.defer();
		var reject = function() { defer.reject.apply(defer, arguments); };
		var success = function() { defer.resolve.apply(defer, arguments); };
			
		//what did we save it under .. i furgitttt
		var cacheName = self.moduleCacheName(userName, packageName);
		
		var cachedObject = allPackages[cacheName];

		if(!cachedObject)
		{
			// console.log('Pull information from storage: ', userName, ":", packageName)

			//let's try pulling from the storage manager (which has presumably has information stored)
			self.storageManager.pullPackageInformation(userName, packageName)
				.done(function(packageInfo)
				{
					// console.log('Package info returned: ', packageInfo);

					//if it's not empty, we've got an object
					//either way, we need to update the cache so that the next call will not return 
					//an empty cache object -- just warming up the cache
					self.updatePackageCache(userName, packageName, packageInfo)
						.done(function(valid)
							{
								// console.log('Package cache updated, finished version call');
								//package updated, return required inforation
								if(valid.success)
								{
									//either we have a valid package -- or this is empty
									success(packageInfo);
								}
								else
									reject({error: "Failed to update package cache while warming up cache"});

							}, 
							reject);

				}, reject)
		}
		else
		{
			success(cachedObject);
		}

		//send back the latest version of our object
		//success(allPackages[cacheName]);
	
		return defer.promise;
	}


	self.updatePackageCache = function(userName, packageName, cacheObject)
	{
		var defer = Q.defer();
		var reject = function() { defer.reject.apply(defer, arguments); };
		var success = function() { defer.resolve.apply(defer, arguments); };

		
		process.nextTick(function()
		{
			//we need to fetch from the cache using our information, then we update with new properties
			var cacheName = self.moduleCacheName(userName, packageName);
			
			//all in memory, so jsut check updated our cache object
			allPackages[cacheName] = cacheObject;

			// console.log(allPackages);

			//done updating cache let it be known
			success({success:true});

		});


		return defer.promise;

	}



	return self;
}