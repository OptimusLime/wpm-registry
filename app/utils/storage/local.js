var Q = require('q');
var path = require('path');
var semver = require('semver');
var cuid = require('cuid');
var fstream = require('fstream');
var fs = require('fs-extra');
var Error = require ("errno-codes");

var qUtils = require("../qUtils.js");

module.exports = localStorage;

//one hour is valid
var validTime = 60*60000;

function localStorage()
{
	var self = this;

	//storage needs to know about the cache manager for storing/retrieving package info
	//does't need to know the cache type, only certain functions


	self.inProgressUploads = {};

	var uploadRouteBase = "/upload";
	var confirmRouteBase = "/confirm";
	var packageBase = '/packages/:username/:moduleName';

	var packageSaveLocation = path.resolve(__dirname, "../../../packages/");

	self.setCacheManager = function(cacheManager)
	{
		self.cacheManager = cacheManager;
	}

	//where should we got to download a package
	self.expressGetPackageRoute = function()
	{
		return packageBase + "/:version";
	}

	//approve is roughly the same place as get (just get vs post)
	self.expressApproveRoute = function()
	{
		return packageBase;
	}

	self.expressUploadRoute = function()
	{
		return uploadRouteBase + '/:username/:uploadCUID';
	}

	self.expressConfirmRoute = function()
	{
		return confirmRouteBase + '/:username/:uploadCUID';
	}

	self.moduleSaveDirectory = function(userName, packageName)
	{
		return packageSaveLocation + "/" + userName + "/" + packageName;
	}

	self.moduleFolder = function(user, packageInfo)
	{
		return user.username + "/" + packageInfo.name;
	}

	self.moduleFilePath = function(user, packageInfo)
	{
		//tarred file location
 		return self.moduleFolder(user, packageInfo) + "/" + semver.clean(packageInfo.version) + ".tar.gz";
	}

	self.prepareModuleUpload = function(user, packageInfo, checksum)
	{		
		var defer = Q.defer();
		var reject = function() { defer.reject.apply(defer, arguments); };
		var success = function() { defer.resolve.apply(defer, arguments); };
		
		//we need to cache the upload, and designate an area for it

		//we'll catch post headers for uploads, and validate them against storage
		//that way, you can only do an upload after a server handshake (so we know what's being uploaded)
		var moduleDir = self.moduleFolder(user, packageInfo);
		var moduleFile = self.moduleFilePath(user, packageInfo);

		//module file is the actual location we're attempting to write

		var uploadCUID = cuid();

		var uploadURL = uploadRouteBase + "/" + user.username + "/" + uploadCUID;
		console.log('valid url: ' + uploadURL);

		//need checksum to verify integrity of upload
		if(checksum  == undefined)
		{
			reject({success:false, error: "Checksum not provided"});
			return;
		}

		self.inProgressUploads[uploadCUID] = {
			url: uploadURL, 
			time: Date.now(),
			valid: Date.now() + validTime,
			fileName: moduleFile, directory: moduleDir, 
			user : user.username,
			name: packageInfo.name, 
			version: semver.clean(packageInfo.version),
			properites : packageInfo,
			checksum : checksum
		};
		// console.log("Perpare: ", self.inProgressUploads[uploadCUID]);

		success(self.inProgressUploads[uploadCUID]);

		return defer.promise;
	}

	//someone is attempting to load into us! Make sure we were informed of this (nobody is just randomly uploading something)
	//what ever shall we do

	self.approveModuleUpload = function(req, user, params)
	{
		var defer = Q.defer();
		var reject = function() { defer.reject.apply(defer, arguments); };
		var success = function() { defer.resolve.apply(defer, arguments); };
		
		//dodo brains
		var uploadCUID = params.uploadCUID;

		var currentUploads = self.inProgressUploads[uploadCUID];
		if(!currentUploads)
		{
			reject({success: false, error: "CUID doesn't match any known upload requests."});
			return;
		}

		//make sure this is done within a certain period of time
		var validTime = currentUploads.valid;

		//make sure the user matches the logged in user, that the filename is matched
		//and that the current time is within the valid time
		if(currentUploads.user == user.username && validTime - Date.now() > 0)
		{
			success({approved: true});
		}
		else
			reject({approved: false});

		return defer.promise;
	}

	self.completePackageUpload = function(req, user, params)
	{
		var defer = Q.defer();
		//only call reject or success one time
		var callOnce = false;

		var reject = function() { if(!callOnce){ callOnce = true; defer.reject.apply(defer, arguments);} };
		var success = function() {  if(!callOnce){ callOnce = true; defer.resolve.apply(defer, arguments);} };

		var writerFinished = false;
		var fileChecksum;

		var uploadCUID = params.uploadCUID;
		if(!uploadCUID)
		{
			reject({success: false, error: "No upload CUID provided."});
			return;
		}

		//Pull the filename, and return the writestream for the file
		var currentUploads = self.inProgressUploads[uploadCUID];
		var promisedChecksum = currentUploads.checksum;

		if(!currentUploads)
		{
			reject({success: false, error: "CUID doesn't match any known upload requests."});
			return;
		}

		console.log("Write to: ", path.resolve(packageSaveLocation, "./" + currentUploads.fileName));

		var uploadPath = path.resolve(packageSaveLocation, "./" + currentUploads.fileName);
		var writer = fstream.Writer({
			path: uploadPath
		});


		//we will almost be done
		//after the upload is successfully completed, the client then sends a confirm request to verify the new upload

		//we do this because in the event that the storage is being done outside the server (e.g. S3), we won't
		//know when the package has been confirmed uploaded without some crazy logic

		//instead the client will inform us it's done, and we'll check their work
		var confirmURL = confirmRouteBase + "/" + user.username + "/" + uploadCUID;

		console.log('valid url: ' + confirmURL);

		//when it's closed, we're finished here
		writer.on("close",function()
		{
			console.log('Close called')
			qUtils.qMD5Checksum(uploadPath)
				.done(function(sum)
				{
					console.log('Official close check: ');
					console.log(sum);
					console.log("Previously promised xsum: ", promisedChecksum);
					if(sum == promisedChecksum){

						//before we return true, we update our cache with confirmation
						currentUploads.validUpload = true;
						success({success: true, parameters: {confirmURL: confirmURL}});
					}
					else
						reject({success: false, error: "Checksums do not match."});
				},  //if error we reject immediately
				reject);

			//checkWriteFinished();
		});

		//make sure to pass on our failings, please forgive us
		writer.on("error", reject);

		//pipe the request directly into the writer
		req.pipe(writer);

		return defer.promise;
	}


	var createPackage = function(userName, packageName, packagePropertiesJSON, storageProperties)
	{
		var latestVersion = semver.clean(packagePropertiesJSON.version);

		return {
			name: packageName,
			packageOwner : userName,
			properites : packagePropertiesJSON,
			version : latestVersion,
			location : 
			{
				url: storageProperties.url,
				md5Checksum : storageProperties.md5Checksum
			},
			versions : [latestVersion]
		};
	}

	var mergePackageHistory = function(oldPackageInfo, newPackageInfo)
	{
		newPackageInfo.versions = oldPackageInfo.versions.slice();
		newPackageInfo.versions.push(newPackageInfo.latest);

		return;
	}

	//Pull an individual packages history (useful for a cache miss)
	self.pullPackageInformation = function(userName, packageName)
	{
		var defer = Q.defer();
		var reject = function() { defer.reject.apply(defer, arguments); };
		var success = function() { defer.resolve.apply(defer, arguments); };
		
		var packageDir = self.moduleSaveDirectory(userName, packageName);
		var packageInfoFile = packageDir + "/history";

		// console.log("Pullin package info: ", packageInfoFile);

		//pull the history, read it as json
		//packageInfo has everything we need, send it on it's way
		qUtils.qReadJSON(packageInfoFile)
			.done(function(packageInfo)
			{
				// console.log('JSON Read returned');
				success(packageInfo);
			}, 
			function(err)
			{
				// console.log('Oops error reading history');

				//otherwise, it's a miss (if the file doesn't exist)
				if(err.errno == Error.ENOENT.errno)
				{
					//no file? then return empty package
					success({});
				}
				else
					reject(err);
			})
	
		return defer.promise;
	}




	//confirm that the package was uploaded properly (useful for when the upload wasn't done to this server)
	//will update the cache with the new version information
	self.confirmPackageUpload = function(req, user, params)
	{
		var defer = Q.defer();
		var reject = function() {
			defer.reject.apply(defer, arguments);
		};
		var success = function() {
			defer.resolve.apply(defer, arguments);
		};

		//check that our cache knows of the upload
		var uploadCUID = params.uploadCUID;
		if(!uploadCUID)
		{
			reject({success: false, error: "No upload CUID provided."});
			return;
		}

		var currentUploads = self.inProgressUploads[uploadCUID];
		if(!currentUploads)
		{
			reject({success: false, error: "CUID doesn't match any known upload requests."});
			return;
		}

		//check the cache for whether or not the upload is valid
		//in this case, it's a simply memory lookup, but it'll be more complicated in the future
		if (currentUploads.validUpload) {

			//lets create our cache object
			//check previous object exists
			self.cacheManager.getPackageCache(currentUploads.user, currentUploads.name)
				.done(function(oldPackage) {

					console.log("Confirmed upload: ",currentUploads);
					//we're going to make a new cache item
					var newPackage = createPackage(
						currentUploads.user,
						currentUploads.name,
						currentUploads.properites, {
							url: "/packages/" + currentUploads.fileName,
							md5Checksum: currentUploads.checksum
						}
					);

					//if we had a previous package, we need to match the two
					if (oldPackage) {
						//handle any versioning stuff that needs to be done
						mergePackageHistory(oldPackage, newPackage);
					}

					//we have our object, let's save that history
					var packageDir = self.moduleSaveDirectory(currentUploads.user, currentUploads.name);//packageSaveLocation + "/" + currentUploads.user + "/" + currentUploads.name;

					//write the latest information to file
					//this is for long term storage -- and for loading up information for preparing the cache
					var writeError = fs.outputJsonSync(packageDir + "/history", newPackage);

					//ready to update the cache
					self.cacheManager.updatePackageCache(currentUploads.user, currentUploads.name, newPackage)
						.done(function()
						{
							//send back confirmation
							success({
								confirmed: true
							});

							//reject if necessary on error
						}, reject);

				}, reject);
		} else
			reject({
				confirmed: false
			});

		return defer.promise;
	}


	self.sendModule = function(req, res)
	{
		//storage manager will handle sending the module back to the response
			
		var moduleParams = req.params;

		var userName = req.params.username;
		var moduleName = req.params.moduleName;
		var version = req.params.version;

		var streamToResponse = function()
		{
			var moduleLocation = self.moduleSaveDirectory(userName, moduleName) + "/" + semver(version) +  ".tar.gz";
			console.log('Streaming: ', moduleLocation);

			var reader = fstream.Reader(
			{
				path : moduleLocation
			});

			reader.on("error", function(err)
			{
				res.status(err.status || 500);
				return;
			})

			reader.on("end", function()
			{
				//we're done as well, if we need to do a callback, it goes here
			})

			//pipe the file into our response stream
			reader.pipe(res);
		}

		//if the version is not supplied or == "*", we must pull the latest 

		if(!version || version == "*")
		{
			console.log('Checking cache: ', userName, moduleName, version);

			self.cacheManager.getPackageCache(userName, moduleName)
				.then(function(cachedObject)
				{
					console.log('Cache response: ', cachedObject);

					//if the cached object doesn't exist -- then this package doesn't exist
					if (Object.getOwnPropertyNames(cachedObject).length == 0)
					{
						reject({failed: true, error: "Package doesn't exist."});
						return;
					}

					//now we have the latest information
					version = cachedObject.version;

					
					streamToResponse();
				}, function(err)
				{
					console.log("Package cache error: ",err);
					res.status(err.status || 500);
					return;
				});
		}
		else
		{
			//we have the version (and it's a valid version number)
			//let's pull it according to our system

			streamToResponse();

		}




	}
	

	return self;
}





