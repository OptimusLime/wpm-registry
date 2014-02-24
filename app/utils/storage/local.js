var Q = require('q');
var path = require('path');
var semver = require('semver');
var cuid = require('cuid');
var fstream = require('fstream');

var qUtils = require("../qUtils.js");

module.exports = localStorage;

//one hour is valid
var validTime = 60*60000;

function localStorage()
{
	var self = this;

	self.inProgressUploads = {};
	var uploadRouteBase = "/upload";
	self.expressApproveRoute = function()
	{
		return '/packages/:username/:moduleName';
	}

	self.expressUploadRoute = function()
	{
		return uploadRouteBase + '/:username/:uploadCUID';
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
			checksum : checksum
		};

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
		if(currentUploads.user = user.username && validTime - Date.now() > 0)
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

		console.log("Write to: ", path.resolve(__dirname, "../../../packages/", "./" + currentUploads.fileName));

		var uploadPath = path.resolve(__dirname, "../../../packages/", "./" + currentUploads.fileName);
		var writer = fstream.Writer({
			path: uploadPath
		});


		var checkWriteFinished = function()
		{
			if(writerFinished)
			{
				console.log('Official close check: ');
				console.log(fileChecksum);
				console.log("Previously promised xsum: ", promisedChecksum);

				//now we verify with a checksum that was provided
				if(fileChecksum == promisedChecksum)
					success({success: true});
				else
					reject({success: false, error: "Checksums do not match."});
			}
			else
				writerFinished = true;	

		}

		//we'll pipe the write stream into the checksum, verifying the value at the end
		// qUtils.qMD5ChecksumStream(writer)
		// 	.done(function(check)
		// 	{
		// 		console.log('Finished md5 steam sum: ', check);
		// 		fileChecksum = check;
		// 		checkWriteFinished();
		// 	}, reject);


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
					if(sum == promisedChecksum)
						success({success: true});
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

	return self;
}





