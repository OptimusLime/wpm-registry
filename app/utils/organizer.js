
//the organizer is a global objects that handles packages storage and update logic
//the organizer will be given a certain type of storage object that
//can be switched out in the future without affecting the overall logic here
//The immediate plan is to have a local storage, and S3 storage class
var organizer = {};

var Q = require('q');
var semver = require('semver');

module.exports = organizer;

var cacheManager, storageManager;

var publishErrors = 
{
	WrongUser : {errno: 2000, code: 2000, message: "Module URL doesn't match authenticated user."},
	SameVersion : {errno: 3000,code: 3000, message: "Version published is identical to latest. Increment to publish or use -f."},
	PriorVersion : {errno: 4000,code: 4000, message: "Version being published is earlier than latest version."},
	UnknownVersion : {errno: 5000,code: 5000, message: "Unexpected code hit. Version number is confusing the registry."},
	UnapprovedUpload : {errno: 6000,code: 6000, message: "Error with the desired upload. Rejected for being unapproved."},
	UnknownUpload : {errno: 7000,code: 7000, message: "Unknown upload error."},
	UnknownConfirmError : {errno: 8000,code: 8000, message: "Unknown confirm error."},


};

var approveAuthority = function(user, postedUser)
{
	//the two must be equal
	return user.username == postedUser.username;
}


organizer.setCacheAndStorage = function(cManager, sManager)
{
	cacheManager = cManager;
	storageManager = sManager;
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
			console.log('Checking latest: ', latest, " submitted: ", packageInfo.version);

			//if the latest version is this version, then i'll be damned
			//don't let it through unless it's forced it's way in			
			if(latest == semver.clean(packageInfo.version))
			{
				console.log("Same version submitted :/ -- reject!");

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


organizer.completePackageUpload = function(req, user, params)
{

	var defer = Q.defer();

	var reject = function() { defer.reject.apply(defer, arguments); };
	var success = function() { defer.resolve.apply(defer, arguments); };

	//for skipping later events and sending a rejection at the end
	//q doesn't have a good way to do this, it would seem
	//maybe I should just throw the error?
	var rejectError;


	//pipe the package to the appropriate place
	storageManager.approveModuleUpload(req, user, params)
		.then(function(approval) {

			console.log('Finisehd with checking approval: ', approval);

			if (approval.approved) {
				console.log('Looking to complete upload');
				//it's been approved, let's do the upload dance
				return storageManager.completePackageUpload(req, user, params);
			} else {
				//oops, rejected! Perhaps foul play is suspected
				//mwahahahahaha
				rejectError = publishErrors.UnapprovedUpload;
				return;
			}
		})
		.done(function(uploadCompleted) {
			
			//we were rejected in a previous step
			if(rejectError)
				reject(rejectError);
			//a success! all uploaded :)
			else if(uploadCompleted.success)
				success(uploadCompleted);
			//didn't succeed in upload, but didn't  get rejected, woops
			else
				reject(publishErrors.UnknownUpload);

		}, function(err) {
			reject(err);
		});

	return defer.promise;
}

organizer.confirmPackageUpload = function(req, user, params)
{

	var defer = Q.defer();

	var reject = function() { defer.reject.apply(defer, arguments); };
	var success = function() { defer.resolve.apply(defer, arguments); };

	//for skipping later events and sending a rejection at the end
	//q doesn't have a good way to do this, it would seem
	//maybe I should just throw the error?
	var rejectError;


	//pipe the package to the appropriate place
	storageManager.confirmPackageUpload(req, user, params)
		.done(function(uploadCompleted) {
			
			//a success! all uploaded :)
			if(uploadCompleted.confirmed)
				success({success:true});
			//didn't succeed in upload, but didn't  get rejected, woops
			else
				reject(publishErrors.UnknownConfirmError);

		}, function(err) {
			reject(err);
		});

	return defer.promise;
}

