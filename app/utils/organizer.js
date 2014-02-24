
//the organizer is a global objects that handles packages storage and update logic
//the organizer will be given a certain type of storage object that
//can be switched out in the future without affecting the overall logic here
//The immediate plan is to have a local storage, and S3 storage class
var organizer = {};

var Q = require('q');
var semver = require('semver');

module.exports = organizer;

var storageManager = require('./storage/local.js')();
var cacheManager = require('./cache/inmemory.js')();

var publishErrors = 
{
	WrongUser : {code: 2000, message: "Module URL doesn't match authenticated user."},
	SameVersion : {code: 3000, message: "Version published is identical to latest. Increment to publish or use -f."},
	PriorVersion : {code: 4000, message: "Version being published is earlier than latest version."},
	UnknownVersion : {code: 5000, message: "Unexpected code hit. Version number is confusing the registry."}

};

var approveAuthority = function(user, postedUser)
{
	//the two must be equal
	return user.username == postedUser.username;
}

//method handles simply approving if a package can be uploaded (given the latest version vs desired new version)
organizer.approveModuleUpload = function(currentUser, postedUser, packageInfo, commandOptions)
{
	var defer = Q.defer();
	var reject = function() { defer.reject.apply(defer, arguments); };
	var success = function() { defer.resolve.apply(defer, arguments); };
	commandOptions = commandOptions || {};

	//first we need to authenticate the user
	if(!approveAuthority)
	{	
		reject(publishErrors.WrongUser);
		return;
	}

	//what's the latest known version of this object?
	cacheManager.getLatestVersion(currentUser.username, packageInfo.name)
		.done(function(latest)
		{
			//if the latest version is this version, then i'll be damned
			//don't let it through unless it's forced it's way in			
			if(latest == semver.clean(packageInfo.version))
			{
				if(commandOptions.force)
				{
					//been told to override
					success({approved:true});
				}
				else
				{
					//reject for being the same version
					reject(publishErrors.SameVersion);
					return;					
				}

			}
			else if(semver.gt(latest, semver.clean(packageInfo.version)))
			{
				//you cannot update a previous version, this would be like trying to change the past
				//might reconsider in the future, if it's necessary -- safer this way. 
				//want a new version? Update the latest version. 
				reject(publishErrors.PriorVersion);
				return;	
			}
			else if(semver.gt(semver.clean(packageInfo.version), latest))
			{
				//otherwise if you're greater than the latest, you're fit to continue
				success({approved:true});
			}
			else
			{
				reject(publishErrors.UnknownVersion)
			}

		});

	return defer.promise;
}

organizer.prepareModuleUpload = function(currentUser, packageInfo, checksum)
{
	var defer = Q.defer();
	var reject = function() { defer.reject.apply(defer, arguments); };
	var success = function() { defer.resolve.apply(defer, arguments); };
	
	//now we need to advise the client on where to send the package information
	storageManager.prepareModuleUpload(currentUser, packageInfo, checksum)
		.done(function(uploadParams)
		{
			success(uploadParams);
		},function(err)
		{
			reject(err);
		});

	return defer.promise;
}



