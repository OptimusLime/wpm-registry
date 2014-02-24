var Q = require('q');
var path = require('path');
var semver = require('semver');
var cuid = require('cuid');
var fstream = require('fstream');

module.exports = localStorage;

//one hour is valid
var validTime = 60*60000;

function localStorage()
{
	var self = this;

	self.inProgressUploads = {};

	self.moduleFolder = function(user, packageInfo)
	{
		return user.name + "/" + packageInfo.name;
	}

	self.moduleFilePath = function(user, packageInfo)
	{
		//tarred file location
 		return self.moduleFolder + "/" + semver.clean(packageInfo.version) + ".tar.gz";
	}

	self.prepareModuleUpload = function(user, packageInfo)
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

		var uploadURL = "/upload/" + user.username + "/" + uploadCUID;
		console.log('valid url: ' + uploadURL);

		self.inProgressUploads[uploadCUID] = {
			url: uploadURL, 
			time: Date.now(),
			valid: Date.now() + validTime,
			fileName: moduleFile, directory: moduleDir, 
			user : user.username,
			name: packageInfo.name, 
			version: semver(packageInfo.version)
		};

		success(self.inProgressUploads[uploadCUID]);

		return defer.promise;
	}

	//someone is attempting to load into us! Make sure we were informed of this (nobody is just randomly uploading something)
	//what ever shall we do

	self.approveModuleUpload = function(user, filename, uploadCUID)
	{
		var defer = Q.defer();
		var reject = function() { defer.reject.apply(defer, arguments); };
		var success = function() { defer.resolve.apply(defer, arguments); };
		
		//dodo brains

		var currentUploads = self.inProgressUploads[uploadCUID];
		//make sure the user matches the logged in user, that the filename is matched
		//and that the current time is within the valid time
		if(currentUploads.user = user.username && currentUploads.fileName == fileName && validTime - Date.now() > 0)
		{
			success({approved: true});
		}
		else
			reject({approved: false});

		return defer.promise;
	}

	self.createModuleStream = function(uploadCUID, req)
	{
		var defer = Q.defer();
		var reject = function() { defer.reject.apply(defer, arguments); };
		var success = function() { defer.resolve.apply(defer, arguments); };

		//Pull the filename, and return the writestream for the file
		var currentUploads = self.inProgressUploads[uploadCUID];

		var writer = fstream.Writer({
			path: path.resolve("../../../packages/", "./" + currentUploads.fileName)
		});

		//when it's closed, we're finished here
		writer.on("close",function()
		{
			success({success: true});
		})

		//make sure to pass on our failings, please forgive us
		writer.on("error", reject);

		//pipe the request directly into the writer
		req.pipe(writer);

		return defer.promise;
	}

	return self;
}





